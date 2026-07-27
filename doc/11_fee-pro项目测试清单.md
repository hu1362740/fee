# fee-pro 项目测试清单

> 适用范围：`sdk/`、`server/`、`client/` 三端，以及 SDK 打点到后台展示的完整链路。
> 生成日期：2026-07-03。

---

## 一、使用说明

- `[ ]` 表示待验证，`[x]` 表示已验证，`[N/A]` 表示本次改动不涉及。
- `P0` 为阻断发布项，`P1` 为核心回归项，`P2` 为建议补充项。
- 本清单优先用于每次发版、重要改动合入前、线上故障修复后回归。
- 文档改动可只做 Markdown 校验；涉及源码改动时按对应模块执行构建、单测和链路验证。

---

## 二、项目现状基线

### 2.1 模块与关键入口

- [ ] `P0` 确认 SDK 入口为 `sdk/src/index.js`，字段规则为 `sdk/src/rule.js`，全局 API 仍暴露为 `window.dt`。
- [ ] `P0` 确认 Server Web 入口为 `server/src/app.js`，CLI 入口为 `server/src/fee.js`，实际运行依赖 `server/dist/`。
- [ ] `P0` 确认 Client 入口为 `client/src/main.js`，路由配置为 `client/src/router/routers.js`，接口封装在 `client/src/api/`。
- [ ] `P1` 确认项目链路为：SDK 打点 -> Nginx/Kafka 日志 -> `SaveLog:*` -> `Parse:*` -> `Summary:*` -> MySQL -> Client `/api/*` 展示。
- [ ] `P1` 确认默认数据库为 `platform`，建表 SQL 由 `Utils:GenerateSQL` 生成。

### 2.2 现有测试现状

- [ ] `P1` Server 现有测试在 `server/src/test/`，`npm test` 读取 `dist/test/*.js`，执行前必须先 `npm run build`。
- [ ] `P1` Server 现有 `mocha_test.js` 包含 MySQL/Redis 环境断言，连接信息存在硬编码，执行前需确认本地测试库和账号。
- [ ] `P1` Client 现有 `client/tests/unit/HelloWorld.spec.js` 与 `client/tests/e2e/specs/test.js` 仍偏 Vue CLI 模板，新增业务改动时应补充真实页面用例。
- [ ] `P2` SDK 当前未发现专门测试目录，改 SDK 时至少需要通过手工页面或浏览器自动化验证上报内容。

---

## 三、测试环境准备

### 3.1 基础环境

- [ ] `P0` 执行 `git status --short`，记录已有未提交改动，禁止回退无关文件。
- [ ] `P0` 安装 Node.js 与 npm，优先使用与项目兼容的 Node 12.x 系列或测试环境固定版本。
- [ ] `P0` MySQL 可连接，目标库存在，默认库名为 `platform`。
- [ ] `P0` Redis 可连接，端口与 `server/src/configs/redis.js` 一致。
- [ ] `P1` 如走 Nginx 链路，确认 Nginx access log 格式与 `SaveLogBase.parseLog()` 期望字段位置一致。
- [ ] `P1` 如走 Kafka 链路，确认 `server/src/configs/common.js` 的 `use.kafka` 与 `server/src/configs/kafka.js` 配置正确。
- [ ] `P1` 服务器时区为 `Asia/Shanghai`，命令参数与日志落盘时间使用同一时区。
- [ ] `P1` 确认日志目录、`server/log`、Kafka 本地日志目录具有读写权限。
- [ ] `P2` 准备 Chrome、Firefox、Safari 或 Edge 中至少两类浏览器做 SDK 兼容验证。

### 3.2 数据库初始化

- [ ] `P0` 在 `server/` 下执行 `npm install`。
- [ ] `P0` 执行 `npm run build` 生成 `dist/`。
- [ ] `P0` 生成建表 SQL：`npm run fee Utils:GenerateSQL "1,2,3" "2026-07" "2026-08"`。
- [ ] `P0` 执行生成 SQL 时跳过命令输出前两行，确认项目、用户、报警、原始表、汇总表均创建成功。
- [ ] `P1` 执行 `npm run fee Utils:TemplateSQL` 写入样例数据。
- [ ] `P1` 确认 `t_o_project.project_name` 与 SDK `pid` 完全一致。
- [ ] `P1` 确认按项目、按月分表存在，例如 `t_o_monitor_1_202607`、`t_r_uv_record_1`。

