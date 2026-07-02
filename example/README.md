# Fee SDK Example 模拟业务方项目

`example` 是一个独立的业务方演示子项目，用来完整演示主项目 `sdk/` 的数据打点能力，以及数据从业务页面产生到服务端解析、再到 `client` 后台展示的闭环。

本子项目不引入第三方依赖，使用 Node.js 内置 `http` 模块提供页面和打点收集接口。

---

## 一、项目定位

主项目包含三部分：

- `sdk/`：业务页面接入的浏览器端 SDK。
- `server/`：接收、解析、汇总并入库监控数据。
- `client/`：展示错误、性能、UV/PV、用户行为等监控数据。

`example/` 扮演的是“真实业务方项目”：

```text
example 页面
  -> 引入主项目 SDK
  -> 调用 window.dt 打点 API
  -> SDK 通过 Image 请求上报
  -> example 收集器写入日志
  -> server Parse/Summary 命令解析入库
  -> client 后台展示
```

---

## 二、目录结构

```text
example/
├── config/
│   └── default.json              # 示例项目配置：端口、项目 pid、项目 id、日志写入开关
├── public/
│   ├── index.html                # 示例业务页面
│   └── sdk-bridge.js             # SDK 打点地址桥接脚本
├── scripts/
│   ├── server.js                 # 独立 HTTP 服务和打点收集器
│   ├── build.js                  # 构建前检查脚本
│   ├── smoke-test.js             # 冒烟测试脚本
│   └── print-flow-commands.js    # 输出 server 解析命令
├── src/
│   ├── main.js                   # 业务打点示例代码
│   └── styles.css                # 页面样式
├── package.json
└── README.md
```

运行后会生成日志目录：

```text
example/logs/
├── nginx/fee-access.log          # Nginx-like 原始访问日志
└── records.jsonl                 # example 收集器规范化后的记录
```

如果 `config/default.json` 中 `writeServerKafkaLog` 为 `true`，还会写入主项目服务端可消费的日志：

```text
server/log/kafka/raw/...
server/log/kafka/json/...
```

---

## 三、运行方式

在仓库根目录进入 `example`：

```bash
cd example
npm start
```

默认访问地址：

```text
http://127.0.0.1:8090
```

本项目没有第三方依赖，一般不需要执行 `npm install`。保留 `package.json` 是为了让它像真实业务方项目一样具备独立脚本入口。

---

## 四、构建检查

```bash
cd example
npm run build
```

这个脚本不会打包前端资源，主要做以下检查：

- `example` 必要文件是否存在。
- 主项目 SDK 浏览器构建产物是否存在。
- 当前 `projectPid`、`projectId` 配置是否可读。

如果提示找不到 SDK：

```text
sdk/dist/js/**/index.js
```

请先构建主项目 SDK：

```bash
cd ../sdk
npm run build
```

---

## 五、关键配置

配置文件：

```text
example/config/default.json
```

核心字段：

| 字段 | 说明 |
|------|------|
| `port` | example 本地服务端口，默认 `8090` |
| `projectId` | server 数据库中的项目 ID，默认 `1` |
| `projectPid` | SDK 上报的项目标识，默认 `template` |
| `sdkTarget` | 主项目 SDK 内部默认打点地址，当前为 `http://test.com/dig` |
| `collectorPath` | example 本地收集接口，默认 `/dig` |
| `writeServerKafkaLog` | 是否同时写入 `server/log/kafka`，默认 `true` |
| `serverKafkaLogRoot` | 从 example 到主项目 Kafka 日志目录的相对路径 |

默认 `projectPid` 使用 `template`，因为主项目 `Utils:TemplateSQL` 会创建：

```sql
REPLACE INTO t_o_project (..., id, project_name, ...) VALUES (..., 1, 'template', ...);
```

如果你改成其他 pid，需要确保 `server` 数据库中的 `t_o_project.project_name` 已经存在对应项目，否则服务端正式 `SaveLog:Nginx` 会将日志判定为未注册项目。

---

## 六、为什么需要 `sdk-bridge.js`

主项目 SDK 当前在 `sdk/src/index.js` 中固定了打点目标：

```js
const feeTarget = 'http://test.com/dig'
```

浏览器页面直接运行时，`test.com` 通常不是本地 example 服务。为了不修改 SDK 源码，`example/public/sdk-bridge.js` 在业务方页面中提前加载，拦截 SDK 内部的：

```js
new window.Image().src = 'http://test.com/dig?d=...'
```

并改写为：

```text
http://127.0.0.1:8090/dig?d=...
```

这样可以做到：

- 页面仍然引入主项目真实 SDK 构建产物。
- 不改 `sdk/src` 代码。
- 本地可以完整观察 SDK 上报数据。
- 收集器可以模拟 Nginx 日志和 server Kafka JSON 日志。

