# Kafka 技术详解与项目应用指南

## 一、Kafka 技术概述

### 1.1 Kafka 的定义

**Apache Kafka** 是一个分布式流处理平台，最初由 LinkedIn 开发，后来成为 Apache 顶级项目。它可以理解为：

- **消息队列系统**：允许生产者和消费者之间进行异步通信
- **流处理平台**：可以实时处理和分析数据流
- **分布式提交日志**：提供持久化、高吞吐量的数据存储

**通俗理解**：
想象一个快递分拣中心：
- **生产者（Producer）**：相当于寄件人，把包裹（消息）送到分拣中心
- **Kafka 集群**：相当于分拣中心，有无数个传送带（Topic），每个传送带有多个格子（Partition）
- **消费者（Consumer）**：相当于收件人，从传送带上取走包裹

### 1.2 Kafka 核心架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Kafka 架构                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐             │
│  │Producer 1│      │Producer 2│      │Producer 3│             │
│  └────┬─────┘      └────┬─────┘      └────┬─────┘             │
│       │                 │                 │                     │
│       └─────────────────┼─────────────────┘                     │
│                         │                                       │
│                    ┌────▼────┐                                  │
│                    │ Topic   │                                  │
│                    │(主题)   │                                  │
│                    └────┬────┘                                  │
│                         │                                       │
│              ┌──────────┼──────────┐                           │
│              │          │          │                            │
│         ┌────▼───┐ ┌────▼───┐ ┌───▼────┐                      │
│         │Partition│ │Partition│ │Partition│                     │
│         │   0    │ │   1    │ │   2    │                      │
│         └────┬───┘ └────┬───┘ └───┬────┘                      │
│              │          │          │                            │
│              └──────────┼──────────┘                           │
│                         │                                       │
│              ┌──────────┼──────────┐                           │
│              │          │          │                            │
│         ┌────▼───┐ ┌────▼───┐ ┌───▼────┐                      │
│         │Consumer│ │Consumer│ │Consumer│                      │
│         │  1     │ │  2     │ │  3     │                      │
│         └────────┘ └────────┘ └────────┘                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 核心概念

| 概念 | 说明 | 类比 |
|------|------|------|
| **Broker** | Kafka 服务器节点 | 快递分拣中心的一个仓库 |
| **Topic** | 消息分类的主题 | 传送带，按包裹类型分类 |
| **Partition** | Topic 的物理分区 | 传送带上的多个格子 |
| **Producer** | 消息生产者 | 寄件人 |
| **Consumer** | 消息消费者 | 收件人 |
| **Consumer Group** | 消费者组 | 同一公司的多个收件部门 |
| **Offset** | 消息在 Partition 中的位置 | 包裹在传送带上的编号 |

### 1.3 Kafka 工作原理

#### 消息生产流程

```
1. Producer 发送消息到指定 Topic
   ↓
2. Kafka 根据 Partition 策略选择目标分区
   ↓
3. 消息追加写入 Partition 末尾（顺序写磁盘）
   ↓
4. 消息持久化到磁盘，并同步到副本
   ↓
5. 返回成功响应给 Producer
```

#### 消息消费流程

```
1. Consumer 订阅 Topic
   ↓
2. Kafka 分配 Partition 给 Consumer
   ↓
3. Consumer 按 Offset 顺序读取消息
   ↓
4. 处理完成后提交 Offset
   ↓
5. 继续读取下一条消息
```

### 1.4 Kafka 主要特性

| 特性 | 说明 | 优势 |
|------|------|------|
| **高吞吐量** | 单机每秒可处理百万级消息 | 适合大数据场景 |
| **低延迟** | 消息传递延迟可低至毫秒级 | 实时性要求高的场景 |
| **可扩展性** | 支持水平扩展，增加 Broker 即可提升性能 | 应对业务增长 |
| **持久化** | 消息持久化到磁盘，支持多副本 | 数据不丢失 |
| **容错性** | 自动故障转移，副本机制保证高可用 | 系统稳定性强 |
| **回溯消费** | 可以按 Offset 重新消费历史消息 | 数据重处理能力强 |

### 1.5 Kafka 技术优势

#### 与传统消息队列对比

| 对比项 | Kafka | RabbitMQ | ActiveMQ |
|--------|-------|----------|----------|
| **吞吐量** | 百万级/秒 | 万级/秒 | 万级/秒 |
| **延迟** | 毫秒级 | 微秒级 | 毫秒级 |
| **消息回溯** | 支持 | 不支持 | 不支持 |
| **分布式** | 原生支持 | 需要配置 | 需要配置 |
| **适用场景** | 大数据、日志收集 | 业务消息 | 企业应用 |

#### 核心优势总结

1. **高吞吐低延迟**：通过顺序写磁盘、零拷贝等技术实现
2. **水平扩展**：通过增加 Broker 节点线性提升性能
3. **消息持久化**：消息写入磁盘，支持多副本备份
4. **消费者回溯**：可以重新消费历史消息，支持数据重处理
5. **生态丰富**：与 Spark、Flink、Hadoop 等大数据组件无缝集成

### 1.6 Kafka 典型应用场景

#### 1. 日志收集系统

```
┌─────────────┐     ┌─────────┐     ┌──────────────┐
│  应用服务器  │────▶│  Kafka  │────▶│  日志分析系统 │
│  (Producer) │     │ (Topic) │     │  (Consumer)  │
└─────────────┘     └─────────┘     └──────────────┘
```

