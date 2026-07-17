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

不要在安全组放开：

- `3000`：Node 后端只给 Nginx 本机代理。
- `3306`：数据库只允许本机访问。
- `6379`：Redis 只允许本机访问。

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

如果启用 `ufw` 前 SSH 端口不是 22，请先放开你的实际 SSH 端口。

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

### 5.3 可选：使用 MySQL 8.0.12

如果你的本地 Windows 环境使用 MySQL 8.0.12 且已经跑通，Ubuntu 测试环境也可以使用 MySQL 8.0.12。需要注意的是，关键差异不在操作系统，而在连接账号使用的认证插件。

MySQL 8.0.12 默认可能给新账号使用 `caching_sha2_password`，而本项目依赖的旧 `mysql@2.15.0` 驱动更适合连接 `mysql_native_password` 账号。Windows 能正常连接，通常是因为安装 MySQL 时选择了兼容 MySQL 5.x 的旧认证方式，或连接账号后来被改成了 `mysql_native_password`。

如果你决定使用 MySQL 8.0.12：

- 不要同时让 MariaDB 和 MySQL 监听同一个 `3306` 端口，测试环境二选一即可。
- Ubuntu 默认仓库未必能直接安装指定的 MySQL `8.0.12`，如果公司要求固定这个版本，建议使用公司统一安装包或 MySQL 官方 APT 仓库并锁定版本。
- `server/src/configs/mysql.js` 里的 `testing.host` 是 `127.0.0.1`，所以至少要创建 `'fee_test'@'127.0.0.1'`；为了方便命令行本机登录，也可以同时创建 `'fee_test'@'localhost'`。

MySQL 服务启动命令通常是：

```bash
sudo systemctl enable --now mysql
sudo systemctl status mysql
```

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

能看到 `8.0.12` 或你的目标 MySQL 版本号，说明数据库侧已经准备好。后续 `8.1` 的项目配置仍按同样的 `host`、`user`、`password`、`database` 填写。

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

### 7.2 从你的仓库拉取

把下面的 `<your-fee-pro-git-url>` 替换成你自己的仓库地址。

```bash
git clone --depth 1 <your-fee-pro-git-url> /opt/fee-pro
cd /opt/fee-pro
git status --short
```

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