### 3.3 本地启动

- [ ] `P0` Server 源码改动后执行 `npm run build`。
- [ ] `P0` Server 启动：`npm run dev`，默认端口 `3000`。
- [ ] `P0` Client 安装依赖：`cd client && npm install`。
- [ ] `P0` Client 启动：`npm run dev`，默认端口 `8080`，`/api` 代理到 `http://localhost:3000`。
- [ ] `P1` SDK 改动后执行：`cd sdk && npm install && npm run build`。

---

## 四、自动化与构建检查

### 4.1 Server

- [ ] `P0` `cd server && npm run build` 成功。
- [ ] `P1` `cd server && npm test` 成功，或明确记录因 MySQL/Redis/测试账号导致无法执行。
- [ ] `P1` 涉及 CLI 命令时，执行对应 `npm run fee <Command>` 做最小样例验证。
- [ ] `P1` 涉及 API 时，至少用浏览器、curl 或接口工具验证成功、失败、未登录、无权限四类响应。
- [ ] `P2` 如需风格检查，使用项目已安装 Standard JS 工具，不新增无关 lint 体系。

### 4.2 Client

- [ ] `P0` `cd client && npm run lint` 成功。
- [ ] `P1` `cd client && npm run test:unit` 成功；如模板测试失效，先替换为真实业务组件测试。
- [ ] `P1` `cd client && npm run test:e2e` 成功；至少覆盖登录、首页、核心菜单跳转。
- [ ] `P1` `cd client && npm run build` 成功，确认未产生无关 `client/config/env.js` 差异。
- [ ] `P2` 页面交互改动需启动开发服务，用浏览器完成主要路径回归。

### 4.3 SDK

- [ ] `P0` `cd sdk && npm run build` 成功。
- [ ] `P1` 检查 `sdk/src/` 与生成产物 `sdk/lib/` 是否符合发布要求。
- [ ] `P1` 用测试页面加载构建后的 SDK，验证 `window.dt` 可用且无控制台异常。

---

## 五、SDK 测试清单

### 5.1 初始化与配置

- [ ] `P0` `window.dt.set({ pid, reportUrl })` 后，`pid` 写入 `common.pid`，`reportUrl` 不写入 `common`。
- [ ] `P0` 未设置 `pid` 时，调用打点返回错误提示，不发送有效打点。
- [ ] `P0` 未设置或传入空的 `reportUrl` 时，调用打点返回错误提示，不发送请求。
- [ ] `P1` `uuid` 为空时仅提示警告，不阻断错误、性能、行为上报。
- [ ] `P1` `ucid` 为空时仅提示警告，不阻断其他上报。
- [ ] `P1` `is_test: true` 或旧字段 `test: true` 时，`common.test` 自动写入固定 `TEST_FLAG`。
- [ ] `P1` `log.set(config, true)` 覆盖旧配置，`log.set(config)` 深度合并旧配置。
- [ ] `P1` `getPageType()` 正常返回时写入 `common.page_type`。
- [ ] `P1` `getPageType()` 抛错时回退为 `location.host + location.pathname`。
- [ ] `P2` 旧配置字段 `jserror`、`performance`、`online` 仍兼容。

### 5.2 打点基础校验

- [ ] `P0` `type=error` 时 code 范围限制为 `1~9999`。
- [ ] `P0` `type=product` 时 code 范围限制为 `10000~19999`。
- [ ] `P0` `type=info` 时 code 范围限制为 `20000~29999`。
- [ ] `P0` `detail`、`extra` 非对象时返回错误提示。
- [ ] `P1` `rule.js` 中 code `1~5`、`8` 的必填字段与字段转换正确。
- [ ] `P1` `detailAdapter()` 将 `error_name` 转换为 `error_no`，保留 `http_code`、`during_ms`、`url`、`request_size_b`、`response_size_b`。
- [ ] `P1` 发送方式为 `new Image().src = <reportUrl>?d=<encoded json>`，`reportUrl` 已有查询参数时使用 `&d=`。
- [ ] `P1` URL 参数 `d` 解码后包含 `type`、`code`、`detail`、`extra`、`common`。
- [ ] `P1` `common.timestamp`、`runtime_version`、`sdk_version`、`page_type` 存在且格式正确。