**场景说明**：
- 多个应用服务器产生大量日志
- 通过 Kafka 集中收集
- 下游系统（如 ELK、Spark）进行分析和存储

#### 2. 消息系统

```
┌──────────┐     ┌─────────┐     ┌──────────┐
│ 订单服务  │────▶│  Kafka  │────▶│ 库存服务  │
│          │     │         │     │          │
└──────────┘     └─────────┘     └──────────┘
                       │
                       ▼
                 ┌──────────┐
                 │ 支付服务  │
                 └──────────┘
```

**场景说明**：
- 订单创建后发送消息到 Kafka
- 多个下游服务（库存、支付、物流）订阅消息
- 实现服务解耦和异步处理

#### 3. 流处理

```
┌──────────┐     ┌─────────┐     ┌──────────┐     ┌──────────┐
│ 数据源    │────▶│  Kafka  │────▶│  Flink   │────▶│  结果存储 │
│          │     │         │     │  处理    │     │          │
└──────────┘     └─────────┘     └──────────┘     └──────────┘
```

**场景说明**：
- 实时数据流（如用户行为、传感器数据）
- 通过 Kafka 收集
- Flink/Spark Streaming 进行实时处理
- 结果写入数据库或缓存

#### 4. 事件溯源

```
┌──────────┐     ┌─────────┐     ┌──────────┐
│ 用户操作  │────▶│  Kafka  │────▶│  事件回放 │
│          │     │ (事件流) │     │  审计日志 │
└──────────┘     └─────────┘     └──────────┘
```

**场景说明**：
- 记录所有状态变更事件
- 支持事件回放和审计
- 可以重建任意时间点的状态

---

## 二、项目中 Kafka 的应用情况

### 2.1 项目是否使用了 Kafka

**明确回答：是的，Fee 项目支持 Kafka，但 Kafka 是可选组件。**

项目提供了两种日志收集模式：

| 模式 | 配置项 | 说明 | 适用场景 |
|------|--------|------|----------|
| **Kafka 模式** | `use.kafka = true` | 从 Kafka 消费日志 | 高并发、分布式部署 |
| **Nginx 模式** | `use.kafka = false` | 直接读取 Nginx 日志文件 | 低并发、单机部署 |

**配置文件位置**：`server/src/configs/common.js`

```javascript
const development = {
  loginType: 'normal',
  use: {
    kafka: false,  // ← 是否使用 Kafka，默认关闭
    alarm: false
  },
  nginxLogFilePath: 'D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/'
}
```

### 2.2 Kafka 在项目中的具体功能

#### 核心功能：前端日志收集与传输

```
┌─────────────────────────────────────────────────────────────────┐
│                    Fee 项目数据流转流程                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐                                                   │
│  │  前端 SDK │  ← 用户行为、错误信息、性能数据                   │
│  └────┬─────┘                                                   │
│       │                                                         │
│       ▼                                                         │
│  ┌──────────┐                                                   │
│  │  Nginx   │  ← 记录访问日志（fee-access.log）                 │
│  └────┬─────┘                                                   │
│       │                                                         │
│       ├──────────────────────┬──────────────────┐               │
│       │                      │                  │               │
│       ▼                      ▼                  ▼               │
│  ┌──────────┐         ┌──────────┐       ┌──────────┐          │
│  │  Kafka   │         │  Nginx   │       │  直接    │          │
│  │ (可选)   │         │  日志文件 │       │  读取    │          │
│  └────┬─────┘         └────┬─────┘       └────┬─────┘          │
│       │                    │                  │                 │
│       └────────────────────┼──────────────────┘                 │
│                            │                                    │
│                            ▼                                    │
│                   ┌────────────────┐                            │
│                   │  SaveLog 命令   │                            │
│                   │  (日志落盘)     │                            │
│                   └────────┬───────┘                            │
│                            │                                    │
│                            ▼                                    │
│                   ┌────────────────┐                            │
│                   │  Parse 命令     │                            │
│                   │  (数据解析)     │                            │
│                   └────────┬───────┘                            │
│                            │                                    │
│                            ▼                                    │
│                   ┌────────────────┐                            │
│                   │  MySQL 数据库   │                            │
│                   │  (数据存储)     │                            │
│                   └────────────────┘                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 业务价值

1. **解耦日志收集与处理**：前端 SDK 产生的日志先写入 Kafka，后端服务按需消费
2. **削峰填谷**：高峰期日志先缓存在 Kafka，避免直接压垮数据库
3. **支持重处理**：可以回溯消费历史日志，重新解析和处理
4. **分布式扩展**：多个 Consumer 实例可以并行消费，提升处理能力

### 2.3 使用 Kafka 的具体模块与代码路径

#### 模块 1：Kafka 工具库

**文件路径**：`server/src/library/kafka/index.js`

**功能说明**：
- 封装 Kafka 客户端（node-rdkafka）
- 提供日志文件路径生成工具函数
- 定义日志类型常量（RAW、JSON、TEST）

**核心代码**：

```javascript
import Kafka from 'node-rdkafka'

// 日志类型定义
const LOG_TYPE_RAW = 'raw'      // 原始日志
const LOG_TYPE_JSON = 'json'    // JSON 格式日志
const LOG_TYPE_TEST = 'test'    // 测试日志

