# 阿里云 ECS 从零部署 fee-pro 测试环境指南

> 适用场景：阿里云 ECS 单机测试环境。  
> 当前服务器信息：Ubuntu 26.04 64 位，2 核 vCPU，4 GiB 内存，公网 IP `8.138.93.199`，内网 IP `172.17.62.99`，公网带宽 1 Mbps。  
> 编写日期：2026-07-16。

## 一、部署目标与选择

本指南采用单机测试部署：

```text
浏览器 / SDK
  -> Nginx:80
      -> /dig                 写 /var/log/nginx/fee-minute/YYYY/MM/DD/HH/mm.log，返回 1px 图片
      -> /api/*               代理到 Node server:3000
      -> /project/:id/api/*   代理到 Node server:3000
      -> /                    托管 client/dist

Task:Manager
  -> SaveLog:Nginx 每分钟读取上一个完整分钟分片
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

这些命令的基本格式是：

```bash
sudo cp <源文件> <目标文件>
sudo sed -i 's/<匹配规则>/<替换内容>/' <文件>
sudo systemctl enable --now <服务名>
sudo systemctl restart <服务名>
redis-cli ping
```

逐条说明：

| 命令 | 含义 | 作用 |
| --- | --- | --- |
| `sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.bak.$(date +%Y%m%d%H%M%S)` | 用管理员权限复制 Redis 配置文件，并在备份文件名后追加当前时间 | 修改系统配置前先备份，方便配置写错时恢复。`cp` 是复制文件；`/etc/redis/redis.conf` 是原配置；`.bak.` 表示备份；`$(date +%Y%m%d%H%M%S)` 会执行 `date` 命令并生成类似 `20260720213045` 的时间戳，避免覆盖旧备份 |
| `sudo sed -i 's/^supervised .*/supervised systemd/' /etc/redis/redis.conf` | 用 `sed` 原地修改配置，把以 `supervised ` 开头的整行替换为 `supervised systemd` | 让 Redis 和 systemd 服务管理方式匹配。`sed -i` 表示直接修改文件；`s/旧内容/新内容/` 是替换语法；`^` 表示行首；`.*` 表示后面任意内容 |
| `sudo sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf` | 用 `sed` 原地修改配置，把以 `bind ` 开头的整行替换为只监听本机地址 | 限制 Redis 只接受本机连接。`127.0.0.1` 是 IPv4 本机回环地址，`::1` 是 IPv6 本机回环地址；这样公网或其他服务器不能直接连到 Redis |
| `sudo systemctl enable --now redis-server` | 用 systemd 设置 `redis-server` 服务开机自启，并立即启动服务 | `systemctl` 用来管理系统服务；`enable` 表示开机自动启动；`--now` 表示现在立刻启动一次 |
| `sudo systemctl restart redis-server` | 重启 Redis 服务 | 让前面写入 `/etc/redis/redis.conf` 的配置立即生效。如果 Redis 已经运行，必须重启后才会读取新的监听地址等配置 |
| `redis-cli ping` | 使用 Redis 命令行客户端向 Redis 发送 `PING` 命令 | 验证当前机器能否连上 Redis。返回 `PONG` 表示 Redis 服务正在运行，并且当前无密码或认证已通过 |

重点解释一下这条命令：

```bash
sudo sed -i 's/^supervised .*/supervised systemd/' /etc/redis/redis.conf
```

它的作用是把 Redis 配置文件中类似下面这样的行：

```conf
supervised no
```

替换成：

```conf
supervised systemd
```

命令拆开看：

| 片段 | 含义 |
| --- | --- |
| `sudo` | 用管理员权限修改 `/etc/redis/redis.conf` 这种系统配置文件 |
| `sed` | Linux 常用的文本处理工具 |
| `-i` | 直接修改原文件，而不是只把修改结果打印到终端 |
| `'s/^supervised .*/supervised systemd/'` | 替换规则：把以 `supervised ` 开头的整行替换成 `supervised systemd` |
| `/etc/redis/redis.conf` | 要修改的 Redis 配置文件 |

其中 `supervised` 是 Redis 的进程监管配置项，用来告诉 Redis：当前进程是否由外部服务管理器监管，以及应该用哪种方式和服务管理器配合。

常见取值可以这样理解：

| 配置 | 含义 | 适用场景 |
| --- | --- | --- |
| `supervised no` | Redis 不主动配合外部服务管理器，只按普通进程方式运行 | 手动运行 Redis、简单开发环境、容器内由前台进程管理时比较常见 |
| `supervised systemd` | Redis 按 systemd 方式运行，并向 systemd 报告启动状态 | Ubuntu/Debian 服务器上通过 `systemctl start/restart redis-server` 管理 Redis 时推荐使用 |

本文后续使用的是：

```bash
sudo systemctl enable --now redis-server
sudo systemctl restart redis-server
```

也就是说 Redis 是交给 systemd 管理的。把 `supervised` 改成 `systemd`，可以让 Redis 和 systemd 的管理方式一致，便于 `systemctl status redis-server` 正确显示服务状态，也更符合 Ubuntu/Debian 软件包的服务管理习惯。

注意：`supervised systemd` 不是 Redis 密码配置，也不是网络访问控制配置。它只影响 Redis 进程和 systemd 之间的服务监管方式。真正控制访问来源的是 `bind 127.0.0.1 ::1`，真正控制密码认证的是后面可选小节里的 `requirepass`。

这些命令不依赖当前所在目录，因为用到的是绝对路径 `/etc/redis/redis.conf` 和系统服务名 `redis-server`。如果你的发行版服务名不是 `redis-server`，可以用 `systemctl list-units | grep redis` 查看实际服务名，常见另一个名字是 `redis`。

注意：这两条 `sed` 命令要求配置文件里已经有 `supervised ...` 和 `bind ...` 这两类配置行。Ubuntu/Debian 通过 `apt install redis-server` 安装后通常都有。如果执行后发现配置没有变化，可以手动打开 `/etc/redis/redis.conf` 检查并修改对应配置。

如果后续必须给 Redis 加密码，需要同步修改项目 Redis 配置和连接封装，不能只改 Redis 服务端配置。具体见下一小节。

### 6.1 可选：后续支持 Redis 密码和 DB 编号

初次部署测试环境时建议先保持 Redis 本机无密码访问，确认项目链路跑通。后续如果测试环境需要更接近生产环境，或者 Redis 需要被其他应用服务器通过内网访问，可以再补充密码支持。

需要修改的地方有三个：

| 位置 | 修改内容 | 作用 |
| --- | --- | --- |
| Redis 服务端配置 | 在 `/etc/redis/redis.conf` 中设置 `requirepass`，必要时调整 `bind` | 让 Redis 服务端要求客户端认证 |
| `server/src/configs/redis.js` | 增加或填写 `password`、`db`，Redis 6 ACL 场景可增加 `username` | 让 fee-pro 有地方读取 Redis 认证和库编号 |
| `server/src/library/redis/index.js` | 把 `redisConfig.password`、`redisConfig.db` 传给 `new Redis()` | 让 ioredis 实际使用这些配置连接 Redis |

第一步，修改 Redis 服务端配置：

```bash
sudo vim /etc/redis/redis.conf
```

找到或新增：

```conf
bind 127.0.0.1 ::1
requirepass FeeRedis_ChangeMe_2026!
```

说明：

- `bind 127.0.0.1 ::1` 表示只允许本机访问 Redis，单机部署时推荐保留。
- `requirepass` 是 Redis 默认用户的密码。请替换成自己的强密码，不要使用示例密码。
- 如果以后是多台 ECS 内网访问 Redis，可以把 `bind` 调整为 Redis 服务器的内网 IP，并在阿里云安全组里只放行应用服务器的内网 IP 访问 `6379`，不要向公网开放。

重启并验证：

```bash
sudo systemctl restart redis-server
redis-cli ping
redis-cli -a 'FeeRedis_ChangeMe_2026!' ping
```

设置密码后，第一条 `redis-cli ping` 可能返回 `NOAUTH Authentication required`，第二条返回 `PONG` 才是预期结果。

第二步，修改项目 Redis 配置：

```bash
vim server/src/configs/redis.js
```

以 `testing` 为例：

```js
const testing = {
  host: '127.0.0.1',
  port: '6379',
  password: 'FeeRedis_ChangeMe_2026!',
  db: 0
}
```

如果使用 Redis 6+ ACL 用户，并且没有使用默认用户，也可以增加：

```js
username: 'fee_test'
```

测试环境可以直接写在配置文件里方便验证；更长期的做法是从环境变量或密钥系统读取，例如 `process.env.REDIS_PASSWORD`，避免把真实密码提交到代码仓库。

第三步，修改项目 Redis 连接封装：

```bash
vim server/src/library/redis/index.js
```

把原来直接写在 `new Redis({ ... })` 里的配置整理成 `redisOptions`，并补充 `password`、`db`：

```js
const redisOptions = {
  port: redisConfig.port,
  host: redisConfig.host,
  retryStrategy: (hasRetryTimes) => {
    // 关闭自动重连功能
    return false
  },
  lazyConnect: true, // 初始化时不能连接Redis Server, 否则会因为无法断开连接, 导致npm run fee命令不能退出
  showFriendlyErrorStack: true
}