---

## 七、功能演示清单

打开页面后，SDK 会自动初始化：

```js
window.dt.set({
  pid: 'template',
  uuid: 'example-device-...',
  ucid: 'example-user-...',
  record: {
    time_on_page: true,
    performance: true,
    js_error: true
  }
})
```

页面提供以下演示按钮：

| 操作 | SDK 类型 | SDK 调用 | 对应后端解析 |
|------|----------|----------|--------------|
| 页面浏览打点 | `product` | `dt.behavior('EXAMPLE_PAGE_VIEW', ...)` | `Parse:MenuClick`，同时也会参与 UV/PV |
| 按钮点击打点 | `product` | `dt.behavior('EXAMPLE_PRIMARY_BUTTON', ...)` | `Parse:MenuClick` |
| 表单提交 | `product` + `info` | `dt.behavior(...)` + `dt.info(...)` | 行为进入 `Parse:MenuClick`，info 保留在日志中 |
| 主动错误上报 | `error` | `dt.notify(...)` | `Parse:Monitor`，错误类型 code=8 |
| JS 运行时错误 | `error` | 抛出异常，SDK 自动捕获 | `Parse:Monitor`，错误类型 code=7 |
| 资源加载错误 | `error` | 加载不存在图片，SDK 自动捕获 | `Parse:Monitor`，错误类型 code=7 |
| 页面加载性能 | `perf` | SDK `window.onload` 自动上报 | `Parse:Performance` |
| 资源加载性能 | `info` | `PerformanceObserver` + `dt.info(20010, ...)` | 当前 client 无内置信息看板，日志保留 |
| 交互性能 | `info` | `PerformanceObserver` + `dt.info(20011, ...)` | 当前 client 无内置信息看板，日志保留 |
| 在线时长 | `product` | SDK click 后间隔超过 5s 自动上报 code=10001 | `Parse:TimeOnSiteByHour` |

说明：

- `error`、`product`、`perf` 是当前 server/client 已有数据链路重点消费的数据。
- `info` 是 SDK 支持的扩展类型，example 会完整上报和记录；当前主项目 client 没有内置 info 展示页面，后续可新增解析器和看板。

---

## 八、数据闭环验证步骤

### 8.1 准备 server 数据库

确保 MySQL、Redis 配置可用，并在 `server` 目录完成数据库初始化。

常见流程：

```bash
cd ../server
npm install
npm run build
npm run fee Utils:TemplateSQL
```

`Utils:TemplateSQL` 会创建项目 `template`，其项目 ID 为 `1`。

如果当前月份的分表不存在，可以使用：

```bash
npm run fee Utils:GenerateSQL 1 "2026-07" "2026-07"
```

生成 SQL 后执行到 MySQL。实际月份请按当前时间调整。

### 8.2 启动 example 并产生数据

```bash
cd ../example
npm start
```

访问：

```text
http://127.0.0.1:8090
```

在页面上依次点击各类演示按钮，并提交表单。

页面右侧“本地采集记录”会展示 example 收集器收到的最近记录。

### 8.3 检查本地日志

example 原始日志：

```text
example/logs/nginx/fee-access.log
```

example 规范化记录：

```text
example/logs/records.jsonl
```

server 可消费 JSON 日志：

```text
server/log/kafka/json/month_YYYYMM/day_DD/HH/mm.log
```

### 8.4 运行 server 解析命令

example 提供命令生成器：

```bash
cd example
npm run flow:commands
```

它会根据当前时间输出最近 15 分钟的解析命令，例如：

```bash
cd ..\server
npm run fee Parse:Monitor "2026-07-02 10:00" "2026-07-02 10:15"
npm run fee Parse:Performance "2026-07-02 10:00" "2026-07-02 10:15"
npm run fee Parse:UV "2026-07-02 10:00" "2026-07-02 10:15"
npm run fee Parse:MenuClick "2026-07-02 10:00" "2026-07-02 10:15"
npm run fee Parse:TimeOnSiteByHour "2026-07-02 10:00" "2026-07-02 10:15"
```

如果 `server/package.json` 中的 `fee` 脚本已经改成 `cross-env`，Windows、Linux、macOS 都可以直接执行。

如果还没有完全改造跨平台脚本，Windows 下可以使用：

```bash
npm run fee_test Parse:Monitor "2026-07-02 10:00" "2026-07-02 10:15"
```

或先设置环境变量再运行：

```powershell
$env:NODE_ENV='development'
node dist/fee.js "Parse:Monitor" "2026-07-02 10:00" "2026-07-02 10:15"
```

### 8.5 启动 client 查看

启动后端 API：

```bash
cd server
npm run dev
```

启动前端管理后台：

```bash
cd ../client
npm install
npm run dev
```

访问：

```text
http://127.0.0.1:8080
```

默认账号：