// 生成日志文件路径
function getAbsoluteLogUriByType(logAt, logType = LOG_TYPE_RAW) {
  let startAtMoment = moment.unix(logAt)
  let basePath = getAbsoluteBasePathByType(logType)
  let fileName = `./${monthDirName}/day_${startAtMoment.format(DDFormat)}/${startAtMoment.format(HHFormat)}/${startAtMoment.format(mmFormat)}.log`
  return path.resolve(basePath, fileName)
}

export default {
  Kafka,
  getAbsoluteLogUriByType,
  LOG_TYPE_RAW,
  LOG_TYPE_JSON,
  LOG_TYPE_TEST
}
```

#### 模块 2：Kafka 日志消费命令

**文件路径**：`server/src/commands/save_log/parseKafkaLog.js`

**功能说明**：
- 从 Kafka Topic 消费前端日志
- 解析日志内容，提取关键字段
- 将原始日志和 JSON 日志分别写入本地文件
- 支持抽样率控制

**核心流程**：

```javascript
class Save2Log extends SaveLogBase {
  static get signature() {
    return `SaveLog:Kafka`
  }

  async execute(args, options) {
    // 1. 获取项目列表（用于抽样率判断）
    let projectMap = await this.getProjectMap()

    // 2. 创建 Kafka 消费者客户端
    let client = this.getClient()

    // 3. 订阅 Topic 并开始消费
    client.on('ready', () => {
      client.subscribe(['fee-dig-www-log'])  // ← 订阅的 Topic 名称
      client.consume()
    })

    // 4. 处理每条消息
    client.on('data', async (data) => {
      let content = data.value.toString()

      // 4.1 解析日志时间
      let logCreateAt = this.parseLogCreateAt(content)

      // 4.2 判断是否为测试日志
      if (this.isTestLog(content)) {
        this.getWriteStreamClientByType(logCreateAt, LKafka.LOG_TYPE_TEST).write(content)
        return
      }

      // 4.3 解析日志内容
      let parseResult = await this.parseLog(content, projectMap)

      // 4.4 根据抽样率过滤
      let projectRate = _.get(projectMap, [projectName, 'rate'], 100)
      if (checkFlag > projectRate) {
        return  // 未命中抽样，跳过
      }

      // 4.5 写入原始日志文件
      this.getWriteStreamClientByType(logCreateAt, LKafka.LOG_TYPE_RAW).write(content)

      // 4.6 写入 JSON 日志文件
      this.getWriteStreamClientByType(logCreateAt, LKafka.LOG_TYPE_JSON).write(JSON.stringify(parseResult))
    })

    // 5. 29 秒后自动断开连接（避免长时间占用）
    setTimeout(() => {
      client.disconnect()
    }, 29 * 1000)
  }

  getClient() {
    let kafka = LKafka.Kafka
    let client = new kafka.KafkaConsumer(BaseClientConfig, {})
    return client.connect()
  }
}
```

#### 模块 3：Nginx 日志读取命令（替代方案）

**文件路径**：`server/src/commands/save_log/parseNginxLog.js`

**功能说明**：
- 当 `use.kafka = false` 时使用
- 直接读取 Nginx 日志文件
- 功能与 Kafka 模式类似，但不经过 Kafka

**核心差异**：

```javascript
class NginxParseLog extends SaveLogBase {
  static get signature() {
    return `SaveLog:Nginx`
  }

  async execute(args, options) {
    // 1. 智能检测日志文件路径（兼容多种格式）
    let logAbsolutePath = null

    // 模式 1: Windows 按分钟分割
    const windowsSplitLogDir = path.join(nginxLogFilePath, 'fee-access')
    // ...

    // 模式 2: fee-access.log（Windows 单文件）
    const feeAccessLogFile = path.join(nginxLogFilePath, 'fee-access.log')
    // ...

    // 模式 3: access.log（标准 Nginx）
    const standardAccessLogFile = path.join(nginxLogFilePath, 'access.log')
    // ...

    // 模式 4: Linux 按分钟分割
    const linuxStyleLogFile = `${nginxLogFilePath}${formatStr}.log`
    // ...

    // 2. 逐行读取并处理（与 Kafka 模式逻辑相同）
    readLine(fs.createReadStream(logAbsolutePath)).go(
      onDataIn,
      async () => {
        await this.autoCloseOldStream(true)
      }
    )
  }
}
```

#### 模块 4：日志处理基类

**文件路径**：`server/src/commands/save_log/base.js`

**功能说明**：
- 提供日志解析的通用逻辑
- 管理文件写入流池
- 实现抽样率控制
- 处理 IP 地理位置解析

**核心方法**：

```javascript
class SaveLogBase extends Base {
  /**
   * 解析日志创建时间
   */
  parseLogCreateAt(data) {
    const info = data.split('\t')
    let logAtMoment = moment(info[0], moment.ISO_8601)
    return logAtMoment.unix()
  }

  /**
   * 解析日志内容
   */
  async parseLog(data, projectMap) {
    const info = data.split('\t')
    let url = _.get(info, [15], '')

    // 从 URL 参数中提取打点数据
    const urlQS = queryString.parseUrl(url)
    let record = _.get(urlQS, ['query', 'd'], '[]')
    record = JSON.parse(record)

    // 校验项目 ID
    if (_.has(projectMap, [record.common.pid]) === false) {
      return null
    }

    // 解析 User-Agent
    record.ua = parser(decodeURIComponent(info[17]))

    // 解析 IP 地理位置
    record.ip = info[3] || info[4]
    const location = await Util.ip2Locate(record.ip)
    record.country = location.country
    record.province = location.province
    record.city = location.city

    return record
  }

