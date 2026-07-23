# Nginx 分钟日志生成方案与 fee-pro 设计分析

## 一、问题范围

本文只分析 Linux 环境下、不使用 Kafka 时，如何为 fee-pro 生成下面这种分钟日志：

```text
<nginxLogFilePath>/YYYY/MM/DD/HH/mm.log
```

例如：

```text
/var/log/nginx/fee-minute/2026/07/23/10/30.log
```

分析以项目源码为准，主要涉及：

- `server/src/commands/task/manage.js`
- `server/src/commands/save_log/parseNginxLog.js`
- `server/src/commands/save_log/base.js`
- `server/src/library/kafka/index.js`
- `server/src/configs/common.js`

本文不讨论 Windows 测试用的 `Utils:SplitLog`。

## 二、先说结论

fee-pro 的核心代码没有负责生成 Linux Nginx 分钟日志。

它的实际假设是：

```text
Nginx 或外部日志工具已经准备好上一分钟的完整日志文件
                              ↓
SaveLog:Nginx 找到该文件并从头读取
                              ↓
转换为 server/log/kafka/raw 和 json 分钟文件
                              ↓
Parse、Summary 任务继续处理并写入数据库
```

生成输入分钟文件主要有两种方案：

1. Nginx 使用带时间变量的动态 `access_log` 路径，请求直接写入对应分钟文件。
2. Nginx 始终写一个活动文件，由外部定时任务每分钟重命名该文件，并通知 Nginx 重新打开活动日志。

两种方案都需要外部运维机制。Nginx 可以使用变量日志路径，但不会自动创建多级父目录，也不会自动清理历史日志。

针对当前 fee-pro ECS 测试环境：

- 低流量、希望尽量保持现有后端代码不变：更适合方案一。
- 正式高流量环境：通常不建议把 Nginx 分钟文件当作消息队列，更常见的是“固定活动日志 + 增量采集器 + Kafka/集中日志系统”。

## 三、fee-pro 对输入日志的实际要求

### 3.1 每分钟启动一次接收任务

`server/src/commands/task/manage.js` 根据 `commonConfig.use.kafka` 选择输入来源：

```js
if (isUsingKafka) {
  that.execCommand('SaveLog:Kafka', [])
} else {
  that.execCommand('SaveLog:Nginx', [])
}
```

当前调度表达式在每分钟第 0 秒触发：

```js
schedule.scheduleJob('0 */1 * * * *', function () {
  // ...
})
```

### 3.2 Linux 只读取上一分钟文件

`server/src/commands/save_log/parseNginxLog.js` 先计算当前时间减 60 秒：

```js
const timeMoment = moment.unix(moment().unix() - 60)
```

然后拼接 Linux 日志路径：

```js
logAbsolutePath = path.join(
  nginxLogFilePath,
  `${timeMoment.format('YYYY/MM/DD/HH/mm')}.log`
)
```

假设任务在 `10:31:00` 运行，它会读取：

```text
<nginxLogFilePath>/2026/07/23/10/30.log
```

### 3.3 后端不会创建输入文件

`SaveLog:Nginx` 对输入日志只执行：

```js
fs.existsSync(logAbsolutePath)
fs.createReadStream(logAbsolutePath)
```

它不会：

- 创建 Nginx 日期目录；
- 创建输入日志文件；
- 移动或重命名 Nginx 活动日志；
- 保存单文件读取偏移量；
- 通知 Nginx 重新打开日志；
- 清理 Nginx 输入日志。

### 3.4 后端会创建自己的输出分钟文件

输入日志解析成功后，`SaveLogBase.getWriteStreamClientByType()` 会通过 `shell.mkdir('-p', logPath)` 创建输出目录，然后追加写入：

```text
server/log/kafka/raw/month_YYYYMM/day_DD/HH/mm.log
server/log/kafka/json/month_YYYYMM/day_DD/HH/mm.log
```