### 5.3 错误上报

- [ ] `P0` JS 运行时错误被 `jstracker` 捕获并上报 code `7`。
- [ ] `P0` script、style、image、audio、video 资源加载失败分别映射到对应错误展示名。
- [ ] `P1` `console.error` 或 Vue errorHandler 捕获链路按配置开关生效。
- [ ] `P1` `record.js_error: false` 时自动错误不上报。
- [ ] `P1` `js_error_report_config.ERROR_*: false` 时对应错误类型不上报。
- [ ] `P1` `checkErrrorNeedReport()` 返回 `false` 时不上报，抛错时默认继续上报。
- [ ] `P1` `window.dt.notify(errorName, url, extraInfo)` 使用 code `8` 上报。
- [ ] `P1` `notify()` 中 `errorName`、`url` 超过 200 字符会截断。
- [ ] `P1` `notify()` 中 `http_code`、`during_ms`、`request_size_b`、`response_size_b` 会转为整数，非法值为 `0`。
- [ ] `P1` `extraInfo` 中受保护字段不进入 `extra`。

### 5.4 性能与行为上报

- [ ] `P0` `window.onload` 后发送 `type=perf`、code `20001` 的性能数据。
- [ ] `P1` 浏览器不支持 `window.performance` 时不抛异常。
- [ ] `P1` `record.performance: false` 时不发送性能上报。
- [ ] `P1` 点击间隔大于 5 秒且小于 15 分钟时，发送 code `10001` 在线时长。
- [ ] `P1` 点击间隔大于 15 分钟时只重置计时，不把离线时长计入在线时长。
- [ ] `P1` `record.time_on_page: false` 时不发送在线时长上报。
- [ ] `P1` `window.dt.behavior(code, name, url)` 发送 code `10002` 用户行为数据。
- [ ] `P2` 行为 code、name、url 的长度和特殊字符在服务端解析与后台展示中不破坏页面。

---

## 六、Server 测试清单

### 6.1 Express 服务与通用响应

- [ ] `P0` `/api/*` 与 `/project/:id/api/*` 进入后端 API 路由。
- [ ] `P0` 非 API 路径返回前端 `index.html`，支持 Vue history 模式刷新。
- [ ] `P0` JSON body、urlencoded body、cookie 解析正常。
- [ ] `P1` CORS 允许带 cookie 请求，开发代理下登录态可保持。
- [ ] `P1` 未捕获异常会记录日志、发送报警，并尝试重新启动服务。
- [ ] `P0` API 响应结构统一为 `{ code, action, data, msg, url }`。
- [ ] `P0` 验证 `success`、`alert`、`redirect`、`login`、`forbitan` 五类 action 的前后端处理。

### 6.2 登录、用户与权限

- [ ] `P0` `/api/login/type` 返回当前登录类型。
- [ ] `P0` 普通登录 `/api/login/normal` 成功后写入 `fee_token` cookie。
- [ ] `P0` UC 登录 `/api/login/uc` 在 UC 配置可用时成功，在不可用时给出明确错误。
- [ ] `P0` `/api/logout` 清理登录态。
- [ ] `P0` 未登录访问需要登录接口返回 `action=login`。
- [ ] `P0` 登录用户无项目权限访问 `/project/:id/api/*` 返回 `action=forbitan`。
- [ ] `P1` `PrivilegeChecker.appendUserInfo` 能解析合法 token，非法 token 不导致进程崩溃。
- [ ] `P1` `PrivilegeChecker.appendProjectInfo` 能从 `/project/:id/api/*` 提取项目 ID。
- [ ] `P1` 用户注册、资料修改、密码修改、账号注销流程可用。
- [ ] `P1` 用户搜索、UC 用户搜索在空关键字、无结果、多结果时表现正确。
- [ ] `P2` 密码哈希、固定 salt、cookie 有效期等安全风险在发布前被评估。

### 6.3 项目与成员管理

