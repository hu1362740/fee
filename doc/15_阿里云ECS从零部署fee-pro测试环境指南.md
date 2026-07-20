# 阿里云 ECS 从零部署 fee-pro 测试环境指南

> 适用场景：阿里云 ECS 单机测试环境。  
> 当前服务器信息：Ubuntu 26.04 64 位，2 核 vCPU，4 GiB 内存，公网 IP `8.138.93.199`，内网 IP `172.17.62.99`，公网带宽 1 Mbps。  
> 编写日期：2026-07-16。

## 一、部署目标与选择

本指南采用单机测试部署：

```text
浏览器 / SDK
  -> Nginx:80
      -> /dig                 写 /var/log/nginx/fee-access.log，返回 1px 图片
      -> /api/*               代理到 Node server:3000
      -> /project/:id/api/*   代理到 Node server:3000
      -> /                    托管 client/dist

Task:Manager
  -> SaveLog:Nginx 读取 fee-access.log
  -> 写入 server/log/kafka/raw 和 server/log/kafka/json
  -> Parse / Summary 命令入库
  -> MySQL/MariaDB 展示给 client
```

测试环境先不引入 Kafka，原因是这台 ECS 只有 2 核 4 GiB、1 Mbps 带宽，单机 Nginx 日志链路更容易跑通和排查。后续数据量上来后，再把 `server/src/configs/common.js` 的 `use.kafka` 打开并单独部署 Kafka。

本指南默认：

- 项目部署目录：`/opt/fee-pro`
- 后端运行环境：`NODE_ENV=testing`
- Node.js：`12.22.12`
- 进程管理：`PM2 5.x`
- 数据库：推荐 MariaDB，作为 MySQL 协议兼容数据库；如需使用 MySQL 8.0.12，见本文 `5.3`
- Redis：仅监听本机，不设置密码
- 对公网只开放 `22`、`80`，可选 `443`
- 不对公网开放 `3000`、`3306`、`6379`

> 为什么测试环境推荐 MariaDB：当前项目使用较老的 `mysql@2.15.0` 驱动。Ubuntu 新版仓库里的 MySQL 8.x 默认认证方式可能和旧驱动不兼容，容易出现 `ER_NOT_SUPPORTED_AUTH_MODE`。MariaDB 对这个老项目更省心。若公司必须使用 MySQL 8.x，或希望和本地 Windows 的 MySQL 8.0.12 对齐，见本文 `5.3` 和 `18.2`。

## 二、阿里云控制台准备

### 2.1 配置安全组

进入 ECS 实例的安全组，入方向建议如下：

| 端口 | 协议 | 来源 | 说明 |
| --- | --- | --- | --- |
| `22` | TCP | 你的办公出口 IP，临时也可 `0.0.0.0/0` | SSH 登录 |
| `80` | TCP | `0.0.0.0/0` | Web、API 代理、SDK 打点 |
| `443` | TCP | `0.0.0.0/0` | 后续配置 HTTPS 时使用 |

也可以直接在阿里云控制台界面操作：进入 `云服务器 ECS -> 网络与安全 -> 安全组 -> 安全组详情 -> 访问规则 -> 入方向 -> 增加规则`，按上表添加规则即可。一般填写：

- 授权策略：`允许`
- 优先级：保持默认 `100` 即可
- 协议类型：`自定义 TCP`
- 端口范围：分别填写 `22/22`、`80/80`、`443/443`
- 授权对象：`22` 建议填你的固定公网出口 IP，例如 `x.x.x.x/32`；`80` 和 `443` 可以填 `0.0.0.0/0`
- 描述：写清用途，例如 `SSH`、`HTTP`、`HTTPS`

不要在安全组放开：

- `3000`：Node 后端只给 Nginx 本机代理。
- `3306`：数据库只允许本机访问。
- `6379`：Redis 只允许本机访问。
- `3389`：这是 Windows RDP 远程桌面端口，Ubuntu 测试机一般不需要；如果默认安全组里已有 `RDP(3389)` 且来源是 `0.0.0.0/0`，建议删除。

### 2.2 准备 SSH 登录

在本机终端执行：

```bash
ssh root@8.138.93.199
```

如果你使用密钥登录：

```bash
ssh -i ~/.ssh/your-ecs-key.pem root@8.138.93.199
```

登录后建议先创建普通部署用户，后续不要长期用 root 跑应用：

```bash
adduser fee
usermod -aG sudo fee
su - fee
```

后续命令默认在 `fee` 用户下执行；需要系统权限的命令使用 `sudo`。

## 三、系统初始化

### 3.1 更新系统与基础工具

```bash
sudo apt update
sudo apt upgrade -y
sudo timedatectl set-timezone Asia/Shanghai
timedatectl
```

安装常用工具、编译工具和 native npm 包依赖：

```bash
sudo apt install -y \
  curl wget git vim unzip ca-certificates \
  build-essential make g++ python3 python-is-python3 pkg-config \
  net-tools lsof htop \
  nginx mariadb-server redis-server librdkafka-dev
```

说明：

- `build-essential`、`python3`、`librdkafka-dev` 用于安装服务端依赖中的 native 包，尤其是 `node-rdkafka`。
- 当前项目即使先不使用 Kafka，代码中也会 import `node-rdkafka`，所以服务端依赖不要只装 production 依赖。

### 3.2 增加 2 GiB swap

2 核 4 GiB 构建前端一般够用，但 `npm install` 和 `npm run build` 偶尔会吃紧，建议加 swap。

```bash
free -h
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### 3.3 配置系统防火墙

阿里云安全组是第一层，Ubuntu `ufw` 是第二层。

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

这些命令的基本格式是：

```bash
sudo ufw allow <服务名>
sudo ufw allow <端口>/<协议>
sudo ufw enable
sudo ufw status verbose
```

逐条说明：

| 命令 | 含义 | 作用 |
| --- | --- | --- |
| `sudo ufw allow OpenSSH` | 放行 `OpenSSH` 应用配置 | 通常等价于放行 SSH 的 `22/tcp`，避免启用防火墙后把当前 SSH 连接挡在外面 |
| `sudo ufw allow 80/tcp` | 放行 TCP `80` 端口 | 允许外部访问 HTTP，Nginx 对外提供 Web、API 代理和 SDK 打点入口需要它 |
| `sudo ufw allow 443/tcp` | 放行 TCP `443` 端口 | 允许外部访问 HTTPS；如果暂时不配置 HTTPS，可以先不放行，等配置证书时再执行 |
| `sudo ufw enable` | 启用 UFW 防火墙 | 启用后默认拒绝未放行的入站连接，已放行的 `22`、`80`、`443` 仍可访问 |
| `sudo ufw status verbose` | 查看详细状态 | 确认 UFW 是否 active、默认策略是什么、哪些端口已经放行 |

是否必须执行：

- 如果你已经在阿里云安全组中只放开了 `22`、`80` 和必要的 `443`，不启用 `ufw` 也可以跑通测试环境。
- 仍然建议启用 `ufw`，因为它是服务器系统内部的第二层保护。即使后续安全组被误放开了 `3000`、`3306`、`6379`，UFW 也能继续挡住未放行端口。
- 启用 `ufw` 前必须先放行 SSH。若 SSH 端口不是 `22`，请先执行 `sudo ufw allow <你的SSH端口>/tcp`，再执行 `sudo ufw enable`，否则可能把自己锁在服务器外面。

阿里云控制台能配置的是“安全组”，不能直接替代服务器内部的 `ufw`。两者关系如下：

- 安全组：阿里云侧的云防火墙，在流量到达 ECS 操作系统前先生效；可通过控制台界面配置。
- UFW：Ubuntu 系统内的主机防火墙，在 ECS 操作系统内部生效；需要通过 SSH、Workbench 远程终端或其他登录方式在服务器里执行命令。
- 如果同时启用了安全组和 UFW，一个端口必须两边都允许才可以从公网访问。

因此有两种做法：

1. 简化做法：只配置阿里云安全组，暂时不启用 UFW。适合刚开始部署、担心误操作导致 SSH 断开的情况。
2. 推荐做法：先在安全组放通 `22`、`80`、可选 `443`，再在 Ubuntu 内执行上面的 UFW 命令，形成两层防护。

## 四、安装 Node.js 与 PM2

本项目依赖较老，建议固定 Node.js `12.22.12`，不要直接用系统仓库最新版 Node。

### 4.1 安装 nvm 和 Node.js 12

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

nvm install 12.22.12
nvm alias default 12.22.12
nvm use 12.22.12

node -v
npm -v
```

