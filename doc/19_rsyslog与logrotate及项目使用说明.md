# rsyslog、logrotate 及其在 fee-pro 中的实际使用情况

> 核对口径：本文以当前仓库源码、配置和可执行脚本为准；`doc/` 下的既有文档只作为线索，不把其中的部署描述直接当成已经实现或已经启用的事实。

## 一、先说结论

1. `rsyslog` 是日志采集、处理和转发服务；`logrotate` 是日志文件轮转和保留工具。二者解决的问题不同，不能互相替代。
2. 当前项目没有在 Node.js 代码中直接调用或管理 `rsyslog`。仓库只在根目录的 `KAFKA_DEMO.md` 中给出了一套可选方案：由 `rsyslog` 读取 Nginx access log，再转发到 Kafka。
3. 当前项目也没有在运行时代码中执行 `logrotate`，仓库中没有可直接部署的 `/etc/logrotate.d/*` 配置文件。相关配置只出现在部署文档中，主要用于控制 Nginx、Server 或 PM2 日志的体积和保留时间。
4. 当前默认配置的 `use.kafka` 在 development、testing、production 中均为 `false`，因此 `Task:Manager` 默认选择 `SaveLog:Nginx`，不会走 `rsyslog -> Kafka -> SaveLog:Kafka` 链路。
5. 仅根据此仓库，不能断定某台实际服务器已经安装、启用或正确配置了 `rsyslog`、`logrotate`；这需要到目标服务器检查 systemd、定时器和 `/etc` 下的配置。
6. 当前源码和既有文档存在几处关键不一致：Kafka topic 不一致、Linux 所需的分钟日志分片没有仓库内实现、`Utils:SplitLog` 没有被 `Task:Manager` 调度。部署时不能直接照搬旧文档。

## 二、rsyslog 是什么

`rsyslog` 是 Linux/Unix 上常见的日志处理守护进程。它兼容 syslog 协议，但能力不限于传统系统日志，可以从多种输入读取日志，经过过滤、格式化和路由后，再写到不同目标。

典型能力包括：

- 接收系统、应用或远程主机发送的 syslog 消息。
- 通过 `imfile` 模块持续跟踪普通文本日志文件。
- 按来源、级别、程序名或消息内容过滤日志。
- 把日志写入本地文件、转发到远程 syslog 服务，或借助插件发送到 Kafka 等系统。
- 使用队列、重试等机制提高日志转发的可靠性。

它解决的是“日志从哪里来、经过什么处理、要送到哪里去”的问题。

### 在本项目示例中的作用

