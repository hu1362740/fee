# Fee SDK Example 模拟业务方项目

`example` 是一个独立的业务方演示子项目，用来模拟真实业务系统接入主项目 `sdk/`，并演示数据从业务页面产生、经本机 Nginx 接收、由 `server` 解析入库、最终在 `client` 展示的完整链路。

本子项目不修改 SDK 源码，也不改写 SDK 打点地址。当前主项目 SDK 在 `sdk/src/index.js` 中固定：

```js
const feeTarget = 'http://test.com/dig'
```

本机已经通过 Nginx 将 `http://test.com/dig` 接到日志入口，因此 example 页面会直接使用这个真实打点目标。

---

## 一、项目定位

`example/` 扮演“业务方项目”：

```text
example 页面
  -> 直接引入主项目 SDK 构建产物
  -> 调用 window.dt 打点 API
  -> SDK 通过 Image 请求发送到 http://test.com/dig
  -> 本机 Nginx 接收并写 access log
  -> server SaveLog:Nginx 转换为 server/log/kafka/json
  -> server Parse/Summary 命令解析、汇总并入库
  -> client 后台展示
```

---

## 二、目录结构

```text
example/
├── config/
│   └── default.json              # 示例项目配置：端口、项目 pid、项目 id 等
├── public/
│   └── index.html                # 示例业务页面
├── scripts/
│   ├── server.js                 # 独立 HTTP 服务；另保留 /dig 作为冒烟测试收集入口
│   ├── build.js                  # 构建前检查脚本
│   ├── smoke-test.js             # 冒烟测试脚本
│   └── print-flow-commands.js    # 输出 server 解析命令
├── src/
│   ├── main.js                   # 业务打点示例代码
│   └── styles.css                # 页面样式
├── package.json
└── README.md
```

说明：

- 页面不再包含 `sdk-bridge.js`。
- SDK 请求不会发到 example 服务的 `/dig`，而是发到 SDK 内置的 `http://test.com/dig`。
- `scripts/server.js` 中的 `/dig` 仅保留给 `npm test` 做收集器冒烟测试，正常页面演示不使用它。

---

## 三、运行方式

```bash
cd example
npm start
```

默认访问：

```text
http://127.0.0.1:8090
```

如果 8090 端口被占用，可以换端口：

```powershell
$env:EXAMPLE_PORT='8091'
npm start
```

---

## 四、构建检查

```bash
cd example
npm run build
```

检查内容：

- example 必要文件是否存在。
- 主项目 SDK 浏览器构建产物是否存在。
- 当前 `projectPid`、`projectId` 配置是否可读。

如果缺少 SDK 构建产物，先执行：

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
| `port` | example 本地页面服务端口，默认 `8090` |
| `projectId` | server 数据库中的项目 ID，默认 `1` |
| `projectPid` | SDK 上报的项目标识，默认 `template` |
| `collectorPath` | example 内置测试收集接口，默认 `/dig`，仅用于 `npm test` |
| `writeServerKafkaLog` | `npm test` 直接打 `/dig` 时是否写入 server kafka 日志，默认 `true` |
| `serverKafkaLogRoot` | 从 example 到主项目 Kafka 日志目录的相对路径 |

默认 `projectPid` 使用 `template`，因为主项目 `Utils:TemplateSQL` 会创建：

```sql
REPLACE INTO t_o_project (..., id, project_name, ...) VALUES (..., 1, 'template', ...);
```

如果改成其他 pid，需要保证 `server` 数据库中的 `t_o_project.project_name` 已注册，否则 `SaveLog:Nginx` 会把日志判定为未注册项目。

---

## 六、功能演示清单

页面启动后会执行：

```js
window.dt.set({
  pid: 'template',
  uuid: 'example-device-...',
  ucid: 'example-user-...',
  is_test: false,
  version: 'example-business-1.0.0',
  record: {
    time_on_page: true,
    performance: true,
    js_error: true
  }
})
```

页面提供以下演示：

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

---

## 七、数据闭环验证步骤

### 7.1 准备本机 Nginx

确保本机访问：

```text
http://test.com/dig
```

会被 Nginx 接收，并且 Nginx access log 中能记录包含 `/dig?d=...` 的请求。

建议确认：

- hosts 已将 `test.com` 指向本机。
- Nginx 对 `/dig` 返回 1x1 图片或任意 200 响应。
- Nginx access log 路径与 `server/src/configs/common.js` 中 `nginxLogFilePath` 一致。
- 日志文件名符合 `SaveLog:Nginx` 支持的模式，例如 `fee-access.log` 或 `access.log`。

### 7.2 准备 server 数据库

```bash
cd ../server
npm install
npm run build
npm run fee Utils:TemplateSQL
```

`Utils:TemplateSQL` 会创建模板项目：

```text
project_id = 1
project_name = template
```

如果当前月份分表不存在，需要生成并执行建表 SQL。示例：

```bash
npm run fee Utils:GenerateSQL 1 "2026-07" "2026-07"
```

实际月份请按当前日期调整。

### 7.3 启动 example 并产生数据

```bash
cd ../example
npm start
```

访问：