```text
test@qq.com
```

默认密码：

```text
admin
```

登录后选择模板项目，查看：

- 错误看板：主动错误和被动 JS/资源错误。
- 性能监控：页面加载性能指标。
- UV/PV：由 example 产生的访问记录。
- 菜单点击量：页面浏览、按钮点击、表单提交等行为。
- 在线时长：停留时长记录。
- 系统分布：执行设备解析和汇总后可查看 OS、浏览器等分布。

---

## 九、冒烟测试

运行：

```bash
cd example
npm test
```

测试脚本会：

1. 临时启动 example 服务。
2. 向 `/dig` 发送 `error`、`product`、`perf`、`info` 四类模拟记录。
3. 读取 `/api/records`。
4. 校验四类记录都被收集成功。

测试默认不会写入 `server/log/kafka`，只验证 example 自身收集器稳定性。

---

## 十、与正式链路的关系

正式生产链路通常是：

```text
业务页面 SDK
  -> Nginx /dig
  -> access.log
  -> server SaveLog:Nginx
  -> server/log/kafka/json
  -> Parse:* 命令入库
  -> Summary:* 命令汇总
  -> client 展示
```

example 为了降低本地演示成本，同时做了两件事：

1. 写 `example/logs/nginx/fee-access.log`，保留 Nginx-like 原始日志，便于理解正式链路。
2. 直接写 `server/log/kafka/json`，这样无需修改主项目 `server/src/configs/common.js` 的 `nginxLogFilePath`，即可让 `Parse:*` 命令消费示例数据。

如果你希望完全按正式 Nginx 日志方式验证，可以：

1. 将 `server/src/configs/common.js` 中 `nginxLogFilePath` 临时指向 `example/logs/nginx/`。
2. 运行：

   ```bash
   cd server
   npm run fee SaveLog:Nginx
   ```

3. 再运行对应 `Parse:*` 命令。

注意：这会修改主项目配置文件，提交前请确认是否需要保留。

---

## 十一、常见问题

### 11.1 页面提示 SDK 未加载

先检查 SDK 构建产物是否存在：

```text
sdk/dist/js/**/index.js
```

如果不存在：

```bash
cd ../sdk
npm install
npm run build
```

### 11.2 example 有记录，但 server 解析后 client 看不到

优先检查：

- `projectPid` 是否为 `template`，或是否已在 `t_o_project` 注册。
- `projectId` 是否与数据库项目 ID 一致。
- 当前月份分表是否已创建。
- 是否运行了对应 `Parse:*` 和 `Summary:*` 命令。
- `client` 当前选择的项目是否是模板项目。

### 11.3 `info` 数据为什么 client 没有页面展示

SDK 支持 `info` 类型，但当前主项目已有看板主要消费：

- `error`
- `perf`
- `product` 的 `10001`、`10002`
- UV/PV 和系统分布类公共信息

`info` 数据会被 example 收集器和 server JSON 日志保留。要在 client 展示，需要在 server 侧新增对应解析、入库和 API，再在 client 增加页面。

### 11.4 在线时长为什么不是每次点击都有

SDK 内部逻辑是：

- 15 分钟无操作视为离线。
- 两次点击间隔超过 5 秒才会上报一次停留时长。

因此想演示 `duration_ms`，可以打开页面后等待 5 秒以上，再点击任意按钮。

---

## 十二、环境变量覆盖

可以通过环境变量覆盖部分配置：

```bash
EXAMPLE_PORT=8091 npm start
EXAMPLE_PROJECT_PID=template npm start
EXAMPLE_PROJECT_ID=1 npm start
EXAMPLE_WRITE_SERVER_KAFKA_LOG=0 npm start
```

Windows PowerShell：

```powershell
$env:EXAMPLE_PORT='8091'
npm start
```

---

## 十三、最小演示流程

```bash
# 1. 构建 SDK
cd sdk
npm install
npm run build

# 2. 准备 server
cd ../server
npm install
npm run build
npm run fee Utils:TemplateSQL

# 3. 启动 example
cd ../example
npm start

# 4. 浏览器访问并点击演示按钮
# http://127.0.0.1:8090

# 5. 输出解析命令
npm run flow:commands

# 6. 回到 server 执行 Parse/Summary 命令

# 7. 启动 client 查看结果
cd ../client
npm install
npm run dev
```

---

## 十四、设计边界

- example 不修改主项目 SDK 源码。
- example 不默认修改 `server/src/configs`。
- example 默认写入 `server/log/kafka/json` 是为了便于本地闭环演示。
- example 的 `info` 类型用于证明 SDK 扩展类型可上报；主项目 client 是否展示取决于是否实现对应后端解析和前端页面。
- example 的收集器模拟了 Nginx access log 中服务端关心的字段，不追求覆盖所有 Nginx 日志格式。