  /**
   * 获取文件写入流
   */
  getWriteStreamClientByType(nowAt, logType = LKafka.LOG_TYPE_RAW) {
    let nowAtLogUri = LKafka.getAbsoluteLogUriByType(nowAt, logType)
    // ... 创建或复用写入流
  }
}
```

#### 模块 5：任务调度

**文件路径**：`server/src/commands/task/manage.js`

**功能说明**：
- 根据配置选择 Kafka 模式或 Nginx 模式
- 每分钟调度一次日志收集任务

**核心代码**：

```javascript
async registerTaskRepeatPer1Minute() {
  schedule.scheduleJob('0 */1 * * * *', function () {
    // 根据配置选择日志收集方式
    if (isUsingKafka) {
      that.execCommand('SaveLog:Kafka', [])
    } else {
      that.execCommand('SaveLog:Nginx', [])
    }

    // 其他定时任务...
    that.dispatchParseCommand('Parse:Monitor', twoMinuteAgoByMinute, nowByMinute)
    that.dispatchParseCommand('Summary:Error', twoMinuteAgoByMinute, DATE_FORMAT.UNIT.MINUTE)
  })
}
```

### 2.4 Kafka 在数据流转中的角色

#### 完整数据流转链路

```
阶段 1: 前端数据采集
┌─────────────────────────────────────────────────────────────┐
│  1. 用户访问页面                                             │
│  2. SDK 捕获错误、性能数据、用户行为                         │
│  3. SDK 发送请求到 Nginx（/log.gif?d=...）                   │
│  4. Nginx 记录访问日志                                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
阶段 2: 日志收集（两种模式）
┌─────────────────────────────────────────────────────────────┐
│  模式 A: Kafka 模式                                         │
│  ├─ Logstash/Flume 读取 Nginx 日志                          │
│  ├─ 写入 Kafka Topic: fee-dig-www-log                       │
│  └─ SaveLog:Kafka 命令消费消息                              │
│                                                             │
│  模式 B: Nginx 模式                                         │
│  └─ SaveLog:Nginx 命令直接读取 Nginx 日志文件               │
└─────────────────────────────────────────────────────────────┘
                          ↓
阶段 3: 日志落盘
┌─────────────────────────────────────────────────────────────┐
│  1. 解析日志时间                                             │
│  2. 判断是否为测试日志                                       │
│  3. 解析日志内容（提取 PID、UA、IP 等）                      │
│  4. 根据抽样率过滤                                           │
│  5. 写入三类文件：                                           │
│     ├─ RAW:  server/log/kafka/raw/YYYY/MM/DD/HH/mm.log     │
│     ├─ JSON: server/log/kafka/json/YYYY/MM/DD/HH/mm.log    │
│     └─ TEST: server/log/kafka/test/YYYY/MM/DD/HH/mm.log    │
└─────────────────────────────────────────────────────────────┘
                          ↓
阶段 4: 数据解析入库
┌─────────────────────────────────────────────────────────────┐
│  1. Parse:Monitor 命令读取 JSON 日志                         │
│  2. 解析错误信息、性能指标                                   │
│  3. 写入 MySQL 数据库                                        │
│     ├─ t_o_monitor_{project_id}_{YYYYMM}                   │
│     └─ t_o_performance_{project_id}_{YYYYMM}               │
└─────────────────────────────────────────────────────────────┘
                          ↓
阶段 5: 数据汇总
┌─────────────────────────────────────────────────────────────┐
│  1. Summary:Error 命令按分钟/小时/天汇总                     │
│  2. 写入汇总表                                               │
│     └─ t_r_error_summary_{project_id}_{YYYYMM}             │
└─────────────────────────────────────────────────────────────┘
```

#### Kafka 的具体作用

| 作用 | 说明 | 优势 |
|------|------|------|
| **缓冲层** | 前端日志先写入 Kafka，后端按需消费 | 避免高峰期压垮数据库 |
| **解耦** | 日志收集与日志处理分离 | 各自独立扩展和维护 |
| **重处理** | 可以回溯消费历史消息 | 支持数据修复和重新分析 |
| **多消费者** | 多个服务可以订阅同一 Topic | 支持并行处理和不同用途 |

---

## 三、环境配置与开发指南

### 3.1 本地开发环境配置 Kafka

#### 3.1.1 是否需要配置 Kafka

**答案：不是必须的！**

项目默认使用 **Nginx 模式**（`use.kafka = false`），适合本地开发和单机部署。只有在以下情况下才需要配置 Kafka：

- 需要模拟生产环境的高并发场景
- 需要测试 Kafka 相关功能
- 计划在生产环境使用 Kafka

#### 3.1.2 使用 Nginx 模式（推荐，无需 Kafka）

**步骤 1：确认配置**

编辑 `server/src/configs/common.js`：

```javascript
const development = {
  loginType: 'normal',
  use: {
    kafka: false,  // ← 设为 false，不使用 Kafka
    alarm: false
  },
  nginxLogFilePath: 'D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/'  // ← 修改为你的 Nginx 日志路径
}
```

**步骤 2：确保 Nginx 正在运行**

```powershell
# 检查 Nginx 是否运行
Get-Process nginx -ErrorAction SilentlyContinue