预期：

```text
v12.22.12
6.x.x
```

这些命令分两组：前 3 行用于安装并加载 `nvm`，后面几行用于安装、选择和验证 Node.js 版本。基本格式如下：

```bash
curl <参数> <脚本地址> | bash
export <变量名>=<变量值>
[ -s <文件路径> ] && . <文件路径>

nvm install <Node版本号>
nvm alias default <Node版本号>
nvm use <Node版本号>

node -v
npm -v
```

逐条说明：

| 命令 | 含义 | 作用 |
| --- | --- | --- |
| `curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh \| bash` | 下载 nvm 安装脚本并交给 `bash` 执行 | 安装 nvm。`-f` 表示请求失败时直接失败，`-sS` 表示静默但显示错误，`-L` 表示跟随重定向 |
| `export NVM_DIR="$HOME/.nvm"` | 设置当前 shell 里的 `NVM_DIR` 环境变量 | 告诉当前终端 nvm 安装目录在哪里 |
| `[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"` | 如果 `nvm.sh` 文件存在且非空，就加载它 | 让当前终端立即能使用 `nvm` 命令；重新登录后通常会由 shell 配置自动加载 |
| `nvm install 12.22.12` | 安装指定 Node.js 版本 | 下载并安装 Node.js `12.22.12`，同时带上对应 npm |
| `nvm alias default 12.22.12` | 设置默认 Node.js 版本 | 以后新打开终端时默认使用 Node.js `12.22.12` |
| `nvm use 12.22.12` | 切换当前终端的 Node.js 版本 | 立即让当前终端使用 Node.js `12.22.12` |
| `node -v` | 查看 Node.js 版本 | 确认当前终端实际使用的 Node.js 版本 |
| `npm -v` | 查看 npm 版本 | 确认 npm 可用，Node.js 12 通常对应 npm 6.x |

为什么这里不用 `sudo apt install nodejs npm`，也不把 `sudo apt install nvm` 作为默认写法：

| 方式 | 安装位置 | 是否需要 sudo | 特点 | 对本项目的影响 |
| --- | --- | --- | --- | --- |
| `sudo apt install nodejs npm` | 系统目录，例如 `/usr/bin` | 需要 | 由 Ubuntu 软件源决定 Node.js 和 npm 版本，通常只能方便地维护系统级一个版本 | Ubuntu 新版仓库里的 Node.js 版本可能过新，不一定能直接安装 `12.22.12` |
| `sudo apt install nvm` | nvm 工具由 apt 安装到系统位置；后续 Node.js 版本通常仍按用户环境管理 | 安装 nvm 工具时需要；后续 `nvm install` 不需要 | 是否可用、版本新旧、shell 加载方式取决于当前 Ubuntu 版本和软件源；很多环境里没有这个包，或行为与官方 nvm 安装脚本不完全一致 | 如果你的服务器确认能安装并正常加载，也可以用；但本文不把它作为默认步骤，避免不同 Ubuntu 镜像表现不一致 |
| 官方 nvm 安装脚本 + `nvm install 12.22.12` | 当前用户目录，例如 `~/.nvm` | 不需要 sudo 执行 nvm 安装脚本和 Node.js 安装 | nvm 官方推荐流程，可以按用户安装多个 Node.js 版本，并随时切换 | 更适合老项目固定 Node.js 版本，也方便临时切换到 Node.js 22 做兼容性验证 |

更具体地说，`apt install nvm` 和这里的官方安装脚本不是完全一回事：

- `apt` 是 Ubuntu 的系统包管理器。`sudo apt install nvm` 如果可用，安装的是 Ubuntu 软件源里打包好的 nvm 工具包；这个包是否存在、版本是多少、如何写入 shell 配置，取决于你的 Ubuntu 版本和镜像源。
- nvm 官方 README 推荐的是运行官方安装脚本。脚本会把 nvm 克隆到当前用户的 `~/.nvm`，并尝试把加载代码写入当前用户的 `.bashrc`、`.profile` 等 shell 配置文件。
- 本文选择官方脚本，是为了让 Ubuntu 测试环境、普通云服务器、不同镜像源之间的步骤更一致。它看起来比 `apt install nvm` 长一点，但安装结果更接近 nvm 官方文档，也更容易解释和排查。
- 如果你执行 `sudo apt install nvm` 能成功，并且重新登录后 `command -v nvm` 能输出 `nvm`，再执行 `nvm install 12.22.12`、`nvm use 12.22.12` 也能正常工作，那也可以继续用这种方式。后续原则不变：在 `fee` 用户下使用 nvm，不要对 `nvm install` 加 `sudo`。

前 3 行看起来复杂，是因为本文采用 nvm 官方脚本安装方式，让 nvm 明确安装并加载到当前用户环境里：

- `curl ... | bash`：从 nvm 官方 GitHub 地址下载安装脚本并执行，安装 nvm 本身。
- `export NVM_DIR="$HOME/.nvm"`：告诉当前终端 nvm 在哪里。
- `[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`：把 nvm 加载到当前终端里，执行后才能立刻使用 `nvm` 命令。重新登录终端后，安装脚本通常会通过 `.bashrc` 自动加载，后续不一定需要手动执行这两行。

安全习惯：`curl ... | bash` 只对可信来源使用。这里使用的是 nvm 项目的官方 GitHub 安装脚本；如果你想先看脚本内容，也可以先打开 URL 或下载后检查，再执行安装。

是否必须使用 nvm：