- [ ] `P0` `/api/project/item/list` 返回当前用户可见项目。
- [ ] `P0` 新增项目时 `display_name`、`project_name`、`rate`、描述字段落库正确。
- [ ] `P1` 重复 `project_name`、非法 `rate`、空名称等输入被拦截。
- [ ] `P1` 项目详情、更新、删除接口保持软删除语义。
- [ ] `P0` 成员列表、添加、删除、更新角色接口可用。
- [ ] `P1` owner 权限页面仅 owner 可见或可操作。
- [ ] `P1` 被删除成员不能继续访问项目接口。

### 6.4 日志接入 SaveLog

- [ ] `P0` `SaveLog:Nginx` 能读取 Nginx access log 并写入本地 raw/json 日志。
- [ ] `P0` `SaveLog:Kafka` 在 Kafka 配置可用时能消费并写入本地 raw/json 日志。
- [ ] `P0` 日志 URL 中 `d` 参数可解析为 JSON，上报缺失 `common.pid` 时被跳过。
- [ ] `P0` `pid` 未注册到项目表时被跳过，不写入业务日志。
- [ ] `P1` 兼容旧字段 `pub` 到 `common`。
- [ ] `P1` 包含测试标识 `TEST_FLAG` 的日志进入测试日志路径，不参与正常统计。
- [ ] `P1` 日志时间与服务器时间相差超过 10 天时被跳过。
- [ ] `P1` UA 字段含 `%`、中文、非法编码时不导致进程崩溃。
- [ ] `P1` IP 解析失败时有可接受默认值或明确日志。
- [ ] `P1` 采样率 `rate` 生效，边界值 `1`、`10000` 行为正确。
- [ ] `P1` 写入流复用和 `autoCloseOldStream()` 能关闭过期流，长时间运行不泄漏句柄。

### 6.5 Parse 命令

- [ ] `P0` 所有 Parse 命令参数格式为分钟粒度，结束时间早于开始时间时拒绝执行。
- [ ] `P0` 日志文件不存在时跳过该分钟，不报错退出。
- [ ] `P1` 单行 JSON 异常、字段缺失、类型错误时不会中断整个时间段处理。
- [ ] `P0` `Parse:Monitor` 正确解析错误日志 code `7`、`8`，写入 monitor 与 monitor_ext 分表。
- [ ] `P0` `Parse:Performance` 正确解析 code `20001`，写入性能原始表。
- [ ] `P0` `Parse:UV` 正确按 `uuid`、项目、地理位置生成 UV 原始记录。
- [ ] `P0` `Parse:TimeOnSiteByHour` 正确解析 code `10001`，过滤异常在线时长。
- [ ] `P0` `Parse:MenuClick` 正确解析 code `10002`，写入行为分布原始数据。
- [ ] `P1` `Parse:Device` 从 UA 中解析 OS、浏览器、设备、runtime version。
- [ ] `P1` `Parse:UserFirstLoginAt` 只记录用户首次出现时间，重复日志不覆盖或不重复计数。
- [ ] `P1` 跨小时、跨天、跨月日志写入正确分表。
- [ ] `P1` `md5` 去重逻辑对重复 raw log 生效。
- [ ] `P1` 每个命令输出的总记录数、处理数、入库成功数与数据库查询结果一致。

### 6.6 Summary 命令

- [ ] `P0` `Summary:UV <time> hour/day/month` 统计 UV 与城市分布正确。
- [ ] `P0` `Summary:PV <time> hour/day/month` 统计 PV 正确。
- [ ] `P0` `Summary:NewUser <time> hour/day/month` 统计新增用户正确。
- [ ] `P0` `Summary:Performance <time> hour/day/month` 统计性能均值、分位或页面维度数据正确。
- [ ] `P0` `Summary:Error <time> minute/hour/day` 统计错误名称、URL、城市分布正确。
- [ ] `P1` `Summary:TimeOnSite <time> day/month` 统计总停留时长、UV、平均在线时长正确。
- [ ] `P1` `Summary:HttpError <time> day/month` 统计 HTTP 错误分布正确。
- [ ] `P1` `Summary:SystemOS`、`Summary:SystemBrowser`、`Summary:SystemDevice`、`Summary:SystemRuntimeVersion` 月统计正确。
- [ ] `P1` 重复执行同一 Summary 命令应更新或覆盖同一统计记录，不产生重复脏数据。
- [ ] `P1` 空数据时间段返回 0 或空列表，不产生异常。
- [ ] `P1` 跨月汇总只读取目标月份分表，缺表时给出可定位错误。