# 如果没有运行，启动 Nginx
cd D:\nginx
.\nginx.exe
```

**步骤 3：启动项目**

```powershell
# 启动 Server
cd d:\mywork\demo\fee-pro\server
npm run dev

# 启动 Task:Manager
npm run fee_test Task:Manager
```

**验证**：

查看日志输出，应该看到：

```
[兼容模式] 检测到 fee-access.log，使用 Windows 单文件模式
任务执行完毕，共处理 X 条日志，其中合法数据 Y 条
```

#### 3.1.3 使用 Kafka 模式（可选）

如果你确实需要使用 Kafka，按以下步骤配置：

**步骤 1：安装 Kafka**

**方法 A：使用 Docker（推荐）**

```powershell
# 启动 Zookeeper
docker run -d --name zookeeper -p 2181:2181 wurstmeister/zookeeper

# 启动 Kafka
docker run -d --name kafka -p 9092:9092 \
  -e KAFKA_BROKER_ID=0 \
  -e KAFKA_ZOOKEEPER_CONNECT=host.docker.internal:2181 \
  -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://host.docker.internal:9092 \
  -e KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:9092 \
  wurstmeister/kafka
```

**方法 B：本地安装**

1. 下载 Kafka：https://kafka.apache.org/downloads
2. 解压到 `D:\kafka`
3. 启动 Zookeeper：

```powershell
cd D:\kafka
.\bin\windows\zookeeper-server-start.bat .\config\zookeeper.properties
```

4. 启动 Kafka（新窗口）：

```powershell
cd D:\kafka
.\bin\windows\kafka-server-start.bat .\config\server.properties
```

**步骤 2：创建 Topic**

```powershell
# 使用 Docker
docker exec -it kafka kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic fee-dig-www-log \
  --partitions 3 \
  --replication-factor 1

# 或使用本地 Kafka
D:\kafka\bin\windows\kafka-topics.bat --create \
  --bootstrap-server localhost:9092 \
  --topic fee-dig-www-log \
  --partitions 3 \
  --replication-factor 1
```

**步骤 3：配置项目**

编辑 `server/src/configs/common.js`：

```javascript
const development = {
  loginType: 'normal',
  use: {
    kafka: true,  // ← 设为 true，启用 Kafka
    alarm: false
  },
  nginxLogFilePath: 'D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/'
}
```

编辑 `server/src/configs/kafka.js`：

```javascript
const development = {
  'metadata.broker.list': 'localhost:9092',  // ← Kafka Broker 地址
  'group.id': 'fee-consumer-group',           // ← 消费者组 ID
  'socket.keepalive.enable': true,
  'enable.auto.commit': false
}
```

**步骤 4：安装 node-rdkafka**

```powershell
cd d:\mywork\demo\fee-pro\server

# 安装依赖（需要 C++ 编译环境）
npm install node-rdkafka
```

**注意**：`node-rdkafka` 需要编译，可能会遇到问题。详见"常见问题排查"章节。

**步骤 5：配置 Logstash 或 Flume（可选）**

如果你需要自动将 Nginx 日志写入 Kafka，需要配置 Logstash 或 Flume。

**Logstash 配置示例**（`logstash.conf`）：

```ruby
input {
  file {
    path => "D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/fee-access.log"
    start_position => "end"
  }
}

output {
  kafka {
    bootstrap_servers => "localhost:9092"
    topic_id => "fee-dig-www-log"
  }
}
```

启动 Logstash：

```powershell
logstash -f logstash.conf
```

**步骤 6：启动项目**

```powershell
# 启动 Server
cd d:\mywork\demo\fee-pro\server
npm run dev

# 启动 Task:Manager
npm run fee_test Task:Manager
```

**验证**：

查看日志输出，应该看到：

```
client 获取成功
kafka 链接成功, 开始录入数据
收到数据, 当前共记录 X/Y 条数据
```

### 3.2 正式生产环境部署 Kafka

#### 3.2.1 生产环境 Kafka 部署架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    生产环境 Kafka 部署架构                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                               │
│  │  Nginx 集群   │  ← 多台 Nginx 服务器                         │
│  │  (日志收集)   │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                               │
│  │  Logstash    │  ← 日志收集代理                               │
│  │  (每台 Nginx │                                               │
│  │   服务器)    │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────┐          │
│  │              Kafka 集群                          │          │
│  │  ┌────────┐  ┌────────┐  ┌────────┐             │          │
│  │  │Broker 1│  │Broker 2│  │Broker 3│             │          │
│  │  └────────┘  └────────┘  └────────┘             │          │
│  │       ↕           ↕           ↕                  │          │
│  │  ┌────────────────────────────────────────┐     │          │
│  │  │         Zookeeper 集群                 │     │          │
│  │  │  (3 或 5 个节点，保证奇数)             │     │          │
│  │  └────────────────────────────────────────┘     │          │
│  └──────────────────────────────────────────────────┘          │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────┐          │
│  │          Fee Server 集群                         │          │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐       │          │
│  │  │Consumer 1│  │Consumer 2│  │Consumer 3│       │          │
│  │  └──────────┘  └──────────┘  └──────────┘       │          │
│  └──────────────────────────────────────────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.2.2 Kafka 集群部署步骤

**步骤 1：部署 Zookeeper 集群**

在 3 台服务器上部署 Zookeeper：

```bash
# 服务器 1、2、3
cd /opt
wget https://downloads.apache.org/zookeeper/zookeeper-3.8.1/apache-zookeeper-3.8.1-bin.tar.gz
tar -xzf apache-zookeeper-3.8.1-bin.tar.gz
mv apache-zookeeper-3.8.1 zookeeper