- 项目必须有 Node.js 和 npm；否则无法安装依赖、构建 `server`、构建 `client` 和构建 `sdk`。
- nvm 不是唯一安装方式，但测试环境推荐使用 nvm。原因是它可以固定 Node.js 版本，也方便后续在同一台机器上切换不同版本排查问题。
- 不建议直接使用 Ubuntu 系统仓库里的最新版 Node.js，因为仓库版本会随系统变化，容易和这个老项目的依赖产生兼容性差异。

为什么 `nvm install`、`nvm alias`、`nvm use` 前面不要加 `sudo`：

- nvm 是“当前用户级”的 Node.js 版本管理工具，默认把 Node.js 安装到当前用户的 `~/.nvm` 目录，不需要写系统目录。
- 如果加 `sudo`，命令可能会在 root 用户环境里执行，导致 Node.js 被装到 root 的 `~/.nvm`，普通 `fee` 用户反而用不到。
- 混用 `sudo nvm`、`sudo npm` 还容易造成 `~/.nvm` 目录权限混乱，后续安装依赖或全局包时出现 permission denied。
- 所以部署用户是 `fee` 时，就在 `fee` 用户下直接执行 `nvm install 12.22.12`、`nvm use 12.22.12`。如果提示 `nvm: command not found`，通常是当前终端还没有加载 nvm，重新执行 `[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"` 或重新登录终端即可，不要改用 `sudo`。
- 使用 nvm 后，后面的 `npm install -g pm2@5` 也通常不需要 `sudo`，因为全局包会安装到当前用户 nvm 管理的 Node.js 目录下。

关于 Node.js `22.16.0` 和 npm `10.9.2`：

- 你本地 Windows 10 专业版使用 Node.js `22.16.0`、npm `10.9.2` 能跑通，说明这套版本在你的本地场景下可用，但不能直接证明 Ubuntu 测试环境也一定稳定。
- 差异主要来自依赖安装和 native 包编译。服务端依赖里有 `node-rdkafka@2.5.1`、`sqlite3@4.0.4` 等较老的 native 包，前端也使用 Vue 2、Webpack 4 等老版本工具；这些依赖在 Ubuntu + Node.js 22 + npm 10 下可能出现安装、编译或构建问题。
- 因此本文默认仍推荐 Node.js `12.22.12`，目标是优先把测试环境稳定跑通。
- 如果你希望和本地保持一致，也可以在 Ubuntu 上尝试 Node.js `22.16.0`，但要在目标机器上完整验证 `server`、`client`、`sdk` 的依赖安装、构建和启动。若遇到 npm 依赖解析错误，可再评估是否使用 `npm install --legacy-peer-deps`；若遇到 native 包编译错误，建议先退回 Node.js `12.22.12`，不要一边部署一边升级依赖。

如果尝试 Node.js `22.16.0`，命令类似：

```bash
nvm install 22.16.0
nvm use 22.16.0
node -v
npm -v
```

确认整套项目都验证通过后，再决定是否执行：

```bash
nvm alias default 22.16.0
```

配置 npm 镜像和 node-gyp 使用的 Python：

```bash
npm config set registry https://registry.npmmirror.com
npm config set python /usr/bin/python3
npm config set audit false
npm config get registry
```

### 4.2 安装 PM2

不要装未来的 PM2 大版本，避免对 Node 12 的兼容性变化：

```bash
npm install -g pm2@5
pm2 -v
```

## 五、安装并配置数据库

### 5.1 启动 MariaDB

```bash
sudo systemctl enable --now mariadb
sudo systemctl status mariadb
```

首次安全初始化：

```bash
sudo mariadb-secure-installation
```

建议选择：

- 设置 root 密码：按你的管理习惯决定；Ubuntu/MariaDB 常用 unix socket 登录，也可以不设置。
- 移除匿名用户：`Y`
- 禁止 root 远程登录：`Y`
- 移除 test 数据库：`Y`
- 刷新权限：`Y`

### 5.2 创建测试库和账号

下面的密码请替换成你自己的强密码。文档中用 `FeeTest_ChangeMe_2026!` 作为占位示例。

```bash
sudo mariadb <<'SQL'
CREATE DATABASE IF NOT EXISTS platform_test
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'fee_test'@'127.0.0.1'
  IDENTIFIED BY 'FeeTest_ChangeMe_2026!';

CREATE USER IF NOT EXISTS 'fee_test'@'localhost'
  IDENTIFIED BY 'FeeTest_ChangeMe_2026!';

GRANT ALL PRIVILEGES ON platform_test.* TO 'fee_test'@'127.0.0.1';
GRANT ALL PRIVILEGES ON platform_test.* TO 'fee_test'@'localhost';
FLUSH PRIVILEGES;
SQL
```

验证连接：

```bash
mysql -h 127.0.0.1 -u fee_test -p platform_test -e "SELECT VERSION();"
```

输入你刚才设置的密码，能看到版本号即成功。

### 5.3 可选：使用 MySQL 8.x（含 8.0.12 / 8.4.10）

如果你的本地 Windows 环境使用 MySQL 8.0.12 且已经跑通，Ubuntu 测试环境也可以使用 MySQL 8.x。需要注意的是，关键差异不在操作系统，而在连接账号使用的认证插件。

MySQL 8.x 默认可能给新账号使用 `caching_sha2_password`，而本项目依赖的旧 `mysql@2.15.0` 驱动更适合连接 `mysql_native_password` 账号。Windows 能正常连接，通常是因为安装 MySQL 时选择了兼容 MySQL 5.x 的旧认证方式，或连接账号后来被改成了 `mysql_native_password`。

如果你决定使用 MySQL 8.x：

- 不要同时让 MariaDB 和 MySQL 监听同一个 `3306` 端口，测试环境二选一即可。
- Ubuntu 默认仓库未必能直接安装指定的 MySQL `8.0.12`，如果公司要求固定这个版本，建议使用公司统一安装包或 MySQL 官方 APT 仓库并锁定版本。
- `server/src/configs/mysql.js` 里的 `testing.host` 是 `127.0.0.1`，所以至少要创建 `'fee_test'@'127.0.0.1'`；为了方便命令行本机登录，也可以同时创建 `'fee_test'@'localhost'`。

MySQL 服务启动命令通常是：

```bash
sudo systemctl enable --now mysql
sudo systemctl status mysql
```

这两条命令都在 Linux Shell 里执行，也就是提示符类似 `fee@my-server:/opt/fee-pro/server$` 时执行，不是在 `mysql>` 里执行。

- `sudo`：使用管理员权限执行命令。
- `systemctl`：管理 Ubuntu 上的系统服务。
- `enable --now mysql`：把 `mysql` 服务设置为开机自启动，并且立刻启动；大致等价于先执行 `sudo systemctl enable mysql`，再执行 `sudo systemctl start mysql`。
- `status mysql`：查看 `mysql` 服务当前状态。看到 `Active: active (running)` 表示正在运行；如果进入状态查看页面后想返回命令行，按 `q` 退出。

如果已经进入 MySQL 交互界面，提示符会变成 `mysql>`。此时只能输入 SQL，不要再输入 `sudo mysql -e "..."` 这种 Shell 命令。例如：

```sql
SELECT VERSION();
```