这里的 `kafka` 只是项目历史目录名。即使输入来源是 Nginx，输出仍然写在 `server/log/kafka/` 下。

### 3.5 日志格式必须与解析代码一致

`server/src/commands/save_log/base.js` 使用 Tab 分割日志，并依赖固定位置：

| 下标 | 含义 |
| --- | --- |
| `info[0]` | ISO 8601 格式的 Nginx 日志时间 |
| `info[3]` 或 `info[4]` | 客户端 IP |
| `info[15]` | `/dig?d=...` 请求地址 |
| `info[17]` | User-Agent |

因此，不管采用哪种分钟文件生成方案，都必须保持 Nginx `log_format` 的字段顺序不变。

## 四、方案一：Nginx 动态路径直接写分钟文件

### 4.1 工作方式

Nginx 根据每个请求完成时的 `$time_iso8601`，把日志直接写入对应分钟文件：

```text
10:30:00 ~ 10:30:59
    -> /var/log/nginx/fee-minute/2026/07/23/10/30.log

10:31:00 ~ 10:31:59
    -> /var/log/nginx/fee-minute/2026/07/23/10/31.log
```

这里不存在“先写大文件、再切开”的过程。分钟路径本身就是 Nginx 的目标日志文件。

### 4.2 配置时间到日志路径的映射

`map` 必须放在 Nginx 的 `http` 上下文中。Ubuntu 默认会在 `http` 中加载 `/etc/nginx/conf.d/*.conf`，但应先检查本机 `/etc/nginx/nginx.conf`。

示例：

```nginx
map $time_iso8601 $fee_minute_log {
    ~^(?<fee_year>\d{4})-(?<fee_month>\d{2})-(?<fee_day>\d{2})T(?<fee_hour>\d{2}):(?<fee_minute>\d{2})
        /var/log/nginx/fee-minute/$fee_year/$fee_month/$fee_day/$fee_hour/$fee_minute.log;

    default /var/log/nginx/fee-minute/fallback.log;
}
```

然后在 `/dig` 中使用动态路径：

```nginx
location = /dig {
    empty_gif;
    access_log $fee_minute_log fee_main;

    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type" always;
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" always;
}
```

Nginx 官方说明：

- `access_log` 路径允许包含变量；
- 变量日志不支持 buffered write；
- 日志文件会频繁打开、关闭，可以使用 `open_log_file_cache` 缓解；
- Nginx worker 必须有权限在目标目录创建文件。