# 创建配置
cd zookeeper/conf
cp zoo_sample.cfg zoo.cfg

# 编辑 zoo.cfg
vim zoo.cfg
```

修改配置：

```ini
tickTime=2000
initLimit=10
syncLimit=5
dataDir=/data/zookeeper
clientPort=2181

# 集群配置
server.1=zookeeper1:2888:3888
server.2=zookeeper2:2888:3888
server.3=zookeeper3:2888:3888
```

创建 myid 文件：

```bash
# 服务器 1
echo "1" > /data/zookeeper/myid

# 服务器 2
echo "2" > /data/zookeeper/myid

# 服务器 3
echo "3" > /data/zookeeper/myid
```

启动 Zookeeper：

```bash
cd /opt/zookeeper
bin/zkServer.sh start
```

**步骤 2：部署 Kafka 集群**

在 3 台服务器上部署 Kafka：

```bash
cd /opt
wget https://downloads.apache.org/kafka/3.5.0/kafka_2.13-3.5.0.tgz
tar -xzf kafka_2.13-3.5.0.tgz
mv kafka_2.13-3.5.0 kafka

# 编辑配置
cd kafka/config
vim server.properties
```

修改配置：

```properties
# 每台服务器不同的配置
broker.id=0  # 服务器 1 设为 0，服务器 2 设为 1，服务器 3 设为 2
listeners=PLAINTEXT://192.168.1.101:9092  # 修改为当前服务器 IP
advertised.listeners=PLAINTEXT://192.168.1.101:9092
log.dirs=/data/kafka/logs

# 公共配置
num.network.threads=3
num.io.threads=8
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600
num.partitions=3
num.recovery.threads.per.data.dir=1
offsets.topic.replication.factor=3
transaction.state.log.replication.factor=3
transaction.state.log.min.isr=3
log.retention.hours=168
log.retention.check.interval.ms=300000
zookeeper.connect=zookeeper1:2181,zookeeper2:2181,zookeeper3:2181
zookeeper.connection.timeout.ms=18000
```

启动 Kafka：

```bash
cd /opt/kafka
bin/kafka-server-start.sh -daemon config/server.properties
```

**步骤 3：创建 Topic**

```bash
bin/kafka-topics.sh --create \
  --bootstrap-server kafka1:9092,kafka2:9092,kafka3:9092 \
  --topic fee-dig-www-log \
  --partitions 9 \
  --replication-factor 3
```

**步骤 4：配置 Logstash**

在每台 Nginx 服务器上安装 Logstash：

```bash
# 下载 Logstash
wget https://artifacts.elastic.co/downloads/logstash/logstash-8.8.0-linux-x86_64.tar.gz
tar -xzf logstash-8.8.0-linux-x86_64.tar.gz
mv logstash-8.8.0 logstash

# 创建配置
cd logstash
vim config/kafka.conf
```

配置内容：

```ruby
input {
  file {
    path => "/var/log/nginx/fee-access.log"
    start_position => "end"
    sincedb_path => "/data/logstash/sincedb"
  }
}

output {
  kafka {
    bootstrap_servers => "kafka1:9092,kafka2:9092,kafka3:9092"
    topic_id => "fee-dig-www-log"
    codec => plain
  }
}
```

启动 Logstash：

```bash
bin/logstash -f config/kafka.conf
```

**步骤 5：配置 Fee 项目**

编辑 `server/src/configs/common.js`：

```javascript
const production = {
  loginType: 'uc',
  use: {
    kafka: true,  // ← 启用 Kafka
    alarm: true
  },
  nginxLogFilePath: '/var/log/nginx/'
}
```

编辑 `server/src/configs/kafka.js`：

```javascript
const production = {
  'metadata.broker.list': 'kafka1:9092,kafka2:9092,kafka3:9092',
  'group.id': 'fee-consumer-group',
  'socket.keepalive.enable': true,
  'enable.auto.commit': false,
  'fetch.min.bytes': 1048576,  // 1MB
  'fetch.wait.max.ms': 500
}
```

**步骤 6：启动项目**

```bash
cd /opt/fee-pro/server

# 使用 PM2 启动
pm2 start pm2_fee_app.json --env production
pm2 start pm2_fee_task_manager.json --env production
```

#### 3.2.3 生产环境配置规范

**Kafka 配置优化**：

```properties
# server.properties 关键配置

# 性能优化
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=1048576
socket.receive.buffer.bytes=1048576
socket.request.max.bytes=104857600

# 分区配置
num.partitions=9  # 根据消费者数量调整

# 副本配置
default.replication.factor=3
offsets.topic.replication.factor=3
transaction.state.log.replication.factor=3
transaction.state.log.min.isr=2

# 日志保留
log.retention.hours=168  # 7 天
log.retention.bytes=1073741824  # 1GB
log.segment.bytes=1073741824
log.retention.check.interval.ms=300000

# 压缩
log.cleanup.policy=delete
compression.type=lz4
```

**JVM 配置**：

```bash
# 编辑 kafka-server-start.sh
vim bin/kafka-server-start.sh