如果想退出 MySQL 交互界面，回到 Linux Shell，执行：

```sql
exit;
```

确认 MySQL 版本和认证插件状态：

```bash
sudo mysql -e "SELECT VERSION();"
sudo mysql -e "SELECT PLUGIN_NAME, PLUGIN_STATUS FROM INFORMATION_SCHEMA.PLUGINS WHERE PLUGIN_NAME IN ('mysql_native_password', 'caching_sha2_password');"
```

如果使用 MySQL 8.4.10，可能看到：

```text
caching_sha2_password | ACTIVE
mysql_native_password | DISABLED
```

这表示 MySQL 自带的新认证插件已启用，但兼容旧驱动的 `mysql_native_password` 被禁用。此时如果继续执行 `IDENTIFIED WITH mysql_native_password`，可能报 `Plugin 'mysql_native_password' is not loaded`。需要先编辑 MySQL 配置：

```bash
sudo vim /etc/mysql/mysql.conf.d/mysqld.cnf
```

在 `[mysqld]` 下面增加一行：

```ini
mysql_native_password=ON
```

保存退出后重启 MySQL：

```bash
sudo systemctl restart mysql
```

再次执行插件状态查询，确认 `mysql_native_password` 变成 `ACTIVE` 后，再创建测试库和兼容旧驱动的账号。

下面的密码请替换成你自己的强密码。如果只是临时测试并想沿用当前 `server/src/configs/mysql.js` 里的默认密码 `123456`，也可以把下方所有 `FeeTest_ChangeMe_2026!` 统一替换成 `123456`；但公网测试环境更建议使用强密码，并在后续 `8.1` 同步修改项目配置。

创建测试库和兼容旧驱动的账号：

```bash
sudo mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS platform_test
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'fee_test'@'127.0.0.1'
  IDENTIFIED BY 'FeeTest_ChangeMe_2026!';

CREATE USER IF NOT EXISTS 'fee_test'@'localhost'
  IDENTIFIED BY 'FeeTest_ChangeMe_2026!';

ALTER USER 'fee_test'@'127.0.0.1'
  IDENTIFIED WITH mysql_native_password BY 'FeeTest_ChangeMe_2026!';

ALTER USER 'fee_test'@'localhost'
  IDENTIFIED WITH mysql_native_password BY 'FeeTest_ChangeMe_2026!';

GRANT ALL PRIVILEGES ON platform_test.* TO 'fee_test'@'127.0.0.1';
GRANT ALL PRIVILEGES ON platform_test.* TO 'fee_test'@'localhost';
FLUSH PRIVILEGES;

SELECT user, host, plugin
FROM mysql.user
WHERE user = 'fee_test';
SQL
```

确认查询结果里 `fee_test` 对应的 `plugin` 是 `mysql_native_password`。然后验证连接：

```bash
mysql -h 127.0.0.1 -u fee_test -p platform_test -e "SELECT VERSION();"
```

能看到 MySQL 版本号，例如 `8.0.12` 或 `8.4.10`，说明数据库侧已经准备好。后续 `8.1` 的项目配置仍按同样的 `host`、`user`、`password`、`database` 填写。

## 六、配置 Redis

当前 `server/src/library/redis/index.js` 只把 `host` 和 `port` 传给 `ioredis`，没有传 `password` 和 `db`。所以初次测试环境不要给 Redis 设置密码，也不要依赖 Redis DB 编号隔离；用本机监听和安全组隔离即可。

修改 Redis 监听地址，只允许本机访问：

```bash
sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.bak.$(date +%Y%m%d%H%M%S)
sudo sed -i 's/^supervised .*/supervised systemd/' /etc/redis/redis.conf
sudo sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
sudo systemctl enable --now redis-server
sudo systemctl restart redis-server
redis-cli ping
```

预期返回：

```text
PONG
```

如果后续必须给 Redis 加密码，需要同步修改 `server/src/library/redis/index.js`，把 `redisConfig.password` 传给 `new Redis({ ... })`。

## 七、拉取 fee-pro 代码

### 7.1 创建项目目录

```bash
sudo mkdir -p /opt/fee-pro
sudo chown -R "$USER:$USER" /opt/fee-pro
```

这两条命令建议在前面创建的普通部署用户 `fee` 下执行，也就是已经执行过 `su - fee` 之后再执行。不要在 `root` 用户下直接照抄第二行，否则 `$USER` 会展开成 `root`，目录仍然会归 `root` 所有。若当前仍是 `root`，可改成：

```bash
sudo chown -R fee:fee /opt/fee-pro
```

命令的基本格式是：

```bash
sudo <命令> <参数> <路径>
mkdir -p <目录路径>
chown -R <用户>:<用户组> <目录路径>
```

逐条说明：

| 命令 | 含义 | 作用 |
| --- | --- | --- |
| `sudo mkdir -p /opt/fee-pro` | 用管理员权限创建 `/opt/fee-pro` 目录 | `/opt` 是系统目录，普通用户通常没有写权限；`mkdir` 用来创建目录，`-p` 表示父目录不存在时一并创建，目录已存在时也不报错 |
| `sudo chown -R "$USER:$USER" /opt/fee-pro` | 用管理员权限把 `/opt/fee-pro` 的属主和属组改成当前用户 | `chown` 用来修改文件或目录所有者；`-R` 表示递归处理目录下已有内容；`$USER` 是当前登录用户变量，例如当前是 `fee` 时会展开成 `fee:fee` |

是否必要：

- 如果按本文默认把项目部署到 `/opt/fee-pro`，并用普通用户 `fee` 运行后续 `git clone`、`npm install`、`npm run build`、`pm2` 等命令，那么这一步是推荐且基本必要的。它可以避免后续因为目录归 `root` 所有而频繁遇到 `permission denied`，也避免用 `sudo npm install` 造成 `node_modules` 权限混乱。
- 如果你把项目放在当前用户自己的目录下，例如 `/home/fee/fee-pro`，通常不需要这两条命令，可以直接 `mkdir -p ~/fee-pro`。
- 如果 `/opt/fee-pro` 已经存在，并且确认属主已经是部署用户，可以跳过 `chown`。可用下面命令检查：

```bash
ls -ld /opt/fee-pro
```

`/opt/fee-pro` 和 `/home/fee/fee-pro` 的主要区别：

| 部署位置 | 特点 | 优点 | 注意点 |
| --- | --- | --- | --- |
| `/opt/fee-pro` | 系统级应用目录，常用来放额外安装的服务或业务应用 | 路径稳定，和具体登录用户的家目录解耦；适合被 Nginx、PM2、systemd、运维脚本长期引用；多人接手服务器时也更容易识别这是一个正式部署的应用 | `/opt` 默认归 `root` 管理，需要先 `sudo mkdir`，再 `sudo chown` 给部署用户；后续不要用 `sudo npm install` |
| `/home/fee/fee-pro` | 部署用户自己的家目录 | 权限最简单，`fee` 用户天然可读写；适合临时验证、学习环境、个人测试，不需要额外 `chown` | 路径和用户绑定更强；如果以后换部署用户、做规范化运维、配置 Nginx 静态目录或迁移脚本，需要同步调整路径 |