if (redisConfig.username) {
  redisOptions.username = redisConfig.username
}

if (redisConfig.password) {
  redisOptions.password = redisConfig.password
}

if (redisConfig.db !== undefined && redisConfig.db !== '') {
  redisOptions.db = Number(redisConfig.db)
}

this.redisClient = new Redis(redisOptions)
```

注意：

- `password` 用来通过 Redis 认证；如果服务端设置了 `requirepass`，这里必须传。
- `db` 用来选择 Redis 逻辑库，例如 `0`、`1`、`2`。如果不传，ioredis 默认使用 `0` 号库。
- Redis 的 DB 编号不是强安全隔离，只是同一个 Redis 实例里的逻辑分区。测试、预发、生产如果共用一个 Redis 实例，仍然可能因为误删 key、内存占用、淘汰策略互相影响；更稳妥的做法是使用不同 Redis 实例，或至少使用清晰的 key 前缀。

第四步，重新编译并验证服务端：

```bash
cd /opt/fee-pro/server
npm run build
NODE_ENV=testing node - <<'NODE'
const redis = require('./dist/library/redis').default

async function main () {
  try {
    await redis.asyncSetex('fee_redis_password_check', 30, { ok: true })
    const result = await redis.asyncGet('fee_redis_password_check')
    console.log(result)
  } catch (err) {
    console.error(err)
    process.exitCode = 1
  }

  await redis.redisClient.disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
NODE
```

预期能看到类似 `{ ok: true }` 的输出。只要不再出现 `NOAUTH Authentication required`，并且 Redis 相关功能正常读写，就说明项目侧密码配置已经生效。

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

注意：当前 Redis 封装未实际使用 `password` 和 `db`，这里保留字段只是为了和配置结构一致。如果后续启用 Redis 密码或 DB 编号，需要同步完成第 `6.1` 小节的代码改造。

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
  nginxLogFilePath: '/var/log/nginx/fee-minute/'
}
```

关键点：

- `kafka: false` 表示先走 Nginx 文件日志链路。
- `alarm: false` 表示测试环境先不发真实报警。
- Linux 下 `SaveLog:Nginx` 只读取上一分钟的 `YYYY/MM/DD/HH/mm.log`。
- `nginxLogFilePath` 必须和 Nginx 动态分钟日志的根目录一致，末尾保留 `/`。

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
sed -n '/-- Adminer 4.3.1 MySQL dump/,$p' init.sql > init.clean.sql
head -n 8 init.clean.sql
grep -n '^>' init.clean.sql
mysql -h 127.0.0.1 -u fee_test -p platform_test < init.clean.sql
```

输入数据库密码。

命令说明：

| 命令 | 含义 | 作用 |
| --- | --- | --- |
| `START_YM=$(date '+%Y-%m')` | 把当前年月赋值给 `START_YM`，格式为 `YYYY-MM` | 作为建表开始月份。例如 `2026-07` |
| `END_YM=$(date -d '+12 months' '+%Y-%m')` | 把当前日期往后推 12 个月，再取年月赋值给 `END_YM` | 作为建表结束月份。例如当前是 `2026-07`，这里通常得到 `2027-07` |
| `npm run test_fee -- Utils:GenerateSQL 1 "$START_YM" "$END_YM" > init.sql` | 在 `testing` 环境执行 fee-pro CLI 命令 `Utils:GenerateSQL`，给项目 `1` 生成指定月份范围内的建表 SQL，并写入 `init.sql` | 生成公共表和项目 `1` 的按月分表 SQL。`--` 后面的参数会传给 `dist/fee.js`；`>` 表示把命令输出保存到文件 |
| `sed -n '/-- Adminer 4.3.1 MySQL dump/,$p' init.sql > init.clean.sql` | 从 `init.sql` 中找到真正 SQL 开始的标记行，并从该行一直输出到文件结尾，保存为 `init.clean.sql` | 清理 `npm run` 产生的命令提示行，只保留可导入 MySQL/MariaDB 的 SQL。不要再使用 `tail -n +3`，因为不同 npm 版本输出的头部行数可能不同 |
| `head -n 8 init.clean.sql` | 查看 `init.clean.sql` 前 8 行 | 确认清理后的文件开头是 `-- Adminer 4.3.1 MySQL dump`，而不是 `> platform@...` 或 `> NODE_ENV=...` |
| `grep -n '^>' init.clean.sql` | 查找 `init.clean.sql` 中是否还有以 `>` 开头的 npm 输出行 | 正常情况下这条命令没有任何输出。如果仍然输出 `> platform@...` 或 `> NODE_ENV=...`，说明 SQL 文件还没有清理干净，不要导入数据库 |
| `mysql -h 127.0.0.1 -u fee_test -p platform_test < init.clean.sql` | 使用 `fee_test` 用户连接本机数据库 `platform_test`，并把 `init.clean.sql` 输入给 MySQL/MariaDB 执行 | 真正创建 fee-pro 需要的数据库表。执行后会提示输入数据库密码，输入时屏幕不显示字符是正常现象 |

注意：`Utils:GenerateSQL` 的结束月份是包含在内的。例如 `START_YM=2026-07`、`END_YM=2027-07`，会生成 `2026-07` 到 `2027-07` 这一段月份的分表。

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

本章要让 Nginx 做三件事：

- 对外提供前端静态页面：访问 `http://8.138.93.199/` 时返回 `client/dist`。
- 代理后端接口：把 `/api/*` 和 `/project/<id>/api/*` 转发到本机 `127.0.0.1:3000`。
- 接收 SDK 打点：按照请求完成时间，把 `/dig?d=...` 直接写入 `/var/log/nginx/fee-minute/YYYY/MM/DD/HH/mm.log`，供 `SaveLog:Nginx` 在下一分钟读取。

### 11.1 准备分钟日志目录和权限

动态 `access_log` 不会帮我们创建多级父目录。因此需要提前创建当前小时和下一小时目录：

```text
/var/log/nginx/fee-minute/YYYY/MM/DD/HH/
```

Nginx worker 需要在目录中创建分钟文件，PM2 下的普通部署用户 `fee` 需要读取这些文件。

#### 11.1.1 把 `fee` 加入 `adm` 组

```bash
sudo usermod -aG adm fee
newgrp adm
```

逐条说明：

| 命令 | 含义 | 作用 |
| --- | --- | --- |
| `sudo usermod -aG adm fee` | 用管理员权限把用户 `fee` 追加加入 `adm` 用户组 | `adm` 组在 Ubuntu/Debian 上常用于授予系统日志读取权限；`-aG` 表示追加到附加组，不覆盖原有组 |
| `newgrp adm` | 在当前终端开启一个以 `adm` 为当前组的新 shell | 让当前会话尽快识别新的组权限；如果不生效，退出 SSH 后重新登录即可 |

前面第二章已经创建过部署用户，并把它加入 `sudo` 组：

```bash
adduser fee
usermod -aG sudo fee
su - fee
```

这里的 `fee`、`sudo`、`adm` 不是一回事：

| 用户或用户组 | 作用 | 和本项目的关系 |
| --- | --- | --- |
| `fee` 用户 | 普通部署用户 | 用来拉代码、安装依赖、构建项目、运行 PM2 |
| `fee` 组 | 创建 `fee` 用户时通常自动创建的同名主组 | 主要用于 `/opt/fee-pro` 这类项目文件的普通读写权限 |
| `sudo` 组 | 允许用户手动执行 `sudo <命令>` | 适合手动执行 `sudo systemctl reload nginx`、`sudo vim /etc/nginx/...` 等运维命令 |
| `adm` 组 | 授予读取部分系统日志的权限 | 让 `fee` 用户以普通身份读取 `/var/log/nginx/fee-minute/` 下的分钟分片 |

`sudo` 组并不表示普通后台进程自动拥有 `/var/log/nginx/` 读取权限。PM2 下的 `fee-task-manager` 和 `SaveLog:Nginx` 不会自动带着 `sudo` 权限，也不会在读取文件时帮你输入 sudo 密码。因此不要为了读日志而把 Node 任务改成 `sudo node ...` 或用 root 跑。

#### 11.1.2 确认 Nginx worker 用户

这里必须先确认 Nginx worker 的运行用户，因为后续要把分钟日志目录的所有者设置成这个用户。Nginx worker 需要在目录中创建 `mm.log` 文件；用户设置错误时，`/dig` 请求可能因为日志目录无写权限而记录失败。

执行：

```bash
grep -n '^user' /etc/nginx/nginx.conf
ps -eo user,group,comm | grep '[n]ginx'
```

第一条命令检查配置文件中声明的 worker 用户：

```bash
grep -n '^user' /etc/nginx/nginx.conf
```

- `grep` 用于搜索文本；
- `-n` 同时显示匹配内容的行号；
- `^user` 只匹配以 `user` 开头的配置行；
- 典型输出 `1:user www-data;` 表示配置要求 worker 使用 `www-data` 用户。

第二条命令检查当前实际运行的 Nginx 进程：

```bash
ps -eo user,group,comm | grep '[n]ginx'
```

- `ps -eo user,group,comm` 列出进程所属用户、所属组和进程名；
- 管道符 `|` 把结果交给后面的 `grep`；
- `grep '[n]ginx'` 只保留 Nginx 进程，并避免把 `grep` 命令自身误显示为查询结果。

典型输出：

```text
root      root      nginx
www-data  www-data  nginx
www-data  www-data  nginx
```

第一行通常是 Nginx master 主进程，以 `root` 运行属于正常现象；后面的 `www-data` 行是实际处理请求的 worker 进程。本节需要使用的是 **worker 用户**，不要把 master 的 `root` 填入目录准备脚本。

两条命令都要执行，因为它们检查的对象不同：

| 命令 | 检查对象 | 作用 |
| --- | --- | --- |
| `grep -n '^user' ...` | 磁盘上的静态配置 | 确认 Nginx 配置期望使用哪个 worker 用户 |
| `ps -eo ...` | 当前运行状态 | 确认配置生效后，实际是哪一个用户在处理请求 |

配置文件可能尚未重新加载，也可能由其他配置或启动方式影响，因此最终应以 `ps` 显示的实际 worker 用户为准，同时检查它为什么与配置不一致。

Ubuntu 通过 apt 安装的 Nginx 通常使用 `www-data`。如果实际 worker 显示为 `nginx` 或其他用户，后续的 `sudo install -d -o www-data ...` 以及脚本中的 `NGINX_WORKER_USER='www-data'` 都要替换成实际用户名。

这两条命令都只读取配置和进程信息，不会修改文件、重启 Nginx，也不会影响当前网站访问。如果第一条没有输出，可以再执行下面这个兼容行首空格的检查：

```bash
grep -nE '^[[:space:]]*user[[:space:]]' /etc/nginx/nginx.conf
```

#### 11.1.3 创建目录准备脚本（定义“做什么”）

Nginx 可以根据请求时间生成 `YYYY/MM/DD/HH/mm.log` 文件名，但不会自动创建路径中的多级父目录。小时、日期发生变化后，如果对应的 `YYYY/MM/DD/HH/` 目录不存在，Nginx 就无法写入新的分钟日志。

因此，本节先创建一个可重复执行的目录准备脚本，负责：

- 创建当前小时目录；
- 提前创建下一小时目录，避免整点切换时目录不存在；
- 把目录所有者设为 Nginx worker 用户；
- 把所属组设为 `adm`，让 `fee` 用户能够读取日志。

本节和下一节不是一条连续的 Shell 命令，而是三个互相关联的组件：

| 组件 | 定义的内容 | 能否单独使用 | 依赖关系 |
| --- | --- | --- | --- |
| `fee-prepare-nginx-log-dirs.sh` | 具体创建哪些目录、设置什么权限 | 可以手工执行 | 不依赖 systemd |
| `fee-log-dir-prepare.service` | systemd 应当执行哪个脚本 | 可以手工触发 | 依赖上面的脚本存在且可执行 |
| `fee-log-dir-prepare.timer` | 什么时候触发 service | 不能独立完成目录创建 | 依赖同名 service |

它们组合后的调用关系是：

```text
fee-log-dir-prepare.timer
        每隔 5 分钟触发
                ↓
fee-log-dir-prepare.service
        以 root 权限执行
                ↓
fee-prepare-nginx-log-dirs.sh
        创建当前小时和下一小时目录
```

先创建专用日志根目录：

```bash
sudo install -d -o www-data -g adm -m 2750 /var/log/nginx/fee-minute
```

然后创建 `/usr/local/sbin/fee-prepare-nginx-log-dirs.sh`：

```bash
sudo tee /usr/local/sbin/fee-prepare-nginx-log-dirs.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

NGINX_WORKER_USER='www-data'
LOG_GROUP='adm'

for hour_offset in 0 1; do
  log_dir=$(date -d "+${hour_offset} hour" '+/var/log/nginx/fee-minute/%Y/%m/%d/%H')
  install -d -o "$NGINX_WORKER_USER" -g "$LOG_GROUP" -m 2750 "$log_dir"
done
EOF

sudo chmod 750 /usr/local/sbin/fee-prepare-nginx-log-dirs.sh
sudo /usr/local/sbin/fee-prepare-nginx-log-dirs.sh
```

上面代码块包含三个依次执行的操作：

1. `sudo tee ... <<'EOF'` 到单独一行的 `EOF`：创建或覆盖脚本文件；
2. `sudo chmod 750 ...`：赋予脚本所有者执行权限；
3. `sudo /usr/local/sbin/fee-prepare-nginx-log-dirs.sh`：立即手工执行一次，不等待 systemd 定时器。

例如当前时间是 `2026-07-27 14:30`，脚本会创建或检查：

```text
/var/log/nginx/fee-minute/2026/07/27/14
/var/log/nginx/fee-minute/2026/07/27/15
```

目录权限 `2750` 中的首位 `2` 是 setgid。Nginx 创建的分钟文件会继承目录的 `adm` 组，`fee` 用户可通过 `adm` 组读取。

脚本可以重复运行，已存在的目标目录不会被重复创建，但其所有者、所属组和权限会重新确保为脚本指定的值。只运行本节可以解决当前和下一小时的目录问题，但不能覆盖更久之后的新小时，因此还需要下一节的自动调度。

#### 11.1.4 配置 systemd 自动准备目录（定义“如何、何时执行”）

本节不会重新实现目录创建逻辑，而是让 systemd 自动调用 `11.1.3` 创建的脚本。它包含 service 和 timer 两层：

- service 负责“如何执行”，即以一次性系统任务运行脚本；
- timer 负责“何时执行”，即启动后和运行期间定时触发 service。

创建 service：

```bash
sudo tee /etc/systemd/system/fee-log-dir-prepare.service > /dev/null <<'EOF'
[Unit]
Description=Prepare fee Nginx minute log directories
Before=nginx.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/fee-prepare-nginx-log-dirs.sh

[Install]
WantedBy=multi-user.target
EOF
```

service 中的关键配置：

| 配置 | 含义 |
| --- | --- |
| `Type=oneshot` | 脚本执行完毕后任务即结束，不需要常驻后台 |
| `ExecStart=...` | 指向 `11.1.3` 创建的目录准备脚本 |
| `Before=nginx.service` | 开机启动时优先准备目录，再启动 Nginx |
| `WantedBy=multi-user.target` | 允许将该 service 加入系统正常启动流程 |

创建 timer：

```bash
sudo tee /etc/systemd/system/fee-log-dir-prepare.timer > /dev/null <<'EOF'
[Unit]
Description=Prepare fee Nginx minute log directories periodically

[Timer]
OnBootSec=10s
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF
```

timer 中的关键配置：

| 配置 | 含义 |
| --- | --- |
| `OnBootSec=10s` | 系统启动约 10 秒后触发一次 |
| `OnUnitActiveSec=5min` | 此后约每 5 分钟再次触发 |
| `WantedBy=timers.target` | 允许 timer 随 systemd 定时器系统启动 |

timer 默认触发与它同名的 `fee-log-dir-prepare.service`，service 再执行脚本。timer 自己不创建目录。

启用并检查：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fee-log-dir-prepare.service
sudo systemctl enable --now fee-log-dir-prepare.timer

CURRENT_LOG_DIR=$(date '+/var/log/nginx/fee-minute/%Y/%m/%d/%H')
NEXT_LOG_DIR=$(date -d '+1 hour' '+/var/log/nginx/fee-minute/%Y/%m/%d/%H')

ls -ld /var/log/nginx/fee-minute "$CURRENT_LOG_DIR" "$NEXT_LOG_DIR"
groups fee
sudo -u www-data test -w "$CURRENT_LOG_DIR" && echo 'nginx directory writable'
sudo -u fee test -x "$CURRENT_LOG_DIR" && echo 'fee directory readable'
```

这些命令也需要按顺序执行：

1. `daemon-reload`：让 systemd 重新读取刚创建的 service 和 timer；
2. 第一条 `enable --now`：加入开机启动，并立即执行一次 service；
3. 第二条 `enable --now`：加入开机启动，并立即启动 timer；
4. 后续命令：检查当前、下一小时目录及相关用户权限。

预期：

- 三个目录的所有者是 `www-data`，所属组是 `adm`，权限包含 setgid；
- `groups fee` 包含 `adm`；
- 最后两条检查分别输出 `nginx directory writable` 和 `fee directory readable`。
- `fee-log-dir-prepare.timer` 应保持 `active (waiting)`。

由于 service 使用 `Type=oneshot`，脚本成功执行后，`fee-log-dir-prepare.service` 可能显示为 `inactive (dead)`，这是一次性任务执行完成后的正常状态，不代表失败。可以用下面的命令查看最近一次执行结果：

```bash
sudo systemctl status fee-log-dir-prepare.service --no-pager
sudo journalctl -u fee-log-dir-prepare.service -n 30 --no-pager
sudo systemctl status fee-log-dir-prepare.timer --no-pager
```

如果实际 Nginx worker 用户不是 `www-data`，同步替换以上命令和脚本中的用户名。如果 `fee` 的组权限尚未被 PM2 进程继承，稍后重启 `fee-task-manager` 即可。

### 11.2 写入 Nginx 站点配置

先确认前端构建产物存在：

```bash
ls -l /opt/fee-pro/client/dist/index.html
```

如果文件不存在，请先回到第九章执行前端构建。然后写入 Nginx 配置文件。

注意：把下面配置里的 `8.138.93.199` 替换成你的 ECS 公网 IP；如果没有域名，可以先保留或删除 `test.com`。

```bash
sudo tee /etc/nginx/conf.d/fee-pro.conf > /dev/null <<'NGINX'
map $time_iso8601 $fee_minute_log {
    ~^(?<fee_year>\d{4})-(?<fee_month>\d{2})-(?<fee_day>\d{2})T(?<fee_hour>\d{2}):(?<fee_minute>\d{2}) /var/log/nginx/fee-minute/$fee_year/$fee_month/$fee_day/$fee_hour/$fee_minute.log;
    default /var/log/nginx/fee-minute/fallback.log;
}

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
        access_log $fee_minute_log fee_main;

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

### 11.3 配置文件写入命令说明

重点是第一行：

```bash
sudo tee /etc/nginx/conf.d/fee-pro.conf > /dev/null <<'NGINX'
```

| 片段 | 含义 | 作用 |
| --- | --- | --- |
| `sudo` | 用管理员权限执行 | `/etc/nginx/conf.d/` 是系统配置目录，普通用户通常不能写 |
| `tee /etc/nginx/conf.d/fee-pro.conf` | 把后面的多行内容写入指定文件 | 创建或覆盖 fee-pro 的 Nginx 站点配置 |
| `> /dev/null` | 丢弃 `tee` 默认打印到终端的内容 | 避免整份 Nginx 配置在终端重复刷屏 |
| `<<'NGINX'` | Here Document，多行文本输入开始 | 从下一行开始，直到单独一行 `NGINX` 为止，中间内容都会写入文件 |

`<<'NGINX'` 的单引号很重要。Nginx 配置里有 `$host`、`$request_uri`、`$remote_addr` 等 Nginx 变量，如果没有单引号，Shell 可能提前把它们当作 Linux 环境变量展开，导致写入的 Nginx 配置不正确。

最后一行单独的：

```bash
NGINX
```

表示多行输入结束。

### 11.4 Nginx 配置内容说明

#### 11.4.1 动态分钟路径和 `log_format fee_main`

`map` 从 `$time_iso8601` 中提取年月日时分，生成完整日志路径：

```nginx
map $time_iso8601 $fee_minute_log {
    ~^(?<fee_year>\d{4})-(?<fee_month>\d{2})-(?<fee_day>\d{2})T(?<fee_hour>\d{2}):(?<fee_minute>\d{2}) /var/log/nginx/fee-minute/$fee_year/$fee_month/$fee_day/$fee_hour/$fee_minute.log;
    default /var/log/nginx/fee-minute/fallback.log;
}
```

例如 Nginx 在 `2026-07-23 10:30` 完成的 `/dig` 请求会写入：

```text
/var/log/nginx/fee-minute/2026/07/23/10/30.log
```

动态日志路径不会自动创建父目录，所以前面的 `fee-log-dir-prepare.timer` 必须保持运行。

```nginx
log_format fee_main '...';
```

这行定义了名为 `fee_main` 的 Nginx 日志格式。`/dig` 打点入口会使用它写入 SDK 上报日志：

```nginx
access_log $fee_minute_log fee_main;
```

这个格式使用 `\t` 作为字段分隔符。服务端 `SaveLog:Nginx` 读取日志时会按 Tab 切割字段，并从固定位置取出请求地址、User-Agent 和 IP 等信息，所以不要随意调整字段顺序。尤其是 `$request_uri` 很关键，SDK 上报数据在 `/dig?d=...` 的 `d` 参数里。

Linux 下 `SaveLog:Nginx` 每分钟只读取上一个完整分钟的文件，不会回退读取 `fee-access.log`。

#### 11.4.2 `server` 和 `location`

| 配置 | 作用 |
| --- | --- |
| `listen 80` | 监听 HTTP 80 端口 |
| `server_name 8.138.93.199 test.com` | 指定这个站点响应的 IP 或域名 |
| `root /opt/fee-pro/client/dist` | 指向 Vue 前端生产构建目录 |
| `access_log /var/log/nginx/fee-web-access.log` | 记录普通网页访问日志 |
| `error_log /var/log/nginx/fee-error.log` | 记录 Nginx 错误日志 |
| `location = /dig` | SDK 打点入口，返回 1px 空 GIF，并按请求时间写入动态分钟分片 |
| `location ^~ /api/` | 把后台管理接口转发到后端 `127.0.0.1:3000` |
| `location ~ ^/project/\d+/api/` | 把项目维度接口转发到后端 `127.0.0.1:3000` |
| `location ~* \.(...)$` | 静态资源缓存规则 |
| `location /` | Vue 单页应用兜底，刷新前端路由时返回 `index.html` |
| `location ~ /\.(git|env)` | 禁止访问 `.git`、`.env` 等敏感路径 |

`/api/` 和 `/project/<id>/api/` 代理到的是本机后端端口 `3000`。在第十二章启动后端之前，这些接口可能还不可用，但前端静态页面本身应该能由 Nginx 返回。

### 11.5 检查、启动并重载 Nginx

写完配置后执行：

```bash
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

逐条说明：

| 命令 | 含义 | 作用 |
| --- | --- | --- |
| `sudo nginx -t` | 测试 Nginx 配置语法 | 只检查配置，不启动也不重载。看到 `syntax is ok` 和 `test is successful` 才继续 |
| `sudo systemctl enable --now nginx` | 设置 Nginx 开机自启，并立即启动 | 第一次部署时执行，确保 Nginx 当前已启动，重启 ECS 后也会自动启动 |
| `sudo systemctl reload nginx` | 平滑重新加载 Nginx 配置 | 让刚写入的 `fee-pro.conf` 生效；以后每次改 Nginx 配置后都应先 `nginx -t` 再 `reload` |

如果 `sudo nginx -t` 报错，不要继续执行 `reload`，先根据错误行号修复配置。

### 11.6 访问前检查

确认 Nginx 本机能返回前端：

```bash
curl -I http://127.0.0.1/
```

预期返回 `HTTP/1.1 200 OK` 或其他 2xx/3xx 状态。如果返回 404、403 或 502，先看 Nginx 错误日志：

```bash
sudo tail -n 80 /var/log/nginx/fee-error.log
sudo tail -n 80 /var/log/nginx/error.log
```

确认阿里云安全组和系统防火墙已经放行 HTTP 80 端口。安全组入方向需要允许：

```text
协议：自定义 TCP
端口范围：80/80
授权对象：0.0.0.0/0
```

如果启用了 UFW，也要确认：

```bash
sudo ufw status verbose
```

里面包含 `80/tcp ALLOW`。

浏览器访问：

```text
http://8.138.93.199/
```

此时前端静态页面应能打开。后端还会在第十二章启动，所以登录接口或 `/api/*` 在这一步暂时不可用是正常的。

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

本节中几个命令说明：

| 命令 | 含义 | 作用 |
| --- | --- | --- |
| `cd /opt/fee-pro/server` | 切换当前终端目录到服务端项目目录 | 后续 `pm2 start`、查看日志、执行服务端脚本等命令都默认在 `server` 目录下运行，避免路径找不到配置文件或 PM2 配置文件 |
| `mkdir -p log/pm2/app log/pm2/command` | 创建 PM2 日志目录 | `-p` 表示父目录不存在时一并创建，目录已存在时不报错。这里提前创建 `fee-app` 和 `fee-task-manager` 配置中使用的日志目录，避免 PM2 写日志时报目录不存在 |
| `pm2 logs fee-app --lines 80` | 查看 PM2 中 `fee-app` 进程最近 80 行日志 | 用来确认 Web/API 服务是否启动成功，以及是否有端口占用、数据库连接失败、配置错误等异常 |
| `curl http://127.0.0.1:3000/api/login/type` | 在 ECS 本机访问后端登录类型接口 | 绕过 Nginx 和公网安全组，直接验证 Node/Express 后端 `3000` 端口是否正常工作。正常应返回 JSON，内容里能看到登录类型为 `normal` |

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

这条命令的作用是：让 PM2 为当前服务器生成并注册一个 `systemd` 开机启动服务。以后 ECS 重启后，系统会先启动 PM2，再由 PM2 恢复你通过 `pm2 save` 保存的进程列表，例如 `fee-app` 和 `fee-task-manager`。

命令拆开看：

| 片段 | 含义 | 作用 |
| --- | --- | --- |
| `sudo` | 用管理员权限执行 | 注册 systemd 服务需要写入系统级服务配置，普通用户没有权限 |
| `env PATH=$PATH:/home/fee/.nvm/versions/node/v12.22.12/bin` | 在 sudo 环境里补充 Node.js 的 PATH | 使用 nvm 安装 Node 时，Node 不在系统默认路径里；这里告诉 systemd/PM2 去哪里找 `node` |
| `/home/fee/.nvm/versions/node/v12.22.12/lib/node_modules/pm2/bin/pm2` | PM2 可执行文件的完整路径 | 避免 sudo 环境找不到 `pm2` 命令 |
| `startup systemd` | 让 PM2 生成 systemd 启动脚本 | 适用于 Ubuntu 这类使用 systemd 管理服务的系统 |
| `-u fee` | 指定开机后用 `fee` 用户运行 PM2 | 保持应用仍由普通部署用户运行，不用 root 跑项目 |
| `--hp /home/fee` | 指定 `fee` 用户的 home 目录 | 让 PM2 能找到该用户自己的 PM2 配置和进程列表 |

注意：不要直接照抄固定路径。`/home/fee/.nvm/versions/node/v12.22.12/...` 要以你服务器上 `pm2 startup` 实际输出为准；如果 Node 版本、用户名或安装方式不同，这里的路径也会不同。

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

### 13.1 已按旧版单文件配置完成本章时的迁移步骤

如果此前按照旧版文档，把 `/dig` 配成写入 `/var/log/nginx/fee-access.log`，并且已经完成登录验证，不需要重装数据库、Redis、依赖或重新初始化项目。只迁移日志链路即可。

先暂停任务进程，避免迁移期间自动读取或手工验证互相干扰。`fee-app` 不需要停止，管理后台仍可访问：

```bash
pm2 stop fee-task-manager
pm2 list
```

然后依次完成：

1. 把包含最新 `server/src/commands/save_log/parseNginxLog.js` 的代码同步到 ECS。
2. 按 `8.3` 把 `testing.nginxLogFilePath` 改为 `/var/log/nginx/fee-minute/`。
3. 按 `11.1.2` 到 `11.1.4` 创建分钟目录准备脚本、service 和 timer。
4. 用 `11.2` 的最新内容覆盖 `/etc/nginx/conf.d/fee-pro.conf`。
5. 重新构建 Server：

   ```bash
   cd /opt/fee-pro/server
   npm run build
   ```

6. 检查并重载 Nginx：

   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   sudo systemctl status fee-log-dir-prepare.timer --no-pager
   ```

旧的 `/var/log/nginx/fee-access.log` 可以暂时保留作为迁移前记录。新配置生效后，新的 `/dig` 请求不再写入它。确认第十四章全部跑通后，再单独归档或删除旧文件。

此时先不要恢复 `fee-task-manager`，继续执行第十四章的手工链路验证；第 `14.5` 小节会恢复任务进程。

## 十四、验证 SDK 打点链路

### 14.1 先验证 `/dig` 能写入 Nginx 日志

如果 `fee-task-manager` 仍在运行，先暂停它，避免自动任务提前消费测试分片：

```bash
pm2 stop fee-task-manager
```

然后在同一个 SSH 终端执行：

```bash
TEST_MINUTE=$(date '+%Y/%m/%d/%H/%M')
TEST_LOG_FILE="/var/log/nginx/fee-minute/${TEST_MINUTE}.log"

D=$(node -e "const log={type:'error',code:8,detail:{error_no:'ECS_DEPLOY_TEST',url:'http://8.138.93.199/deploy-test',http_code:0,during_ms:0,request_size_b:0,response_size_b:0},extra:{desc:'manual deploy test'},common:{pid:'template',uuid:'deploy-test-uuid',ucid:'deploy-user',timestamp:Date.now(),version:'1.0.0'}};process.stdout.write(encodeURIComponent(JSON.stringify(log)))")
curl -I "http://127.0.0.1/dig?d=${D}"
echo "$TEST_LOG_FILE"
sudo tail -n 1 "$TEST_LOG_FILE"
sudo -u fee test -r "$TEST_LOG_FILE" && echo 'fee log readable'
```

预期：

- `curl` 返回 `HTTP/1.1 200 OK`。
- 当前分钟对应的 `YYYY/MM/DD/HH/mm.log` 新增一行。
- 日志行中包含 `/dig?d=...`。
- 最后一条检查输出 `fee log readable`。

如果命令刚好跨越分钟边界，`TEST_LOG_FILE` 可能指向请求前一分钟。重新执行本小节即可。

### 14.2 手动执行保存日志命令

`SaveLog:Nginx` 只读取上一分钟的完整分片。因此保持在完成 `14.1` 的同一个 SSH 终端中，等待 `TEST_MINUTE` 结束后再执行：

```bash
while [ "$(date '+%Y/%m/%d/%H/%M')" = "$TEST_MINUTE" ]; do sleep 1; done

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

- `server/src/configs/common.js` 中 `testing.nginxLogFilePath` 是否是 `/var/log/nginx/fee-minute/`。
- 上一分钟的 `/var/log/nginx/fee-minute/YYYY/MM/DD/HH/mm.log` 是否存在。
- `fee` 用户是否能读取该分钟文件。
- `fee-log-dir-prepare.timer` 是否为 `active`。
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

### 14.5 恢复自动任务

完成 `14.1` 到 `14.4` 后恢复任务进程：

```bash
cd /opt/fee-pro/server
pm2 restart fee-task-manager --update-env
pm2 save
pm2 list
pm2 logs fee-task-manager --lines 80
```

预期 `fee-task-manager` 为 `online`。后续每分钟会自动读取上一分钟的 Nginx 分片。

`pm2 logs` 会持续跟踪输出；确认没有报错后按 `Ctrl+C` 退出日志查看，不会停止 PM2 中的进程。

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

CURRENT_FEE_LOG=$(date '+/var/log/nginx/fee-minute/%Y/%m/%d/%H/%M.log')
sudo tail -f "$CURRENT_FEE_LOG"

sudo tail -f /var/log/nginx/fee-error.log
```

分钟切换后会生成新文件，原来的 `tail -f` 不会自动跳到新路径，需要重新执行 `CURRENT_FEE_LOG=...` 和 `tail -f`。

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
sed -n '/-- Adminer 4.3.1 MySQL dump/,$p' project_2.sql > project_2.clean.sql
mysql -h 127.0.0.1 -u fee_test -p platform_test < project_2.clean.sql
```

业务 SDK 的 `pid` 应填项目的 `project_name`，不是数字 ID。

## 十七、日志轮转

### 17.1 Nginx 日志轮转

动态分钟日志是已经完成的独立文件，不再交给 logrotate 重命名。logrotate 这里只处理普通网页访问日志和错误日志。

创建：

```bash
sudo tee /etc/logrotate.d/fee-pro-nginx > /dev/null <<'EOF'
/var/log/nginx/fee-web-access.log /var/log/nginx/fee-error.log {
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

### 17.2 清理旧的分钟日志

分钟日志不需要再次轮转，但必须定期删除，避免长期占满磁盘。创建清理脚本：

```bash
sudo tee /usr/local/sbin/fee-clean-nginx-minute-logs.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

LOG_ROOT='/var/log/nginx/fee-minute'

if [[ ! -d "$LOG_ROOT" ]]; then
  exit 0
fi

find "$LOG_ROOT" -type f -name '*.log' -mtime +14 -delete
find "$LOG_ROOT" -depth -mindepth 1 -type d -empty -delete

# 清理空目录后，立即恢复 Nginx 当前小时和下一小时所需目录。
/usr/local/sbin/fee-prepare-nginx-log-dirs.sh
EOF

sudo chmod 750 /usr/local/sbin/fee-clean-nginx-minute-logs.sh
```

创建每日清理 service：

```bash
sudo tee /etc/systemd/system/fee-nginx-minute-log-clean.service > /dev/null <<'EOF'
[Unit]
Description=Clean old fee Nginx minute logs

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/fee-clean-nginx-minute-logs.sh
EOF
```

创建 timer：

```bash
sudo tee /etc/systemd/system/fee-nginx-minute-log-clean.timer > /dev/null <<'EOF'
[Unit]
Description=Clean old fee Nginx minute logs daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
EOF
```

启用并检查：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fee-nginx-minute-log-clean.timer
sudo systemctl list-timers --all | grep fee-
```

这里仅删除 `/var/log/nginx/fee-minute/` 专用目录下超过 14 天的 `.log` 文件，不会影响普通 Nginx 日志。

### 17.3 PM2 日志轮转

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

长期方案是按第 `6.1` 小节同步修改 `server/src/configs/redis.js` 和 `server/src/library/redis/index.js`，给 `new Redis()` 增加 `password`，必要时同时增加 `username` 和 `db`。

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
PREVIOUS_LOG=$(date -d '1 minute ago' '+/var/log/nginx/fee-minute/%Y/%m/%d/%H/%M.log')
echo "$PREVIOUS_LOG"
sudo ls -l "$PREVIOUS_LOG"
sudo tail -n 3 "$PREVIOUS_LOG"

cd /opt/fee-pro/server
npm run test_fee -- SaveLog:Nginx
find log/kafka -type f | sort | tail -20
```

如果上一分钟分片有数据但 `log/kafka/json` 没有数据：

- 检查 `testing.nginxLogFilePath` 是否是 `/var/log/nginx/fee-minute/`。
- 检查 `fee-log-dir-prepare.timer` 是否运行。
- 检查目录所有者是否是 Nginx worker、所属组是否是 `adm`。
- 检查 `fee` 用户是否能读取上一分钟分片。
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
- `/dig` 能写入 `/var/log/nginx/fee-minute/YYYY/MM/DD/HH/mm.log`。
- `SaveLog:Nginx` 能生成 `server/log/kafka/json` 文件。
- `Parse:Monitor` 能把手工打点写入 `t_o_monitor_1_YYYYMM`。
- `fee-app` 和 `fee-task-manager` 在 PM2 中稳定运行。