### 6.7 API 功能

- [ ] `P0` 错误看板接口：`/api/error/distribution/summary`、`/api/error/log/list`、`/api/error/distribution/url`、`/api/error/distribution/error_name`、`/api/error/distribution/geography`。
- [ ] `P0` 错误趋势接口：`/api/error/viser/area/stack_area` 按时间粒度返回连续时间轴。
- [ ] `P0` 性能接口：`/api/performance/url_list`、`/api/performance/url/overview`、`/api/performance/project/overview`、`/api/performance/url/line_chart`。
- [ ] `P0` 用户行为接口：`/api/behavior/menu`、`/api/behavior/online`。
- [ ] `P0` 新增用户接口：`/api/project/summary/new_user/distribution_line`、`/api/project/summary/new_user/distribution_map`。
- [ ] `P0` UV/PV 接口：`/api/uv/count`、`/api/uv/trend`、`/api/pv/count`、`/api/pv/trend`。
- [ ] `P1` 系统环境接口：`/api/os`、`/api/browser/list`、`/api/browser`、`/api/browser/distribution_version`、`/api/device`、`/api/runtimeVersion`。
- [ ] `P1` 报警配置接口：新增、查询、列表、删除、更新、错误名列表、错误类型列表。
- [ ] `P1` 报警日志接口：`/api/alarm/log`、`/api/alarm/log/line`。
- [ ] `P1` 测试日志接口：`/api/log/content/test` 能展示 SDK 测试模式数据。
- [ ] `P1` 所有列表接口验证分页、排序、空结果、大时间范围和非法参数。

### 6.8 任务调度与工具命令

- [ ] `P0` `Task:Manager` 启动后只保留一个调度进程。
- [ ] `P1` Linux 环境下防重逻辑 `ps | grep Task:Manager` 能识别旧进程。
- [ ] `P1` Windows 环境下明确记录 TaskManager 防重逻辑不完整，不作为唯一验证方式。
- [ ] `P0` 每分钟任务按 `use.kafka` 选择 `SaveLog:Kafka` 或 `SaveLog:Nginx`，并执行 `Utils:SplitLog`、`WatchDog:Alarm`、`Parse:Monitor`、`Summary:Error`。
- [ ] `P1` 每 10 分钟任务执行缓存更新、UV/在线时长/性能/错误解析与小时汇总。
- [ ] `P1` 每小时任务执行设备、菜单点击、新增用户解析与日汇总。
- [ ] `P1` 每 6 小时任务执行昨日、当月、上月汇总与旧日志清理。
- [ ] `P1` `Utils:GenerateSQL` 生成 SQL 完整，项目列表、开始月、结束月边界正确。
- [ ] `P1` `Utils:TemplateSQL` 样例数据可重复执行或失败可解释。
- [ ] `P1` `Utils:SplitLog` 在 Windows 日志分割场景可用。
- [ ] `P1` `Utils:CleanOldLog` 只清理配置允许范围内旧日志，不误删当前日志。
- [ ] `P2` 如需使用 `Utils:ReProcessLog`，先确认该命令已在 `server/src/fee.js` 注册。

### 6.9 报警

- [ ] `P0` `WatchDog:Alarm` 能根据错误汇总和报警配置触发报警。
- [ ] `P0` 报警间隔 `alarm_interval_s` 生效，冷却期内不重复刷屏。
- [ ] `P1` 接收人 `receive_ucid_list` 为空、非法 JSON、多人列表时处理正确。
- [ ] `P1` 关闭 `is_enable` 后不触发报警。
- [ ] `P1` 报警触发后写入报警日志，并能在 Client 报警日志页面查询。
- [ ] `P2` 报警通道不可用时不影响主解析汇总任务继续执行。

---

## 七、Client 测试清单

### 7.1 登录、路由与布局