哪个好一些：

- 对本文这类“阿里云 ECS 上跑一个可长期访问的测试环境”，推荐使用 `/opt/fee-pro`。它更像一套服务器应用的固定安装位置，后续 Nginx 配置、PM2 进程、日志排查和部署脚本都统一引用这个路径，比较清晰。
- 如果只是个人临时跑通项目，或者你不想处理 `/opt` 的权限，放到 `/home/fee/fee-pro` 也完全可以。此时创建目录可以简化为：

```bash
mkdir -p /home/fee/fee-pro
```

或：

```bash
mkdir -p ~/fee-pro
```

通常情况怎么做：

- 个人开发、临时测试：常放在 `/home/<user>/<project>`，省心、权限简单。
- 服务器测试环境、预发环境、生产环境：更常见的是放在 `/opt/<project>`、`/srv/<project>` 或公司约定的统一部署目录，并用专门的部署用户拥有该目录。
- 无论选择哪个目录，都不要用 `root` 直接运行项目，也不要长期依赖 `sudo npm install`、`sudo npm run build`。推荐做法是：目录由普通部署用户拥有，应用进程也由普通部署用户启动。
- 如果你决定改用 `/home/fee/fee-pro`，本文后续所有 `/opt/fee-pro` 都要同步替换，包括 `git clone` 路径、`cd` 路径、Nginx `root` 路径、PM2 启动路径和日志排查命令。为了减少出错，本文后续统一使用 `/opt/fee-pro`。

### 7.2 从你的仓库拉取

把下面的 `<your-fee-pro-git-url>` 替换成你自己的仓库地址。

```bash
git clone --depth 1 <your-fee-pro-git-url> /opt/fee-pro
cd /opt/fee-pro
git status --short
```

这三条命令建议在部署用户 `fee` 下执行，不要用 `root` 执行。前面已经把 `/opt/fee-pro` 的属主改成了 `fee`，所以这里不需要 `sudo`。

命令的基本格式是：

```bash
git clone [选项] <仓库地址> <本地目录>
cd <目录路径>
git status [选项]
```

逐条说明：

| 命令 | 含义 | 作用 |
| --- | --- | --- |
| `git clone --depth 1 <your-fee-pro-git-url> /opt/fee-pro` | 从 Git 仓库克隆代码到 `/opt/fee-pro` | `<your-fee-pro-git-url>` 替换成你的仓库地址；`/opt/fee-pro` 是本地目标目录；`--depth 1` 表示浅克隆，只拉取最近一次提交历史，能减少下载量和部署时间 |
| `cd /opt/fee-pro` | 切换当前终端所在目录 | 进入项目目录，后续 `npm install`、`npm run build`、`git status` 等命令默认都在这个目录下执行 |
| `git status --short` | 查看当前 Git 工作区状态，并用短格式输出 | 用来确认代码是否拉取成功、当前分支是否正常、有没有未提交或未跟踪文件；`--short` 会让输出更简洁 |

是否必要：

- 如果代码已经推到 Git 仓库，并且你希望服务器直接从仓库拉代码，`git clone` 是必要步骤。`--depth 1` 不是必须，但测试环境部署通常推荐使用，因为只需要当前代码，不需要完整历史。
- `cd /opt/fee-pro` 对后续操作基本必要。后面很多命令都假设当前目录已经是项目根目录。
- `git status --short` 不是运行项目的必要条件，但强烈建议执行一次，用来确认当前目录确实是 Git 仓库，代码状态也符合预期。
- 如果你不用 Git，而是通过后面的 `rsync`、`scp` 或压缩包上传代码，可以跳过 `git clone`，但上传完成后仍建议 `cd /opt/fee-pro` 并检查目录内容。

这些命令需要在特定文件夹执行吗：

- 第一行 `git clone --depth 1 <your-fee-pro-git-url> /opt/fee-pro` 使用的是绝对目标路径 `/opt/fee-pro`，所以你当前在 `/home/fee`、`/tmp` 还是其他目录下执行，克隆结果都一样，都会把代码放到 `/opt/fee-pro`。因此这条命令不强制要求先 `cd /home/fee`。
- 如果本地目录写成相对路径，例如 `git clone <仓库地址> fee-pro`，当前所在目录就有影响：在 `/home/fee` 下执行会克隆到 `/home/fee/fee-pro`，在 `/tmp` 下执行会克隆到 `/tmp/fee-pro`。
- 第二行 `cd /opt/fee-pro` 的作用就是把当前终端切到项目目录。执行成功后，第三行 `git status --short` 才能直接作用于这个项目仓库。
- 第三行 `git status --short` 通常需要在 Git 仓库目录内执行，也就是先 `cd /opt/fee-pro`。如果不想切换目录，也可以写成：

```bash
git -C /opt/fee-pro status --short
```

注意：`git clone` 的目标目录必须是不存在的目录，或已经存在但为空的目录。本文前面刚执行过 `sudo mkdir -p /opt/fee-pro`，正常情况下这个目录是空的，可以直接克隆。如果 `/opt/fee-pro` 里已经有旧代码或其他文件，`git clone` 会失败，需要先确认里面的内容是否还要保留，再决定清理、备份或改用 `git pull` 更新。

如果代码暂时没有推到 Git 仓库，也可以从本机上传。以下命令在你的本机执行，不是在 ECS 上执行：

```bash
rsync -av --exclude node_modules --exclude server/dist --exclude client/dist --exclude .git \
  D:/mywork/demo/fee-pro/ fee@8.138.93.199:/opt/fee-pro/
```

Windows 没有 `rsync` 时，可以用 Git Bash、WSL，或先压缩再 `scp` 上传。

## 八、修改 fee-pro 测试环境配置

进入项目目录：

```bash
cd /opt/fee-pro
```

### 8.1 配置 MySQL/MariaDB

打开：

```bash
vim server/src/configs/mysql.js
```

确认 `testing` 配置为：

```js
const testing = {
  host: '127.0.0.1',
  port: '3306',
  user: 'fee_test',
  password: 'FeeTest_ChangeMe_2026!',
  database: 'platform_test'
}
```

密码要和你在数据库里创建的密码一致。

### 8.2 配置 Redis

打开：

```bash
vim server/src/configs/redis.js
```

确认 `testing` 配置为本机 Redis：

```js
const testing = {
  host: '127.0.0.1',
  port: '6379',
  password: '',
  db: '0'
}
```

注意：当前 Redis 封装未实际使用 `password` 和 `db`，这里保留字段只是为了和配置结构一致。

### 8.3 配置公共开关和 Nginx 日志路径

打开：

```bash
vim server/src/configs/common.js
```

确认 `testing` 配置为：

```js
const testing = {
  loginType: 'normal',
  use: {
    kafka: false,
    alarm: false
  },
  nginxLogFilePath: '/var/log/nginx/'
}
```

关键点：

- `kafka: false` 表示先走 Nginx 文件日志链路。
- `alarm: false` 表示测试环境先不发真实报警。
- `nginxLogFilePath` 必须和 Nginx 写入 `fee-access.log` 的目录一致。