```text
http://127.0.0.1:8090
```

在页面中点击各类演示按钮，并提交表单。

浏览器 Network 面板过滤 `dig`，应能看到请求发送到：

```text
http://test.com/dig?d=...
```

### 7.4 检查 Nginx 日志

检查本机 Nginx 日志中是否出现 `/dig?d=...`。

常见位置取决于你的本机配置，例如：

```text
D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/fee-access.log
D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/access.log
```

如果 Nginx 日志中没有数据，优先检查：

- `test.com` 是否解析到本机。
- 页面 Network 是否确实发出了 `http://test.com/dig` 请求。
- Nginx 是否启动。
- `/dig` location 是否记录 access log。

### 7.5 运行 SaveLog 与 Parse 命令

先将 Nginx access log 转换为 server 可消费的 JSON 日志：

```bash
cd ../server
npm run fee SaveLog:Nginx
```

然后运行解析命令。example 提供命令生成器：

```bash
cd ../example
npm run flow:commands
```

它会输出类似：

```bash
cd ..\server
npm run fee Parse:Monitor "2026-07-02 10:00" "2026-07-02 10:15"
npm run fee Parse:Performance "2026-07-02 10:00" "2026-07-02 10:15"
npm run fee Parse:UV "2026-07-02 10:00" "2026-07-02 10:15"
npm run fee Parse:MenuClick "2026-07-02 10:00" "2026-07-02 10:15"
npm run fee Parse:TimeOnSiteByHour "2026-07-02 10:00" "2026-07-02 10:15"
```

运行后再执行需要的 `Summary:*` 命令，让 client 图表读取汇总结果。

### 7.6 启动 client 查看

启动后端：

```bash
cd server
npm run dev
```

启动前端：

```bash
cd ../client
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
- UV/PV：example 页面访问记录。
- 菜单点击量：页面浏览、按钮点击、表单提交。
- 在线时长：停留时长记录。
- 系统分布：执行设备解析和汇总后查看 OS、浏览器等分布。

---

## 八、冒烟测试

```bash
cd example
npm test
```

测试脚本会临时启动 example 服务，并直接请求 example 内置 `/dig`，验证收集器可以接收 `error`、`product`、`perf`、`info` 四类记录。

注意：

- `npm test` 是 example 自身收集器测试。
- 正常页面演示不走 example 的 `/dig`。
- 正常页面演示走 SDK 内置 `http://test.com/dig` 和本机 Nginx。

---

## 九、常见问题

### 9.1 页面提示 SDK 未加载

检查 SDK 构建产物：

```text
sdk/dist/js/**/index.js
```

如果不存在：

```bash
cd ../sdk
npm install
npm run build
```

### 9.2 页面点击后 example 右侧没有本地记录

这是正常的。

页面打点走 `http://test.com/dig`，不会进入 example 的 `/dig`。请看浏览器 Network 和 Nginx access log。

### 9.3 Nginx 有日志，但 server 解析后 client 看不到

优先检查：

- `server/src/configs/common.js` 的 `nginxLogFilePath` 是否指向正确 Nginx 日志目录。
- `t_o_project` 是否存在 `project_name = 'template'`。
- 当前月份分表是否已创建。
- 是否执行了 `SaveLog:Nginx`。
- 是否执行了对应 `Parse:*` 和 `Summary:*`。
- client 当前选择的项目是否是模板项目。

### 9.4 `info` 数据为什么 client 没有页面展示

SDK 支持 `info` 类型，但当前主项目已有看板主要消费：

- `error`
- `perf`
- `product` 的 `10001`、`10002`
- UV/PV 和系统分布类公共信息

`info` 数据会进入 Nginx 原始日志。要在 client 展示，需要在 server 新增对应解析、入库和 API，再在 client 增加页面。

### 9.5 在线时长为什么不是每次点击都有

SDK 内部逻辑是：

- 15 分钟无操作视为离线。
- 两次点击间隔超过 5 秒才会上报一次停留时长。

因此想演示 `duration_ms`，可以打开页面后等待 5 秒以上，再点击任意按钮。

---

## 十、最小演示流程

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

# 3. 确认本机 Nginx 能接收 http://test.com/dig 并写 access log

# 4. 启动 example
cd ../example
npm start

# 5. 浏览器访问并点击演示按钮
# http://127.0.0.1:8090

# 6. 处理 Nginx 日志
cd ../server
npm run fee SaveLog:Nginx

# 7. 回到 example 输出 Parse/Summary 命令参考
cd ../example
npm run flow:commands

# 8. 回到 server 执行 Parse/Summary 命令

# 9. 启动 client 查看结果
cd ../client
npm run dev
```

---

## 十一、设计边界

- example 不修改主项目 SDK 源码。
- example 不改写 SDK 内置打点地址。
- example 页面不再使用 `sdk-bridge.js`。
- example 依赖本机 Nginx 接收 `http://test.com/dig`。
- example 的 `/dig` 仅作为冒烟测试入口保留。
- `info` 类型用于证明 SDK 扩展类型可上报；主项目 client 是否展示取决于是否实现对应后端解析和前端页面。