- [ ] `P0` 未登录访问任意业务页会跳转 `/login`。
- [ ] `P0` 登录成功后进入 `/project/1/home` 或用户有权限的项目首页。
- [ ] `P0` 已登录访问 `/login` 会跳转首页。
- [ ] `P1` 移动端 UA 访问时跳转 `mobileView`。
- [ ] `P1` 无权限访问 owner 页面或项目页面跳转 `401`。
- [ ] `P1` 左侧菜单、面包屑、顶部项目切换、标签导航在路由变化时同步更新。
- [ ] `P1` 刷新深层路由仍能正常展示，不出现 404。
- [ ] `P2` 多语言切换不会破坏菜单、表单、图表展示。

### 7.2 通用请求处理

- [ ] `P0` `action=success` 正常渲染数据。
- [ ] `P0` `action=alert` 弹出错误信息。
- [ ] `P0` `action=redirect` 按 `url` 跳转。
- [ ] `P0` `action=login` 清理或忽略旧状态后跳转登录页。
- [ ] `P0` `action=forbitan` 提示无权限并阻止继续操作。
- [ ] `P1` 请求失败、超时、500、返回结构异常时有可理解提示。
- [ ] `P1` 所有项目维度接口 URL 使用当前 `getProjectId()`。

### 7.3 业务页面

- [ ] `P0` 首页/错误看板展示错误总览、错误列表、趋势图、URL 分布、错误名分布、地域分布。
- [ ] `P0` 错误看板筛选时间、错误名、URL 后，各图表和列表联动正确。
- [ ] `P0` 错误日志分页、空状态、详情字段展示正确，长 stack 不撑破布局。
- [ ] `P0` 页面性能展示 URL 列表、项目概览、单 URL 概览、趋势图。
- [ ] `P1` 页面性能在无数据、单条数据、大量 URL 时均可用。
- [ ] `P0` 菜单点击量页面展示 code、name、url、点击量，并支持时间筛选。
- [ ] `P0` 用户在线时长页面按小时、日、周、月切换，时间轴连续。
- [ ] `P0` 新增用户页面折线图和地图分布一致。
- [ ] `P0` UV/PV 页面展示总数与趋势，时间范围切换后数据正确。
- [ ] `P1` 系统环境页面展示 OS、浏览器、浏览器版本、设备分布。
- [ ] `P1` 报警配置页面可新增、编辑、删除、启停规则，表单校验完整。
- [ ] `P1` 报警日志页面展示列表与趋势，支持时间范围筛选。
- [ ] `P1` 项目/成员管理页面可增删改查，角色变更后权限即时生效或刷新后生效。
- [ ] `P2` 移动端视图展示核心监控指标，布局不重叠。

### 7.4 图表、表格与交互细节

- [ ] `P1` 所有图表在窗口 resize 后重新布局。
- [ ] `P1` 图表空数据有空态，不显示异常坐标轴或 `NaN`。
- [ ] `P1` 大数字、长 URL、长错误名不会导致表格列错位。
- [ ] `P1` 时间选择组件输出的毫秒/秒单位与后端接口一致。
- [ ] `P1` loading、禁用按钮、防重复提交状态完整。
- [ ] `P2` 导出、复制、编辑器、Markdown、Excel 等通用组件如被改动需单独回归。

---

## 八、端到端链路测试

### 8.1 最小可用链路

- [ ] `P0` 初始化数据库并写入一个项目，项目 ID 与 SDK `pid` 匹配。
- [ ] `P0` 启动 Server 与 Client，使用默认或测试账号登录。
- [ ] `P0` 打开测试页面加载 SDK，执行 `window.dt.set({ pid, reportUrl, uuid, ucid, is_test: false })`。
- [ ] `P0` 触发一次 `window.dt.notify()`，确认 Nginx/Kafka 原始日志出现。
- [ ] `P0` 执行 `SaveLog:*`，确认本地 JSON 日志出现标准化记录。
- [ ] `P0` 执行 `Parse:Monitor <start> <end>`，确认 monitor 表新增记录。
- [ ] `P0` 执行 `Summary:Error <time> minute/hour/day`，确认错误汇总表新增或更新。
- [ ] `P0` 打开 Client 错误看板，能看到该错误。

### 8.2 行为与性能链路