### 8.4 检查后端端口

打开：

```bash
vim server/src/configs/app.js
```

确认 `testing.port` 是 `3000`：

```js
const testing = {
  name: 'fee监控平台测试环境',
  port: 3000,
  proxy: false,
  absoluteLogPath: path.resolve(__dirname, '../../', 'log')
}
```

`absoluteLogPath` 可以先使用默认的 `server/log`，测试环境足够。

## 九、安装依赖并构建项目

### 9.1 安装 Server 依赖

服务端不要使用 `npm install --production`，因为当前代码会 import `node-rdkafka`，而它在 `devDependencies` 中。

```bash
cd /opt/fee-pro/server
npm install --no-audit
npm run build
```

如果 `node-rdkafka` 编译失败，先确认：

```bash
node -v
npm -v
python --version
dpkg -l | grep librdkafka
```

缺少依赖时重新安装：

```bash
sudo apt install -y build-essential make g++ python3 python-is-python3 pkg-config librdkafka-dev
npm config set python /usr/bin/python3
npm install --no-audit
```

### 9.2 安装 Client 依赖并构建

```bash
cd /opt/fee-pro/client
npm install --no-audit
npm run build
```

`npm install --no-audit` 的基本格式是：

```bash
npm install [选项]
```

其中 `--no-audit` 表示本次安装时不执行 npm 的安全漏洞审计请求。它的作用是：

- 仍然正常安装 `package.json` 里的依赖。
- 不在安装过程中额外请求 npm registry 的 audit 接口。
- 输出更干净，安装速度可能略快。
- 在服务器网络较慢、npm audit 接口访问不稳定、老项目依赖漏洞提示很多时，减少和部署主流程无关的干扰。

`npm install` 和 `npm install --no-audit` 的区别：

| 命令 | 会安装依赖 | 会执行 npm audit | 适用场景 |
| --- | --- | --- | --- |
| `npm install` | 会 | 默认会 | 本地开发、希望顺便看到安全审计提示时使用 |
| `npm install --no-audit` | 会 | 不会 | 服务器部署、测试环境快速安装、老项目减少审计噪音时使用 |

是否必要：

- `npm install` 是必要的。没有安装依赖，`npm run build`、`node dist/app.js`、`pm2` 启动服务通常都会失败。
- `--no-audit` 不是必要的，只是部署时推荐加上。去掉也可以，写成 `npm install` 同样能安装依赖。
- `--no-audit` 不会修复安全漏洞，也不会让依赖更安全；它只是跳过“安装过程中的审计报告”。如果要单独查看漏洞，可以在依赖装好后手动运行 `npm audit`。

Windows 下为什么看起来只需要 `npm install`：

- Windows 本地开发时，执行 `npm install` 确实可以；在 Ubuntu ECS 上执行 `npm install` 也可以。
- 本文写成 `npm install --no-audit`，不是因为 Ubuntu 必须这么写，而是为了服务器部署更稳定、少一些 audit 网络请求和老依赖漏洞提示。

构建完成后应出现：

```text
/opt/fee-pro/client/dist/index.html
```

当前前端生产构建默认走同域 `/api`，所以后续由 Nginx 把 `/api/*` 转发到后端即可。

## 十、初始化数据库表和模板数据

进入 Server 目录：

```bash
cd /opt/fee-pro/server
```

生成项目 `1` 从当前月到未来 12 个月的分表。项目 `1` 是模板数据使用的默认项目。

```bash
START_YM=$(date '+%Y-%m')
END_YM=$(date -d '+12 months' '+%Y-%m')

npm run test_fee -- Utils:GenerateSQL 1 "$START_YM" "$END_YM" > init.sql
tail -n +3 init.sql > init.clean.sql
mysql -h 127.0.0.1 -u fee_test -p platform_test < init.clean.sql
```

输入数据库密码。

导入模板项目和默认管理员账号：

```bash
npm run test_fee -- Utils:TemplateSQL
```

验证表和模板项目：

```bash
mysql -h 127.0.0.1 -u fee_test -p platform_test -e "SHOW TABLES LIKE 't_o_project'; SELECT id, display_name, project_name FROM t_o_project;"
```

预期至少看到：

```text
id: 1
display_name: 模板项目
project_name: template
```

默认登录账号：

```text
账号：test@qq.com
密码：admin
```

测试环境跑通后，建议立刻在页面里创建自己的管理员账号，或更新数据库中的默认账号密码。

## 十一、配置 Nginx

### 11.1 让应用用户能读 Nginx 日志

`SaveLog:Nginx` 会由 PM2 下的 `fee` 用户读取 `/var/log/nginx/fee-access.log`。把 `fee` 加入 `adm` 组：

```bash
sudo usermod -aG adm fee
newgrp adm
```

创建日志文件并设置权限：

```bash
sudo touch /var/log/nginx/fee-access.log
sudo chgrp adm /var/log/nginx/fee-access.log
sudo chmod 640 /var/log/nginx/fee-access.log
```

如果你当前不是 `fee` 用户，按实际部署用户替换命令里的 `fee`。

### 11.2 写入 Nginx 站点配置

创建配置文件：

```bash
sudo tee /etc/nginx/conf.d/fee-pro.conf > /dev/null <<'NGINX'
log_format fee_main '$time_iso8601\t-\t-\t$remote_addr\t$http_host\t$status\t$request_time\t$request_length\t$body_bytes_sent\t15d04347-be16-b9ab-0029-24e4b6645950\t-\t-\t9689c3ea-5155-2df7-a719-e90d2dedeb2c\t937ba755-116a-18e6-0735-312cba23b00c\t$request_method $server_protocol\t$request_uri\t-\t$http_user_agent\t-\tsample=-&_UC_agent=-&test_device_id=-&-\t-\t-\t-';

server {
    listen 80;
    server_name 8.138.93.199 test.com;
    charset utf-8;

    root /opt/fee-pro/client/dist;
    index index.html;

    access_log /var/log/nginx/fee-web-access.log;
    error_log /var/log/nginx/fee-error.log;

    location = /dig {
        empty_gif;
        access_log /var/log/nginx/fee-access.log fee_main;

        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type" always;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
    }

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location ~ ^/project/\d+/api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        try_files $uri =404;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~ /\.(git|env) {
        deny all;
    }
}
NGINX
```

检查并重载：

```bash
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

浏览器访问：

```text
http://8.138.93.199/
```

此时前端静态页面应能打开，但后端还没有启动，登录接口可能暂时不可用。

## 十二、启动后端和任务进程

进入 Server 目录：

```bash
cd /opt/fee-pro/server
mkdir -p log/pm2/app log/pm2/command
```

启动 Web/API 服务：

```bash
pm2 start pm2_fee_app.json --env testing
```

启动后台任务调度：

```bash
pm2 start pm2_fee_task_manager.json --env testing
```

查看状态：

```bash
pm2 list
pm2 logs fee-app --lines 80
pm2 logs fee-task-manager --lines 80
```

验证后端本机接口：

```bash
curl http://127.0.0.1:3000/api/login/type
```

验证 Nginx 代理接口：

```bash
curl http://8.138.93.199/api/login/type
```

预期返回 JSON，内容里能看到登录类型为 `normal`。

### 12.1 设置 PM2 开机自启动

执行：

```bash
pm2 startup
```

PM2 会输出一条需要用 `sudo` 执行的命令，复制输出的命令执行。使用 `fee` 用户和 nvm 时，通常类似：

```bash
sudo env PATH=$PATH:/home/fee/.nvm/versions/node/v12.22.12/bin \
  /home/fee/.nvm/versions/node/v12.22.12/lib/node_modules/pm2/bin/pm2 \
  startup systemd -u fee --hp /home/fee