# 修改 JVM 参数
export KAFKA_HEAP_OPTS="-Xmx6G -Xms6G"
export KAFKA_JVM_PERFORMANCE_OPTS="-server -XX:+UseG1GC -XX:MaxGCPauseMillis=20 -XX:InitiatingHeapOccupancyPercent=35 -XX:+ExplicitGCInvokesConcurrent -Djava.awt.headless=true"
```

**监控配置**：

使用 JMX 监控 Kafka：

```bash
# 启动时添加 JMX 参数
export JMX_PORT=9999
bin/kafka-server-start.sh config/server.properties
```

使用 Prometheus + Grafana 监控：

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'kafka'
    static_configs:
      - targets: ['kafka1:9999', 'kafka2:9999', 'kafka3:9999']
```

### 3.3 开发人员需要进行的额外配置

#### 3.3.1 使用 Nginx 模式（默认，无需额外配置）

**无需任何额外配置**，只需确保：

1. Nginx 正在运行
2. `common.js` 中 `use.kafka = false`
3. `nginxLogFilePath` 配置正确

#### 3.3.2 使用 Kafka 模式（需要额外配置）

**步骤 1：安装编译工具**

```powershell
# Windows
npm install -g windows-build-tools

# Linux
sudo apt-get install build-essential
sudo yum groupinstall "Development Tools"
```

**步骤 2：安装 librdkafka**

```bash
# Ubuntu/Debian
sudo apt-get install librdkafka-dev

# CentOS/RHEL
sudo yum install librdkafka-devel

# macOS
brew install librdkafka
```

**步骤 3：安装 node-rdkafka**

```bash
cd d:\mywork\demo\fee-pro\server
npm install node-rdkafka
```

**步骤 4：验证安装**

```bash
node -e "const kafka = require('node-rdkafka'); console.log('Kafka version:', kafka.version);"
```

应该输出：

```
Kafka version: 2.x.x
```

### 3.4 常见问题排查

#### 问题 1：node-rdkafka 安装失败

**错误信息**：

```
gyp ERR! build error
gyp ERR! stack Error: not found: msbuild
```

**解决方案**：

**Windows**：

```powershell
# 安装 Windows 构建工具
npm install -g windows-build-tools

# 或手动安装 Visual Studio Build Tools
# 下载：https://visualstudio.microsoft.com/visual-cpp-build-tools/
# 安装时勾选 "C++ build tools"
```

**Linux**：

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y build-essential libssl-dev

# CentOS/RHEL
sudo yum groupinstall -y "Development Tools"
sudo yum install -y openssl-devel
```

**macOS**：

```bash
brew install librdkafka
```

#### 问题 2：Kafka 连接失败

**错误信息**：

```
Error: Local: Broker transport failure
Error: Local: All broker connections are down
```

**排查步骤**：

**步骤 1：检查 Kafka 是否运行**

```bash
# 检查进程
ps aux | grep kafka

# 检查端口
netstat -tlnp | grep 9092
```

**步骤 2：检查 Zookeeper 是否运行**

```bash
# 检查进程
ps aux | grep zookeeper

# 检查端口
netstat -tlnp | grep 2181
```

**步骤 3：测试连接**

```bash
# 使用 Kafka 自带工具测试
bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092
```

**步骤 4：检查配置文件**

```javascript
// server/src/configs/kafka.js
const development = {
  'metadata.broker.list': 'localhost:9092',  // ← 确保地址正确
  'group.id': 'fee-consumer-group',
  'socket.keepalive.enable': true,
  'enable.auto.commit': false
}
```

#### 问题 3：Topic 不存在

**错误信息**：

```
Error: Local: Unknown topic
```

**解决方案**：

```bash
# 创建 Topic
bin/kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic fee-dig-www-log \
  --partitions 3 \
  --replication-factor 1

# 查看 Topic 列表
bin/kafka-topics.sh --list --bootstrap-server localhost:9092
```

#### 问题 4：消费者无法消费消息

**排查步骤**：

**步骤 1：检查消费者组**

```bash
# 查看消费者组
bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list

# 查看消费者组详情
bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group fee-consumer-group
```

**步骤 2：检查 Offset**

```bash
# 查看 Topic 的 Offset
bin/kafka-run-class.sh kafka.tools.GetOffsetShell \
  --broker-list localhost:9092 \
  --topic fee-dig-www-log
```

**步骤 3：手动消费测试**

```bash
bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic fee-dig-www-log \
  --from-beginning
```

#### 问题 5：日志文件路径错误

**错误信息**：

```
Error: ENOENT: no such file or directory
```

**解决方案**：

**步骤 1：检查 Nginx 日志路径配置**

```javascript
// server/src/configs/common.js
const development = {
  nginxLogFilePath: 'D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/'  // ← 确保路径存在
}
```

**步骤 2：检查日志文件是否存在**

```powershell
# Windows
dir D:\phpstudy_pro\Extensions\Nginx1.15.11\logs\

# Linux
ls -la /var/log/nginx/
```

**步骤 3：检查 Nginx 配置**

```nginx
# nginx.conf
http {
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/fee-access.log main;  # ← 确保日志路径正确
}
```

### 3.5 验证 Kafka 服务正常运行的步骤

#### 3.5.1 基础验证

**验证 1：检查 Kafka 进程**

```bash
# Linux
ps aux | grep kafka

# Windows
Get-Process java | Where-Object { $_.CommandLine -like '*kafka*' }
```

**验证 2：检查端口监听**

```bash
# Linux
netstat -tlnp | grep 9092