- [ ] `P0` SDK 触发页面性能上报，执行 `Parse:Performance` 与 `Summary:Performance` 后 Client 页面性能可见。
- [ ] `P0` SDK 触发在线时长上报，执行 `Parse:TimeOnSiteByHour` 与 `Summary:TimeOnSite` 后在线时长页面可见。
- [ ] `P0` SDK 触发 `window.dt.behavior()`，执行 `Parse:MenuClick` 后菜单点击量页面可见。
- [ ] `P0` 带 `uuid` 上报多条日志，执行 `Parse:UV`、`Summary:UV`、`Summary:PV` 后 UV/PV 页面可见。
- [ ] `P1` 带新 `ucid` 上报后，执行 `Parse:UserFirstLoginAt`、`Summary:NewUser`，新增用户页面可见。
- [ ] `P1` 多 UA、多 IP 日志经过 `Parse:Device` 与系统汇总后，系统环境页面可见。

### 8.3 测试模式链路

- [ ] `P1` SDK 设置 `is_test: true` 后日志进入测试目录。
- [ ] `P1` 测试模式数据不进入正常解析汇总。
- [ ] `P1` `/api/log/content/test` 能展示测试模式日志，便于 SDK 联调。

### 8.4 权限链路

- [ ] `P0` A 用户有项目 1 权限时能访问 `/project/1/api/*`。
- [ ] `P0` A 用户无项目 2 权限时访问 `/project/2/api/*` 被拒绝。
- [ ] `P1` 删除 A 用户项目成员关系后，刷新页面和重新请求 API 均被拒绝。
- [ ] `P1` owner 页面只有 owner 角色可见或可操作。

### 8.5 报警链路

- [ ] `P0` 创建启用状态的报警规则，错误类型与错误名匹配。
- [ ] `P0` 制造超过阈值的错误汇总，执行 `WatchDog:Alarm`。
- [ ] `P0` 确认报警发送、报警日志落库、Client 报警日志页面可见。
- [ ] `P1` 冷却期内重复执行不会重复报警。

---

## 九、异常、边界与兼容性

### 9.1 数据异常

- [ ] `P0` 打点 JSON 非法时 SaveLog 跳过该行并记录日志。
- [ ] `P0` 缺少 `pid`、`type`、`code`、`detail`、`common` 的日志不会写入脏数据。
- [ ] `P1` `timestamp`、日志时间、服务器时间不一致时按规则处理。
- [ ] `P1` 超长 URL、超长错误名、超大 stack 不导致数据库写入失败或页面崩溃。
- [ ] `P1` 地理位置为空、未知省份、海外 IP 展示合理。
- [ ] `P1` 同一分钟大量日志不会导致内存暴涨或文件句柄耗尽。

### 9.2 时间边界

- [ ] `P0` 跨分钟解析包含开始分钟和结束分钟。
- [ ] `P0` 跨小时 Summary 不漏掉边界秒。
- [ ] `P0` 跨日、跨月读取正确分表。
- [ ] `P1` 闰年 2 月、月末 23:59、年末 12 月 31 日边界正确。
- [ ] `P1` 前端传毫秒、后端用秒的接口转换正确。

### 9.3 兼容性

- [ ] `P1` 旧 SDK 字段 `pub` 仍能被 SaveLog 转成 `common`。
- [ ] `P1` 旧配置字段 `test`、`jserror`、`performance`、`online` 仍按兼容逻辑工作。
- [ ] `P1` Chromium UA 特殊版本 `chromium_ver` 被修正为兼容版本。
- [ ] `P2` IE 不在主要支持范围内时，应明确产品预期。

### 9.4 安全与隐私

- [ ] `P0` 登录失败不泄露用户是否存在、密码哈希或内部堆栈。
- [ ] `P0` 未登录或无权限接口不会返回业务数据。
- [ ] `P1` 错误 extra、stack、URL 参数中如含敏感信息，展示与存储策略经过评估。
- [ ] `P1` API 500 不直接暴露生产敏感路径或密钥。
- [ ] `P1` 生产配置不提交个人机器路径、账号密码或密钥。
- [ ] `P2` 固定 salt、宽松 CORS、长期 cookie 等历史实现如涉及安全改动，需要专项评审。

---

## 十、性能与稳定性