根目录 [`KAFKA_DEMO.md`](../KAFKA_DEMO.md#L51) 给出的思路是：

```text
Nginx access.log
  -> rsyslog 的 imfile 模块读取文件
  -> rsyslog 的 omkafka 模块发送消息
  -> Kafka topic
  -> fee-pro 的 SaveLog:Kafka 消费
  -> server/log/kafka/raw、json、test
  -> 后续 Parse:* 和 Summary:* 命令
```

示例中：

- `module(load="imfile")` 负责跟踪 `/var/log/access.log`。
- `module(load="omkafka")` 负责向 Kafka broker 发送消息。
- `template` 定义发往 Kafka 的消息格式。
- `ruleset` 把输入日志路由到 Kafka。

需要注意，`rsyslog` 只是这个可选链路中的一种 Kafka 生产者。`SaveLog:Kafka` 只关心 Kafka 中是否存在格式正确的消息，并不要求消息一定由 `rsyslog` 产生；Logstash、Fluent Bit、Filebeat 加 Kafka 输出或自研程序也可以承担同一角色。

## 三、logrotate 是什么

`logrotate` 是 Linux 上的日志文件生命周期管理工具。它通常由 systemd timer 或 cron 周期性触发，根据配置判断日志是否需要轮转。

常见功能包括：

- 按天、按周或达到指定大小时轮转。
- 把当前日志改名为历史文件，并创建新的空日志文件。
- 压缩历史日志。
- 只保留指定数量或指定天数，删除更旧的日志。
- 在轮转后执行脚本，例如向 Nginx 发送 `USR1` 信号，让 Nginx 关闭旧文件句柄并重新打开日志文件。

它解决的是“已有日志文件如何避免无限增长、历史文件保留多久”的问题。

`logrotate` 默认不会解析业务日志内容，不会把日志发送到 Kafka，也不会把一天的日志按每条记录的时间重新归类为分钟目录。

## 四、二者的区别

| 对比项 | rsyslog | logrotate |
| --- | --- | --- |
| 核心职责 | 收集、过滤、格式化、路由、转发日志 | 轮转、压缩、保留和删除日志文件 |
| 常见运行方式 | 常驻守护进程，持续处理新日志 | 由 systemd timer 或 cron 定期运行 |
| 主要处理对象 | 一条条日志消息或持续增长的文件输入 | 整个日志文件 |
| 常见输出 | 本地文件、远程 syslog、Kafka 等 | 改名后的历史文件、压缩包、新日志文件 |
| 是否负责 Kafka 转发 | 可以，需使用 `omkafka` 等模块 | 不负责 |
| 是否控制磁盘占用 | 可通过队列等间接影响，但不是主要职责 | 是其主要职责之一 |
| 是否能替代对方 | 不能 | 不能 |

二者可以同时使用。例如，`rsyslog` 持续跟踪 Nginx 日志并发送到 Kafka，`logrotate` 定期轮转这个 Nginx 日志文件。此时需要保证轮转方式、文件权限、Nginx 重新打开文件以及 `rsyslog imfile` 的跟踪状态互相兼容，避免漏读或重复读取。

## 五、项目中是否使用了 rsyslog

### 5.1 准确判断

结论是：**仓库提供了基于 rsyslog 的可选 Kafka 接入示例，但当前项目代码没有直接集成 rsyslog，默认配置也没有启用这条链路。**

证据如下：

1. [`KAFKA_DEMO.md`](../KAFKA_DEMO.md#L51) 说明了安装 `rsyslog`、`rsyslog-kafka`，并通过 `imfile + omkafka` 把 Nginx 日志送入 Kafka。这是外部系统配置示例，不是项目运行时代码。
2. [`server/src/configs/common.js`](../server/src/configs/common.js#L4) 中三个环境的 `use.kafka` 当前均为 `false`。
3. [`server/src/commands/task/manage.js`](../server/src/commands/task/manage.js#L119) 每分钟检查 `use.kafka`：为 `true` 时执行 `SaveLog:Kafka`，否则执行 `SaveLog:Nginx`。
4. [`server/src/commands/save_log/parseKafkaLog.js`](../server/src/commands/save_log/parseKafkaLog.js#L115) 使用 `node-rdkafka` 创建 Kafka consumer；它没有调用 rsyslog，也不负责从 Nginx 文件向 Kafka 生产消息。
5. [`server/src/configs/kafka.js`](../server/src/configs/kafka.js#L3) 当前三个环境最终拿到的 Kafka 客户端配置都是空对象。即使把 `use.kafka` 改成 `true`，也仍需补齐 Kafka consumer 配置。

### 5.2 当前示例不能直接照搬

当前代码和 `KAFKA_DEMO.md` 的 topic 不一致：

- `KAFKA_DEMO.md` 中 `rsyslog` 示例发送到 `fee-test`。
- [`parseKafkaLog.js`](../server/src/commands/save_log/parseKafkaLog.js#L57) 硬编码订阅 `fee-dig-www-log`。

如果按示例原样配置，生产者和消费者不会落在同一个 topic，`SaveLog:Kafka` 收不到示例产生的消息。实际部署必须把二者统一；同时还要配置 broker、consumer group 等 Kafka 参数，并确认 rsyslog 输出的消息格式符合 `SaveLogBase` 的解析要求。

因此，关于“项目有没有用 rsyslog”可以分成三层回答：

| 层面 | 判断 |
| --- | --- |
| 架构设计 | 支持把 rsyslog 作为 Nginx 日志到 Kafka 的转发器 |
| 仓库实现 | 只有配置示例，Node.js 代码不依赖、不启动也不管理 rsyslog |
| 当前默认配置 | 未启用 Kafka，因此默认不会经过 rsyslog |

## 六、项目中是否使用了 logrotate

### 6.1 准确判断

结论是：**仓库把 logrotate 当作 Linux 部署时的运维建议，但当前运行时代码没有调用它，也没有证据表明某台服务器已经实际启用。**

仓库中的相关位置主要有：

1. [`server/src/commands/utils/split_log.js`](../server/src/commands/utils/split_log.js#L8) 的注释和非 Windows 分支写着“Linux 使用 logrotate”。这只是一段说明，函数在 Linux 上会直接跳过，并不会执行 `logrotate`。
2. [`doc/07_开发环境配置与运行指南.md`](./07_开发环境配置与运行指南.md#L606) 和 [`doc/08_测试环境部署与运行指南.md`](./08_测试环境部署与运行指南.md#L414) 给出了 Nginx 日志的日轮转示例。
3. [`doc/08_测试环境部署与运行指南.md`](./08_测试环境部署与运行指南.md#L1015) 还给出了 Server 日志轮转示例。
4. [`doc/15_阿里云ECS从零部署fee-pro测试环境指南.md`](./15_阿里云ECS从零部署fee-pro测试环境指南.md#L1685) 建议对 Nginx 日志按天轮转、压缩并保留 14 份，同时在 `postrotate` 中通知 Nginx 重新打开日志。

这些内容的预期作用是防止以下文件无限增长：

- Nginx 打点访问日志，如 `/var/log/nginx/fee-access.log`。
- Nginx 普通访问日志和错误日志。
- Server 或 PM2 自身的运行日志。

但是这些配置都写在 Markdown 代码块中，仓库没有独立的 `logrotate` 配置文件，也没有安装或启用它的自动化脚本。因此它们是“部署参考”，不是“拉取代码后自动生效的项目功能”。

### 6.2 logrotate 不能直接满足当前 Linux 读取路径

[`SaveLog:Nginx`](../server/src/commands/save_log/parseNginxLog.js#L53) 在 Linux 上只读取上一分钟对应的文件：

```text
nginxLogFilePath/YYYY/MM/DD/HH/mm.log
```

例如：

```text
/var/log/nginx/2026/07/23/14/30.log
```

但现有部署文档中的 `logrotate` 示例是 `daily` 轮转 `fee-access.log`，通常得到类似 `fee-access.log.1`、`fee-access.log.2.gz` 的历史文件。它不会生成上述 `YYYY/MM/DD/HH/mm.log` 分钟目录。

所以，从当前仓库能得出的结论是：

- `logrotate` 示例可以解决日志文件增长和历史保留问题。
- 它不是当前 Linux `SaveLog:Nginx` 所需“分钟分片文件”的生成实现。
- 若实际 Linux 环境可以正常运行非 Kafka 链路，那么服务器上还必须存在仓库之外的日志分片机制或定制配置；否则 `SaveLog:Nginx` 会因为上一分钟的分片文件不存在而直接跳过。

### 6.3 项目自己的日志清理命令不是 logrotate

[`Utils:CleanOldLog`](../server/src/commands/utils/clean_old_log.js#L11) 会清理 `server/log/kafka` 下的 raw、json、test 数据以及命令日志，`Task:Manager` 每六小时分发一次该命令。

这是 Node.js 项目自己的清理逻辑，与系统的 `logrotate` 是两套独立机制：

- `Utils:CleanOldLog` 管理项目内部按目录保存的数据文件。
- `logrotate` 示例管理 Nginx、Server 或 PM2 的连续日志文件。

## 七、源码与既有文档中需要特别警惕的不一致

### 7.1 `Utils:SplitLog` 并未被定时调度

`doc/07_开发环境配置与运行指南.md` 声称 `Utils:SplitLog` 已在 `Task:Manager` 中自动注册、每分钟执行一次，但当前 [`Task:Manager`](../server/src/commands/task/manage.js#L119) 的每分钟任务没有调用它。

`server/src/fee.js` 只是把该命令注册为可手工执行的 CLI 命令，不代表调度器会自动运行它。

### 7.2 `Utils:SplitLog` 没有清空源日志

旧文档还声称分片完成后会清空 `fee-access.log`。但当前 [`split_log.js`](../server/src/commands/utils/split_log.js#L44) 只读取源文件，并使用 `appendFile` 写入分钟分片，没有截断、重命名或删除源文件。

如果反复手工执行，它可能把相同源日志重复追加到分片中。它也不能视为 `logrotate` 的等价替代品。

### 7.3 Linux 分片路径缺少仓库内生产者

Linux `SaveLog:Nginx` 读取 `YYYY/MM/DD/HH/mm.log`，但：

- `Utils:SplitLog` 仅允许在 Windows 执行。
- `Task:Manager` 没有调度 `Utils:SplitLog`。
- 文档中的标准 `logrotate daily` 配置不会生成分钟目录。

因此当前仓库内的 Linux 非 Kafka 日志接入链路并不闭环。

### 7.4 Kafka 示例 topic 与代码不一致

`rsyslog` 示例发送到 `fee-test`，代码订阅 `fee-dig-www-log`。部署前必须统一，不能仅凭 `KAFKA_DEMO.md` 判断链路已经可用。

### 7.5 production 的 Nginx 路径仍是 Windows 路径

[`server/src/configs/common.js`](../server/src/configs/common.js#L21) 的 production `nginxLogFilePath` 当前仍为：

```text
D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/
```

如果 production 实际部署在 Linux，还必须修改该配置。仓库中的 testing 路径虽然是 `/var/log/nginx/`，但不能据此推断 production 已正确配置。

## 八、最终回答

### rsyslog

- **是什么：** 持续采集、处理和转发日志的服务。
- **项目里在哪里出现：** 根目录 `KAFKA_DEMO.md` 的可选 Kafka 接入示例。
- **在项目方案中的作用：** 跟踪 Nginx access log，把每条日志发送到 Kafka，供 `SaveLog:Kafka` 消费。
- **当前是否实际启用：** 仓库默认未启用；代码也不直接管理 rsyslog。实际服务器状态需另行检查。

### logrotate

- **是什么：** 定期轮转、压缩、保留和删除日志文件的系统工具。
- **项目里在哪里出现：** 多份部署文档中的 Nginx/Server 日志轮转示例，以及 `Utils:SplitLog` 的一处说明性注释。
- **在项目方案中的作用：** 控制 Nginx、Server 或 PM2 日志体积，并在 Nginx 日志轮转后通知 Nginx 重新打开文件。
- **当前是否实际启用：** 仓库中没有自动启用它的代码或可部署配置文件，不能仅凭仓库确认服务器已使用。
- **重要限制：** 文档中的日轮转配置不能生成 Linux `SaveLog:Nginx` 当前要求的分钟分片。

简化理解：

```text
rsyslog：负责“把日志送过去”
logrotate：负责“别让日志文件无限长大”
```