参考：[Nginx ngx_http_log_module](https://nginx.org/en/docs/http/ngx_http_log_module.html)

### 4.3 提前创建当前和下一小时目录

Nginx 不会自动创建下面这些父目录：

```text
/var/log/nginx/fee-minute/2026/07/23/10/
```

可以使用 systemd timer 定期创建当前小时和下一小时目录。

先确认 Nginx worker 用户：

```bash
grep -n '^user' /etc/nginx/nginx.conf
ps -eo user,group,comm | grep nginx
```

Ubuntu 通常是 `www-data`，其他发行版可能是 `nginx`。

示例脚本 `/usr/local/sbin/fee-prepare-nginx-log-dirs.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

NGINX_WORKER_USER='www-data'
LOG_GROUP='adm'

for hour_offset in 0 1; do
  log_dir=$(date -d "+${hour_offset} hour" '+/var/log/nginx/fee-minute/%Y/%m/%d/%H')
  install -d -o "$NGINX_WORKER_USER" -g "$LOG_GROUP" -m 2750 "$log_dir"
done
```

`2750` 中的首位 `2` 是 setgid。它让新建文件继承目录的 `adm` 组，便于已经加入 `adm` 组的 `fee` 用户读取日志。

对应 service `/etc/systemd/system/fee-log-dir-prepare.service`：

```ini
[Unit]
Description=Prepare fee Nginx minute log directories

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/fee-prepare-nginx-log-dirs.sh
```

对应 timer `/etc/systemd/system/fee-log-dir-prepare.timer`：

```ini
[Unit]
Description=Prepare fee Nginx minute log directories periodically

[Timer]
OnBootSec=10s
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
```

启用前需要给脚本执行权限：

```bash
sudo chmod 750 /usr/local/sbin/fee-prepare-nginx-log-dirs.sh
sudo systemctl daemon-reload
sudo systemctl enable --now fee-log-dir-prepare.timer
sudo systemctl start fee-log-dir-prepare.service
```

### 4.4 调整 fee-pro 日志根目录

为了避免和其他 Nginx 日志混在一起，建议把：

```js
nginxLogFilePath: '/var/log/nginx/'
```

改为：

```js
nginxLogFilePath: '/var/log/nginx/fee-minute/'
```

这样 `SaveLog:Nginx` 查找的路径与 Nginx 动态路径完全一致。

修改 `server/src/configs/common.js` 后，需要重新构建并重启任务进程：

```bash
cd /opt/fee-pro/server
npm run build
pm2 restart fee-task-manager --update-env
```

### 4.5 验证

```bash
sudo nginx -t
sudo systemctl reload nginx

curl -I 'http://127.0.0.1/dig?d=%7B%7D'

current_log=$(date '+/var/log/nginx/fee-minute/%Y/%m/%d/%H/%M.log')
sudo ls -l "$current_log"
sudo tail -n 1 "$current_log"
sudo -u fee test -r "$current_log" && echo readable
```

等到下一分钟后，可以手动执行：

```bash
cd /opt/fee-pro/server
npm run test_fee -- SaveLog:Nginx
find log/kafka/json -type f | sort | tail
```

### 4.6 优点

- 直接生成 fee-pro 需要的路径，不需要移动文件。
- 每个分钟文件天然独立，后端不会重复全量读取活动文件。
- 没有“重命名后 Nginx 尚未重新打开文件”的轮转窗口。
- 很容易判断某一分钟是否缺日志。

### 4.7 缺点

- 变量日志不能使用 Nginx buffered write。
- 高流量时频繁打开、关闭日志文件会增加系统调用开销。
- 必须提前创建目录并正确配置权限。
- 每天生成最多 1440 个文件，长期运行必须清理。
- 多台 Nginx 时，每台机器都会产生自己的分钟文件，后端还需要聚合或分别处理。

## 五、方案二：固定活动文件加外部分钟轮转

### 5.1 工作方式

Nginx 始终写：

```text
/var/log/nginx/fee-access.log
```

每分钟由外部定时任务：

1. 把活动文件重命名成上一分钟的目标路径；
2. 向 Nginx master 发送 `USR1`；
3. Nginx 重新创建并打开新的 `fee-access.log`；
4. fee-pro 稍后读取已完成的上一分钟文件。

流程如下：

```text
fee-access.log
    ↓ mv
fee-minute/YYYY/MM/DD/HH/mm.log
    ↓ USR1
Nginx重新创建fee-access.log
    ↓
SaveLog:Nginx读取已经轮转的mm.log
```

Nginx 官方支持通过 `USR1` 重新打开日志文件，但移动、命名、压缩和清理动作需要外部程序完成。

参考：[Nginx 控制与日志轮转](https://nginx.org/en/docs/control.html#logs)

### 5.2 Nginx 配置

```nginx
location = /dig {
    empty_gif;
    access_log /var/log/nginx/fee-access.log fee_main buffer=64k flush=1s;
}
```

固定文件路径可以使用缓冲写入，通常比动态变量路径更节省文件打开、关闭开销。

### 5.3 外部轮转脚本

示例 `/usr/local/sbin/fee-rotate-nginx-minute-log.sh`：

```bash
#!/usr/bin/env bash
set -euo pipefail

SOURCE_LOG='/var/log/nginx/fee-access.log'
MINUTE_ROOT='/var/log/nginx/fee-minute'
NGINX_PID_FILE='/run/nginx.pid'
LOCK_FILE='/run/fee-nginx-minute-rotate.lock'

exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

target_relative=$(date -d '1 minute ago' '+%Y/%m/%d/%H/%M.log')
target_log="${MINUTE_ROOT}/${target_relative}"
target_dir=$(dirname "$target_log")

if [[ ! -s "$SOURCE_LOG" ]]; then
  exit 0
fi

if [[ -e "$target_log" ]]; then
  echo "Target log already exists: $target_log" >&2
  exit 1
fi

install -d -o root -g adm -m 2750 "$target_dir"
mv "$SOURCE_LOG" "$target_log"
chgrp adm "$target_log"
chmod 0640 "$target_log"
kill -USR1 "$(cat "$NGINX_PID_FILE")"
```

注意：

- `mv` 和目标目录应位于同一个文件系统，使重命名保持原子性。
- 不建议使用 `copytruncate`。复制和清空之间仍可能有新日志写入，存在丢失或重复风险。
- 脚本必须用 `flock` 防止重复执行。
- `fee` 用户需要加入 `adm` 组，才能读取权限为 `0640 root:adm` 的分片文件。
- Nginx PID 文件位置需要按实际系统确认。
- 第一次启用前，旧的 `fee-access.log` 可能包含超过一分钟的数据，应先单独归档。

Filebeat 官方也明确提醒，`copytruncate` 可能造成日志丢失或重复：

[Elastic：Log rotation results in lost or duplicate events](https://www.elastic.co/docs/reference/beats/filebeat/file-log-rotation)

### 5.4 使用 systemd timer 每分钟轮转

service `/etc/systemd/system/fee-nginx-minute-rotate.service`：

```ini
[Unit]
Description=Rotate fee Nginx access log by minute
After=nginx.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/fee-rotate-nginx-minute-log.sh
```

timer `/etc/systemd/system/fee-nginx-minute-rotate.timer`：

```ini
[Unit]
Description=Rotate fee Nginx access log every minute

[Timer]
OnCalendar=*-*-* *:*:00
AccuracySec=1s
Persistent=true

[Install]
WantedBy=timers.target
```

### 5.5 必须处理与 Task:Manager 的时序

当前 `Task:Manager` 也在每分钟第 0 秒运行。

如果轮转任务和 `SaveLog:Nginx` 同时启动，可能出现：

- `SaveLog:Nginx` 先执行，目标分钟文件尚不存在；
- 文件刚被移动，但 Nginx 仍有少量日志通过旧文件描述符写入；
- `SaveLog:Nginx` 读取时文件还没有完全稳定。

因此采用方案二时，应把 `SaveLog:Nginx` 调度延后，例如每分钟第 10 秒：

```js
schedule.scheduleJob('10 * * * * *', function () {
  // ...
})
```

这个时序修改不是可选优化，而是方案二可靠运行的必要条件。

### 5.6 logrotate 能否完成

logrotate 支持按时间或大小轮转、压缩和清理日志；新版还支持按分钟间隔判断。但 logrotate 是否真的每分钟运行，仍取决于 cron 或 systemd timer 的调用频率。

参考：[logrotate 官方仓库](https://github.com/logrotate/logrotate)

fee-pro 需要严格的嵌套目录和上一分钟命名。相比复杂的 `dateformat`、`olddir` 和 `postrotate` 组合，一个带锁的专用脚本通常更容易校验。

### 5.7 优点

- Nginx 写固定文件，可以使用 buffered write。
- 日志写入方式符合常规 Nginx 运维习惯。
- 活动文件路径固定，便于其他采集器监控。
- 可以在轮转阶段统一做压缩、保留和权限处理。

### 5.8 缺点

- 每分钟都需要重命名并发送 `USR1`，一年会执行五十多万次。
- 轮转程序与 `Task:Manager` 必须严格错开。
- 脚本异常、机器负载或时间跳变都可能导致某一分钟文件缺失或混入相邻分钟。
- 运维复杂度高于“按天或按大小轮转”。

## 六、两种方案比较

| 比较项 | 方案一：动态路径直接写 | 方案二：固定文件外部轮转 |
| --- | --- | --- |
| 输入文件生成 | Nginx直接生成分钟文件 | 外部任务移动活动文件 |
| 是否需要USR1 | 不需要 | 每分钟需要 |
| Nginx日志缓冲 | 变量路径不能使用buffer | 固定路径可以使用buffer |
| 父目录创建 | 必须外部预创建 | 轮转脚本创建 |
| 时序竞争 | 相对较少 | 明显，需要延迟SaveLog |
| 高流量写入效率 | 相对较低 | 相对较高 |
| 运维复杂度 | 目录和权限管理 | 轮转、信号、锁和调度管理 |
| 与现有Linux解析路径匹配 | 直接匹配 | 轮转后匹配 |
| 适合场景 | 低中流量、旧式分钟批处理 | 必须固定活动文件且能严格控制调度 |

不能脱离场景简单断言某一种始终更好。

对当前 fee-pro ECS 测试环境，可以给出较明确的判断：

- 流量较低；
- 后端已经按分钟文件读取；
- 希望尽量不改 `SaveLog:Nginx`；
- 不希望引入每分钟移动和 `USR1` 的竞争。

因此，当前测试环境更适合方案一。

正式高流量环境则不建议在这两种方案中勉强选择。更常见的升级路线是：

```text
Nginx固定日志
    ↓
Filebeat / Fluent Bit / Vector / rsyslog增量采集
    ↓
Kafka或集中日志平台
    ↓
消费者按offset处理
```

## 七、通常的日志系统采用什么方案

### 7.1 常规网站和业务系统

最常见的是：

```text
应用或Nginx写固定活动文件
    ↓
按大小、小时或天轮转
    ↓
日志采集器保存读取位置并增量读取
    ↓
发送到Kafka、Elasticsearch、Loki、对象存储等
```

通常不会要求源服务器每分钟生成一个文件。

原因包括：

- 每分钟文件数量多；
- 多实例聚合困难；
- 文件完成时刻难以严格定义；
- 重启、延迟写入和时间漂移会让分钟边界复杂化；
- 增量采集器可以记录 inode、文件指纹和读取偏移量。

rsyslog 的 `imfile` 会保存读取位置，并能在运行期间跟踪日志轮转：

[rsyslog imfile 官方文档](https://docs.rsyslog.com/doc/configuration/modules/imfile.html)

Filebeat `filestream` 也会保存文件状态并从上次位置继续读取：

[Elastic filestream 官方文档](https://www.elastic.co/docs/reference/beats/filebeat/filebeat-input-filestream)

### 7.2 前端监控系统

成熟的前端监控系统通常使用：

```text
浏览器SDK
    ↓ HTTP/Beacon/Image
采集服务或边缘代理
    ↓
消息队列或流处理
    ↓
实时解析、聚合、存储
```

Nginx access log 可以作为接入层或故障兜底，但通常不会把“分钟日志文件是否生成成功”作为核心消息可靠性机制。

小型或内部监控系统为了降低部署成本，也会采用：

```text
浏览器SDK -> Nginx日志 -> 定时批处理
```

fee-pro 更接近这种较早期、轻量化的批处理设计。

### 7.3 仍然使用分钟文件的场景

分钟或小时文件仍常见于：

- 旧式离线批处理系统；
- FTP/SFTP 文件交接；
- 数据仓库分区导入；
- 上游和下游通过“文件完成”作为交接边界；
- 不具备消息队列条件的小型环境。

即使使用分钟文件，通常也会增加：

- 完成标记文件，例如 `30.log.done`；
- 临时文件写完后原子重命名；
- 重跑和幂等机制；
- 缺分片检测；
- 校验和或记录数校验。

当前 fee-pro 没有这些完整机制。

## 八、从代码能否判断原项目想采用哪种方案

### 8.1 能确定的设计意图

从代码可以确定，原项目希望采用“已完成分钟文件作为输入边界”。

证据如下。

#### 证据一：固定读取上一分钟

代码不是读取当前活动文件，也没有维护偏移量，而是使用：

```js
moment().unix() - 60
```

这表示作者希望读取上一分钟已经结束的数据。

#### 证据二：文件路径包含完整分钟

输入路径精确到：

```text
YYYY/MM/DD/HH/mm.log
```

分钟本身就是文件分区键。

#### 证据三：每次从文件开头读取

代码使用：

```js
fs.createReadStream(logAbsolutePath)
```

没有 `start` 偏移量，也没有消费游标。这说明设计前提是同一个分钟文件只应被完整读取一次。

#### 证据四：文件不存在就跳过

代码对不存在的分钟文件直接返回，没有等待、补偿或重试队列。

这说明它把上游分钟文件当成已经准备好的外部输入。

#### 证据五：下游也按分钟文件处理

Nginx 和 Kafka 两种输入最终都会写入：

```text
server/log/kafka/json/.../HH/mm.log
```

后续 `Parse:*` 再按时间范围读取这些分钟文件。这是明显的分钟批处理架构。

### 8.2 无法从核心代码确定的部分

核心代码无法证明作者原本准备通过哪一种方式生成 Nginx 分钟文件：

- 没有动态 `access_log` 的 Nginx 配置；
- 没有 Linux 分钟轮转脚本；
- 没有调用 `logrotate`；
- 没有发送 `USR1`；
- 没有创建 Nginx 日期目录。

因此，只能确定：

```text
作者希望上游提供完整分钟文件
```

不能仅凭核心代码确定：

```text
作者希望Nginx动态路径直接写
```

或者：

```text
作者希望外部工具轮转固定文件
```

这部分基础设施没有随核心代码一起提交，可能原本由部署平台或运维系统负责。

## 九、对当前 ECS 测试环境的建议

当前阶段建议采用方案一：

```text
/dig
  -> Nginx动态写入/var/log/nginx/fee-minute/YYYY/MM/DD/HH/mm.log
  -> SaveLog:Nginx读取上一分钟
  -> server/log/kafka/json
  -> Parse/Summary
```

实施时至少保证：

1. Nginx、Node.js 和系统使用一致时区。
2. 当前小时和下一小时目录提前存在。
3. Nginx worker 对目录有写权限。
4. `fee` 用户对分钟文件有读权限。
5. `testing.nginxLogFilePath` 指向 `/var/log/nginx/fee-minute/`。
6. 有独立的历史日志清理策略。
7. 手工验证上一分钟文件能被 `SaveLog:Nginx` 正确读取。

正式生产化时，建议优先评估：

```text
固定Nginx日志 + 增量采集器 + Kafka
```

或者直接改造 `SaveLog:Nginx`，为固定活动文件实现 inode、读取偏移量和轮转识别，而不是继续强化分钟文件交接。

## 十、参考资料

- [Nginx access_log 与变量日志路径](https://nginx.org/en/docs/http/ngx_http_log_module.html)
- [Nginx 日志重新打开与 USR1](https://nginx.org/en/docs/control.html#logs)
- [logrotate 官方仓库](https://github.com/logrotate/logrotate)
- [rsyslog imfile 文件读取与状态保存](https://docs.rsyslog.com/doc/configuration/modules/imfile.html)
- [Filebeat 日志轮转注意事项](https://www.elastic.co/docs/reference/beats/filebeat/file-log-rotation)
- [Filebeat filestream 输入](https://www.elastic.co/docs/reference/beats/filebeat/filebeat-input-filestream)