- [ ] `P0` 高频打点下 Nginx/Kafka 日志持续写入，不丢分钟文件。
- [ ] `P0` `SaveLog:*` 单分钟大文件可在下一轮任务前处理完成。
- [ ] `P1` `Parse:*` 批量入库耗时、内存、失败重试或跳过策略可接受。
- [ ] `P1` `Summary:*` 大时间范围查询使用合理索引，不拖垮 MySQL。
- [ ] `P1` Client 图表在大数据量下渲染可接受，不明显卡死。
- [ ] `P1` Redis 不可用时缓存相关接口或任务的失败方式可定位。
- [ ] `P1` MySQL 短暂不可用时命令失败有日志，不产生半写入不可恢复状态。
- [ ] `P2` PM2 或守护进程重启后任务不会重复调度。

---

## 十一、按改动类型的回归矩阵

### 11.1 SDK 字段、code 或上报逻辑改动

- [ ] `P0` 跑 `sdk npm run build`。
- [ ] `P0` 验证 `rule.js`、SDK 上报 JSON、SaveLog 解析、Parse 入库字段一致。
- [ ] `P0` 验证测试模式与正常模式均可用。
- [ ] `P1` 跑完整端到端链路，确认 Client 对应页面可见。
- [ ] `P1` 如新增 code，同步补充 Parse 命令、数据库字段或表结构、API、Client 展示。

### 11.2 Server API 或 Model 改动

- [ ] `P0` 跑 `server npm run build`。
- [ ] `P0` 验证登录、权限、响应结构和目标接口。
- [ ] `P1` 覆盖空数据、非法参数、跨月、分页、大数据量。
- [ ] `P1` 如改 SQL 或分表逻辑，执行 `Utils:GenerateSQL` 并验证旧表兼容。

### 11.3 Parse、Summary、Task 命令改动

- [ ] `P0` 跑 `server npm run build`。
- [ ] `P0` 使用固定样例日志执行目标命令，检查入库行数。
- [ ] `P1` 执行重复命令、空日志、坏日志、跨月日志。
- [ ] `P1` 验证 `Task:Manager` 调度参数与手工执行参数一致。
- [ ] `P1` 验证报警或缓存依赖不会被破坏。

### 11.4 Client 页面或接口封装改动

- [ ] `P0` 跑 `client npm run lint`。
- [ ] `P0` 目标页面完成登录态手工回归。
- [ ] `P1` 补充或更新单测/e2e，覆盖接口成功、失败、空数据。
- [ ] `P1` 验证路由、菜单、项目切换、移动端视图。
- [ ] `P1` 执行 `client npm run build`，确认构建产物正常。

### 11.5 配置、部署或文档改动

- [ ] `P0` 校验配置项名称、默认值、示例路径与源码一致。
- [ ] `P1` 至少在一套测试环境按文档重放启动流程。
- [ ] `P1` 不提交真实账号、密码、token、生产域名敏感配置。
- [ ] `P2` 更新相关 `doc/` 文档与 README 中容易误导的旧命令。

---

## 十二、发布前验收记录模板

```markdown
## fee-pro 测试验收记录

- 测试日期：
- 分支/提交：
- 测试环境：
- 涉及模块：SDK / Server / Client / 文档 / 配置
- 数据库范围：
- 日志链路：Nginx / Kafka / 两者
- 执行命令：
  - server:
  - client:
  - sdk:
- 通过的 P0 项：
- 未覆盖项及原因：
- 已知风险：
- 截图或接口证据：
- 验收结论：通过 / 有条件通过 / 不通过
```

---

## 十三、最小发布门禁

以下项目建议作为每次发布前的最低门槛：

- [ ] `P0` 工作区无意外无关改动。
- [ ] `P0` Server 源码改动已执行 `npm run build`。
- [ ] `P0` Client 源码改动已执行 `npm run lint` 和目标页面手工回归。
- [ ] `P0` SDK 源码改动已执行 `npm run build` 和浏览器打点验证。
- [ ] `P0` 登录、权限、目标业务 API、目标页面全部通过。
- [ ] `P0` 至少一条 SDK 打点能完成从日志到后台展示的闭环。
- [ ] `P0` 无新增账号密码、机器路径、生产密钥等敏感信息。
- [ ] `P1` 对无法执行的测试命令、依赖缺失、环境限制有明确记录。