```

以你机器上 `pm2 startup` 的实际输出为准。然后保存当前进程列表：

```bash
pm2 save
```

## 十三、登录后台验证

浏览器访问：

```text
http://8.138.93.199/
```

使用模板账号登录：

```text
账号：test@qq.com
密码：admin
```

登录后检查：

- 能进入管理后台。
- 能看到模板项目。
- 项目看板页面没有大量接口 404。
- 浏览器 Network 中 `/api/*` 和 `/project/1/api/*` 返回 JSON，而不是返回 `index.html`。

如果 `/api/*` 正常但 `/project/1/api/*` 返回 HTML，通常是 Nginx 缺少 `/project/\d+/api/` 代理。

## 十四、验证 SDK 打点链路

### 14.1 先验证 `/dig` 能写入 Nginx 日志

在 ECS 上执行：

```bash
D=$(node -e "const log={type:'error',code:8,detail:{error_no:'ECS_DEPLOY_TEST',url:'http://8.138.93.199/deploy-test',http_code:0,during_ms:0,request_size_b:0,response_size_b:0},extra:{desc:'manual deploy test'},common:{pid:'template',uuid:'deploy-test-uuid',ucid:'deploy-user',timestamp:Date.now(),version:'1.0.0'}};process.stdout.write(encodeURIComponent(JSON.stringify(log)))")
curl -I "http://127.0.0.1/dig?d=${D}"
sudo tail -n 1 /var/log/nginx/fee-access.log
```

预期：

- `curl` 返回 `HTTP/1.1 200 OK`。
- `/var/log/nginx/fee-access.log` 新增一行。
- 日志行中包含 `/dig?d=...`。

### 14.2 手动执行保存日志命令

```bash
cd /opt/fee-pro/server
npm run test_fee -- SaveLog:Nginx
find log/kafka -type f | sort | tail -20
```

预期能看到类似：

```text
log/kafka/raw/month_202607/day_16/...
log/kafka/json/month_202607/day_16/...
```

如果没有文件，重点检查：

- `server/src/configs/common.js` 中 `testing.nginxLogFilePath` 是否是 `/var/log/nginx/`。
- `fee` 用户是否能读 `/var/log/nginx/fee-access.log`。
- Nginx 日志格式是否是本文的 `fee_main`。

### 14.3 手动解析最近 5 分钟日志

```bash
cd /opt/fee-pro/server
START_AT=$(date -d '5 minutes ago' '+%Y-%m-%d %H:%M')
END_AT=$(date '+%Y-%m-%d %H:%M')
npm run test_fee -- Parse:Monitor "$START_AT" "$END_AT"
```

检查原始错误表是否有数据：

```bash
TABLE_NAME="t_o_monitor_1_$(date '+%Y%m')"
mysql -h 127.0.0.1 -u fee_test -p platform_test -e "SELECT id,error_type,error_name,url,FROM_UNIXTIME(log_at) AS log_time FROM ${TABLE_NAME} ORDER BY id DESC LIMIT 5;"
```

能看到 `ECS_DEPLOY_TEST` 说明 Nginx 日志 -> SaveLog -> Parse -> DB 已跑通。

### 14.4 手动汇总最近 2 分钟错误

```bash
cd /opt/fee-pro/server
COUNT_AT=$(date -d '2 minutes ago' '+%Y-%m-%d %H:%M')
npm run test_fee -- Summary:Error "$COUNT_AT" minute
```

检查汇总表：

```bash
SUMMARY_TABLE="t_r_error_summary_1_$(date '+%Y%m')"
mysql -h 127.0.0.1 -u fee_test -p platform_test -e "SELECT error_name,url_path,error_count,count_at_time,count_type FROM ${SUMMARY_TABLE} ORDER BY id DESC LIMIT 5;"
```

如果手动命令能跑通，`fee-task-manager` 正常运行后会按分钟自动调度这些命令。

## 十五、业务页面接入 SDK 的注意事项

当前 SDK 上报地址硬编码在：

```text
sdk/src/index.js
```

当前值是：

```js
const feeTarget = 'http://test.com/dig'
```

测试环境有两个选择。

### 15.1 临时 hosts 方式

在你自己的电脑 hosts 中添加：

```text
8.138.93.199 test.com
```

这样未改 SDK 时，请求 `http://test.com/dig` 会进入这台 ECS。Nginx 配置中已经包含：

```nginx
server_name 8.138.93.199 test.com;
```

这种方式适合临时联调，不适合长期使用。

### 15.2 修改 SDK 上报地址并重新构建

把 `sdk/src/index.js` 改成：

```js
const feeTarget = 'http://8.138.93.199/dig'
```

然后构建：

```bash
cd /opt/fee-pro/sdk
npm install --no-audit
npm run build
```

业务页面接入时，`pid` 要使用后台项目的 `project_name`，模板项目是：

```js
window.dt.set({
  pid: 'template',
  uuid: 'test-device-id',
  ucid: 'test-user-id',
  is_test: false
})
```

如果设置 `is_test: true`，日志会进入测试日志目录，只供调试查看，不参与正常统计。

正式一点的做法是给测试环境绑定域名，例如 `fee-test.example.com`，然后把 SDK 上报地址改为：

```js
const feeTarget = 'http://fee-test.example.com/dig'
```

再配 HTTPS。

## 十六、日常运维命令

### 16.1 查看服务状态

```bash
pm2 list
sudo systemctl status nginx
sudo systemctl status mariadb
sudo systemctl status redis-server
```

### 16.2 查看日志

```bash
pm2 logs fee-app --lines 100
pm2 logs fee-task-manager --lines 100

tail -f /opt/fee-pro/server/log/pm2/app/app-out.log
tail -f /opt/fee-pro/server/log/pm2/command/task-manager-out.log
sudo tail -f /var/log/nginx/fee-access.log
sudo tail -f /var/log/nginx/fee-error.log
```

### 16.3 重启服务

```bash
cd /opt/fee-pro/server
npm run build
pm2 restart fee-app --update-env
pm2 restart fee-task-manager --update-env
```

### 16.4 更新代码

```bash
cd /opt/fee-pro
git pull

cd /opt/fee-pro/server
npm install --no-audit
npm run build

cd /opt/fee-pro/client
npm install --no-audit
npm run build

cd /opt/fee-pro/server
pm2 restart fee-app --update-env
pm2 restart fee-task-manager --update-env
pm2 save

sudo nginx -t
sudo systemctl reload nginx
```

### 16.5 新增项目后的建表命令

如果你在后台新建项目，假设项目 ID 是 `2`，需要为该项目生成分表：

```bash
cd /opt/fee-pro/server
START_YM=$(date '+%Y-%m')
END_YM=$(date -d '+12 months' '+%Y-%m')

npm run test_fee -- Utils:GenerateSQL 2 "$START_YM" "$END_YM" > project_2.sql
tail -n +3 project_2.sql > project_2.clean.sql
mysql -h 127.0.0.1 -u fee_test -p platform_test < project_2.clean.sql
```

业务 SDK 的 `pid` 应填项目的 `project_name`，不是数字 ID。

## 十七、日志轮转

### 17.1 Nginx 日志轮转

创建：

```bash
sudo tee /etc/logrotate.d/fee-pro-nginx > /dev/null <<'EOF'
/var/log/nginx/fee-access.log /var/log/nginx/fee-web-access.log /var/log/nginx/fee-error.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    create 0640 root adm
    sharedscripts
    postrotate
        [ -s /run/nginx.pid ] && kill -USR1 "$(cat /run/nginx.pid)"
    endscript
}
EOF
```

检查配置：

```bash
sudo logrotate -d /etc/logrotate.d/fee-pro-nginx
```

### 17.2 PM2 日志轮转

可以安装 PM2 日志轮转插件：

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 save
```

## 十八、常见问题

### 18.1 `Cannot find module 'node-rdkafka'`

原因：服务端只执行了 `npm install --production`，但当前代码会 import `node-rdkafka`。

处理：

```bash
cd /opt/fee-pro/server
sudo apt install -y build-essential make g++ python3 python-is-python3 pkg-config librdkafka-dev
npm install --no-audit
npm run build
pm2 restart fee-app --update-env
pm2 restart fee-task-manager --update-env
```

### 18.2 `ER_NOT_SUPPORTED_AUTH_MODE`

原因：使用 MySQL 8.x 时，旧 `mysql` npm 驱动可能不支持默认认证插件。MySQL 8.0 中默认认证插件从 `mysql_native_password` 调整为 `caching_sha2_password`，而本项目的 `mysql@2.15.0` 更适合使用 `mysql_native_password` 账号。

推荐处理：测试环境使用 MariaDB。

如果必须使用 MySQL 8.x，先确认连接账号使用的插件：

```sql
SELECT user, host, plugin
FROM mysql.user
WHERE user = 'fee_test';
```

如果 `plugin` 不是 `mysql_native_password`，可把测试账号改成兼容旧驱动的认证方式：

```sql
ALTER USER 'fee_test'@'127.0.0.1'
  IDENTIFIED WITH mysql_native_password BY 'FeeTest_ChangeMe_2026!';

ALTER USER 'fee_test'@'localhost'
  IDENTIFIED WITH mysql_native_password BY 'FeeTest_ChangeMe_2026!';

FLUSH PRIVILEGES;
```

如果只创建了 `'fee_test'@'localhost'`，但项目配置里使用 `host: '127.0.0.1'`，也可能仍然连不上；请同时创建或授权 `'fee_test'@'127.0.0.1'`。如果 MySQL 版本禁用了或移除了 `mysql_native_password`，需要启用对应插件，或升级项目数据库驱动。

### 18.3 Redis 报 `NOAUTH Authentication required`

原因：Redis 设置了 `requirepass`，但当前项目 Redis 封装没有传密码。

测试环境最简单处理：

```bash
sudo vim /etc/redis/redis.conf
```

注释或删除：

```conf
requirepass ...
```

然后：

```bash
sudo systemctl restart redis-server
redis-cli ping
```

长期方案是修改 `server/src/library/redis/index.js`，给 `new Redis()` 增加 `password: redisConfig.password`。

### 18.4 页面能打开，但登录接口 404

检查 Nginx 代理：

```bash
curl http://127.0.0.1:3000/api/login/type
curl http://8.138.93.199/api/login/type
sudo nginx -t
```

重点确认 `proxy_pass` 后面没有多余的 `/`：

```nginx
proxy_pass http://127.0.0.1:3000;
```

不要写成：

```nginx
proxy_pass http://127.0.0.1:3000/;
```

否则 `/api/login/type` 可能被转成 `/login/type`。

### 18.5 看板接口返回 HTML

检查：

```bash
curl -i http://8.138.93.199/project/1/api/pv/count
```

如果返回的是 `index.html`，说明缺少项目 API 代理。Nginx 必须有：

```nginx
location ~ ^/project/\d+/api/ {
    proxy_pass http://127.0.0.1:3000;
}
```

### 18.6 `/dig` 有请求，但数据不入库

按顺序排查：

```bash
sudo tail -n 3 /var/log/nginx/fee-access.log
cd /opt/fee-pro/server
npm run test_fee -- SaveLog:Nginx
find log/kafka -type f | sort | tail -20
```

如果 `fee-access.log` 有数据但 `log/kafka/json` 没有数据：

- 检查 `testing.nginxLogFilePath` 是否是 `/var/log/nginx/`。
- 检查 `fee` 用户是否能读 `/var/log/nginx/fee-access.log`。
- 检查日志是否使用本文的 `fee_main` Tab 分隔格式。

如果 `log/kafka/json` 有数据但数据库没有数据：

- 检查 `common.pid` 是否等于后台项目的 `project_name`，模板项目是 `template`。
- 检查当前项目和当前月份的分表是否已创建。
- 手动执行 `Parse:Monitor` 看错误日志。

### 18.7 1 Mbps 带宽下 npm 很慢

先使用国内 registry：

```bash
npm config set registry https://registry.npmmirror.com
```

如果仍然慢，可以在本地构建后上传：

```bash
tar --exclude=node_modules --exclude=.git -czf fee-pro-src.tar.gz fee-pro
scp fee-pro-src.tar.gz fee@8.138.93.199:/opt/
```

然后在 ECS 解压、安装依赖、构建。

## 十九、后续建议

测试环境跑通后，建议按以下顺序增强：

1. 绑定域名，例如 `fee-test.example.com`。
2. 使用 Certbot 或阿里云证书配置 HTTPS。
3. 修改 SDK 上报地址为测试域名。
4. 移除或修改默认账号 `test@qq.com/admin`。
5. 把数据库密码、报警地址等敏感配置改为环境变量或部署平台注入。
6. 数据量上来后，再评估 Kafka、独立数据库、独立 Redis 和日志采集链路。

最小可用测试环境的验收标准：

- `http://8.138.93.199/` 能打开管理后台。
- `test@qq.com/admin` 能登录。
- `/api/*` 和 `/project/1/api/*` 由 Nginx 正确代理到后端。
- `/dig` 能写入 `/var/log/nginx/fee-access.log`。
- `SaveLog:Nginx` 能生成 `server/log/kafka/json` 文件。
- `Parse:Monitor` 能把手工打点写入 `t_o_monitor_1_YYYYMM`。
- `fee-app` 和 `fee-task-manager` 在 PM2 中稳定运行。