# Windows
netstat -ano | findstr 9092
```

**验证 3：测试 Kafka 连接**

```bash
bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092
```

应该输出 Kafka Broker 的版本信息。

#### 3.5.2 功能验证

**验证 1：创建测试 Topic**

```bash
bin/kafka-topics.sh --create \
  --bootstrap-server localhost:9092 \
  --topic test-topic \
  --partitions 1 \
  --replication-factor 1
```

**验证 2：发送测试消息**

```bash
bin/kafka-console-producer.sh --broker-list localhost:9092 --topic test-topic
> Hello Kafka
> Test Message
> Ctrl+C 退出
```

**验证 3：消费测试消息**

```bash
bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic test-topic --from-beginning

# 应该看到：
# Hello Kafka
# Test Message
```

**验证 4：删除测试 Topic**

```bash
bin/kafka-topics.sh --delete --bootstrap-server localhost:9092 --topic test-topic
```

#### 3.5.3 项目集成验证

**验证 1：启动项目并查看日志**

```powershell
cd d:\mywork\demo\fee-pro\server
npm run fee_test Task:Manager
```

查看日志输出：

```
[按分钟] 每分钟启动一次SaveLog
client 获取成功
kafka 链接成功, 开始录入数据
```

**验证 2：发送测试请求**

在浏览器中访问前端页面，触发一些操作（如点击按钮、访问页面）。

**验证 3：检查日志文件**

```powershell
# 查看 Kafka 日志目录
dir d:\mywork\demo\fee-pro\server\log\kafka\

# 查看原始日志
type d:\mywork\demo\fee-pro\server\log\kafka\raw\YYYYMM\day_DD\HH\mm.log

# 查看 JSON 日志
type d:\mywork\demo\fee-pro\server\log\kafka\json\YYYYMM\day_DD\HH\mm.log
```

**验证 4：检查数据库**

```sql
-- 检查监控数据
SELECT COUNT(*) FROM t_o_monitor_2_YYYYMM 
WHERE create_time >= UNIX_TIMESTAMP() - 3600;

-- 检查是否有新数据
SELECT * FROM t_o_monitor_2_YYYYMM 
ORDER BY create_time DESC 
LIMIT 10;
```

#### 3.5.4 性能验证

**验证 1：检查 Kafka 吞吐量**

```bash
# 使用 Kafka 自带性能测试工具
bin/kafka-producer-perf-test.sh --topic fee-dig-www-log \
  --num-records 100000 \
  --record-size 1024 \
  --throughput -1 \
  --producer-props bootstrap.servers=localhost:9092
```

应该看到类似输出：

```
100000 records sent, 50000.0 records/sec (48.83 MB/sec), 20.0 ms avg latency, 50.0 ms max latency
```

**验证 2：检查消费者延迟**

```bash
bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group fee-consumer-group
```

查看 `LAG` 列，应该接近 0。

**验证 3：监控系统资源**

```bash
# 检查 Kafka 进程资源占用
top -p $(pgrep -f kafka)

# 检查磁盘 IO
iostat -x 1

# 检查网络流量
iftop -i eth0
```

---

## 四、总结

### 4.1 Kafka 在项目中的定位

| 方面 | 说明 |
|------|------|
| **是否必须** | 不是必须的，项目支持 Nginx 模式和 Kafka 模式 |
| **适用场景** | 高并发、分布式部署、需要削峰填谷的场景 |
| **核心作用** | 日志收集与传输的中间件，解耦日志产生和处理 |
| **替代方案** | 直接读取 Nginx 日志文件（适合低并发场景） |

### 4.2 开发环境建议

| 场景 | 建议 |
|------|------|
| **本地开发** | 使用 Nginx 模式，无需安装 Kafka |
| **测试环境** | 根据并发量选择，建议使用 Kafka 模式 |
| **生产环境** | 强烈建议使用 Kafka 模式，保证系统稳定性 |

### 4.3 关键文件清单

| 文件路径 | 作用 |
|----------|------|
| `server/src/configs/common.js` | 配置是否使用 Kafka |
| `server/src/configs/kafka.js` | Kafka 连接配置 |
| `server/src/library/kafka/index.js` | Kafka 工具库 |
| `server/src/commands/save_log/parseKafkaLog.js` | Kafka 日志消费命令 |
| `server/src/commands/save_log/parseNginxLog.js` | Nginx 日志读取命令 |
| `server/src/commands/save_log/base.js` | 日志处理基类 |
| `server/src/commands/task/manage.js` | 任务调度，选择日志收集方式 |

### 4.4 快速参考

**切换到 Kafka 模式**：

```javascript
// server/src/configs/common.js
use: {
  kafka: true  // ← 改为 true
}
```

**切换到 Nginx 模式**：

```javascript
// server/src/configs/common.js
use: {
  kafka: false  // ← 改为 false
}
```

**验证 Kafka 是否工作**：

```bash
# 1. 检查 Kafka 进程
ps aux | grep kafka

# 2. 检查 Topic
bin/kafka-topics.sh --list --bootstrap-server localhost:9092

# 3. 启动项目查看日志
npm run fee_test Task:Manager

# 4. 检查日志文件
ls -la server/log/kafka/
```

---

**文档版本**：v1.0  
**最后更新**：2026-06-12  
**维护人员**：Fee 开发团队
