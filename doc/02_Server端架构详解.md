# Server 端架构详解

> 路径：`server/src/`

---

## 一、目录结构

```
server/src/
├── app.js              Express 入口（Web 服务）
├── fee.js              命令入口（CLI 任务调度）
├── commands/           所有 CLI 命令
│   ├── base.js         命令基类（所有命令继承此类）
│   ├── parse/          日志解析命令
│   ├── summary/        数据汇总命令
│   ├── save_log/       日志落地命令
│   ├── watch_dog/      监控狗命令
│   ├── create_cache/   缓存更新命令
│   ├── task/           任务调度主进程
│   └── utils/          工具命令
├── configs/            配置文件
├── constants/          常量定义
├── library/            外部库封装
│   ├── auth/           Token 生成/解析
│   ├── kafka/          日志文件路径工具（非真实 Kafka Consumer）
│   ├── logger/         log4js 封装
│   ├── mysql/          Knex 数据库连接
│   ├── redis/          ioredis 封装
│   ├── http/           axios 封装
│   └── utils/modules/
│       ├── alert.js    报警通知
│       ├── router_config_builder.js  路由构建工具
│       └── util.js     通用工具（sleep/urlParse/ip2Locate/handleEmptyData）
├── middlewares/
│   └── privilege.js    权限中间件
├── model/              数据库操作层
│   ├── parse/          解析类表操作
│   ├── project/        项目/用户/报警相关表操作
│   └── summary/        汇总类表操作
└── routes/
    ├── index.js         路由注册（含权限分组）
    └── api/             所有 API 路由定义
```

---

## 二、Express 应用启动（app.js）

**启动流程：**
1. 设置 EJS 模板引擎（`public/index.html` 作为 SPA 入口）
2. 注册中间件：`body-parser`、`cookie-parser`、`cors`（全域名允许+credentials）
3. 注册全局中间件：`PrivilegeChecker.appendUserInfo` + `appendProjectInfo`（将用户信息和项目 ID 挂载到 `req.fee`）
4. 静态资源：`public/` 目录
5. API 路由：仅处理 `/api/*` 和 `/project/:id/api/*` 路径
6. SPA fallback：所有其他路径返回 `index.html`（支持前端 history 模式）

**容错机制：**
```js
process.on('uncaughtException', (err) => {
  // 发送报警 → 重新 startup()
})
```

---

## 三、路由系统（routes/）

### 路由分组

| 分组 | 说明 | 中间件 |
|------|------|--------|
| `withoutLoginRouter` | 不需要登录 | 无 |
| `loginCommonRouter` | 需要登录，不需要项目权限 | `checkLogin` |
| `loginProjectRouter` | 需要登录 + 项目权限 | `checkLogin` + `checkPrivilege` |

### RouterConfigBuilder 用法

`library/utils/modules/router_config_builder.js` 封装了路由声明，每个路由文件导出一个对象（key 是路径，value 是配置）：

```js
RouterConfigBuilder.routerConfigBuilder(
  '/api/xxx',           // URL
  METHOD_TYPE_GET,      // HTTP 方法
  async (req, res) => { ... },  // 处理函数
  needProjectPriv,      // 是否需要项目权限（bool）
  needLogin             // 是否需要登录（bool）
)
```

### 已注册 API 模块

| 模块 | 路径前缀 | 说明 |
|------|---------|------|
| Login | `/api/login` | 登录/登出 |
| User | `/api/user` | 用户管理 |
| Project | `/api/project` | 项目 CRUD |
| Alarm | `/api/alarm` | 报警配置/日志 |
| Behavior | `/api/behavior` | 用户行为数据 |
| ErrorReport | `/api/error` | 错误看板 |
| Performance | `/api/performance` | 性能数据 |
| UV | `/api/uv` | UV 统计 |
| OS/Browser/RuntimeVersion | `/api/os` 等 | 系统分布 |
| Log | `/api/log` | 原始日志查询 |

---

## 四、权限与认证（library/auth + middlewares/privilege）

### Token 机制

- Token 存储：Cookie `fee_token`（有效期 100 天）
- Token 结构（Base64 编码）：
  ```json
  {
    "user": "{\"ucid\":\"...\",\"nickname\":\"...\",\"account\":\"...\",\"loginAt\":1234567890}",
    "checksum": "md5(md5(user+salt)+salt)"
  }
  ```
- MD5_SALT 固定值：`'1111111111111111111111111111'`（**注意：生产环境应修改**）

### 登录方式

由 `configs/common.js` 的 `loginType` 字段控制：

| loginType | 说明 |
|-----------|------|
| `normal` | 普通账号密码登录，密码三重 MD5 哈希存储 |
| `uc` | 企业内部 UC 统一认证登录（对接 LDAP/UC 系统） |

### 权限检查中间件

```js
appendUserInfo(req)    // 解析 cookie 中的 fee_token → req.fee.user
appendProjectInfo(req) // 从 URL 路径提取 projectId → req.fee.project.projectId
checkLogin(req)        // ucid === 0 则拒绝
checkPrivilege(req)    // 查 t_o_project_member 表，检查 ucid 是否有该 project 权限
```

---

## 五、命令系统（commands/）

### 基类继承关系

```
@adonisjs/ace Command
    └── Base (commands/base.js)
            └── ParseBase (commands/parse/base.js)
                    ├── ParseMonitor
                    ├── ParseUV
                    ├── ParsePerformance
                    ├── ParseDevice
                    ├── ParseMenuClick
                    ├── ParseTimeOnSite
                    └── ParseUserFirstLoginAt
            └── SaveLogBase (commands/save_log/base.js)
                    ├── NginxParseLog (SaveLog:Nginx)
                    └── KafkaParseLog (SaveLog:Kafka)
            └── SummaryBase
                    ├── SummaryUV
                    ├── SummaryError
                    ├── SummaryPerformance
                    └── ...
```

### Base 类关键方法

- `handle(args, options)` — 框架调用入口，包裹 `execute()` + 捕获异常 + 发报警
- `execute(args, options)` — 子类实现具体逻辑
- `log(...args)` — 打印带时间戳和类名的日志到控制台 + 文件
- `warn(...args)` — 同上，用 console.warn + logger.warn

### ParseBase 解析流程

```
execute(startAtYmdHi, endAtYmdHi)
  → isArgumentsLegal()  // 校验时间参数格式
  → parseLog(startAt, endAt)
      // 按分钟遍历时间范围
      // 读取 server/log/kafka/json/{month_YYYYMM}/day_DD/HH/mm.log
      // 逐行 JSON.parse → isLegalRecord() → processRecordAndCacheInProjectMap()
      // 数据缓存在 this.projectMap: Map<projectId, Map<timeKey, dataList>>
  → save2DB()
      // 遍历 projectMap → 去重 → 写入 MySQL
```

**子类必须实现的4个方法：**
- `isLegalRecord(record)` — 判断记录是否合法
- `processRecordAndCacheInProjectMap(record)` — 处理并缓存到 projectMap
- `save2DB()` — 批量写库，返回统计对象
- `getRecordCountInProjectMap()` — 统计内存缓存总记录数

---

## 六、任务调度（Task:Manager）

文件：`commands/task/manage.js`

### 调度周期

| 周期 | cron 表达式 | 执行任务 |
|------|------------|---------|
| 每1分钟 | `0 */1 * * * *` | SaveLog:Nginx/Kafka, WatchDog:Alarm, Parse:Monitor（延迟2分钟）, Summary:Error（前2/3/4/5/10分钟） |
| 每10分钟 | `15 */10 * * * *` | CreateCache:UpdatePerOneMinute, Parse:UV/TimeOnSite/Performance/Monitor, Summary:UV/NewUser/Performance/Error |
| 每1小时 | `30 15 * * * *` | Parse:Device/MenuClick/UserFirstLoginAt, Summary:UV/NewUser/Performance/Error/TimeOnSite（当日） |
| 每6小时 | `45 35 */6 * * *` | Summary:* 昨日数据 + 当月/上月月度汇总, Summary:SystemBrowser/Device/OS, Utils:CleanOldLog |

### 防重机制

启动时先 kill 其他 `Task:Manager` 进程，30 秒后开始注册 cron，避免与旧进程冲突。

### 命令分发

```js
execCommand(commandName, args)
// 实际执行：NODE_ENV=xxx node dist/fee.js CommandName 'arg1' 'arg2'
// 通过 shelljs.exec async:true 异步执行子进程
```

---

## 七、数据库层（model/）

### 分表策略

在 `model/parse/common.js` 中定义：

| 策略 | 表名格式 | 适用场景 |
|------|---------|---------|
| `SPLIT_BY.PROJECT` | `t_xxx_${projectId}` | 按项目分表 |
| `SPLIT_BY.MONTH` | `t_xxx_${projectId}_${YYYYMM}` | 按项目+月份分表（错误、性能等高频数据） |
| `SPLIT_BY.NONE` | `t_xxx` | 不分表（项目、用户等配置类数据） |

### 核心 CRUD 方法（model/parse/common.js）

```js
insertInto(infos)       // 插入，自动填充 create_time/update_time
updateInto(params)      // 更新，自动填充 update_time
replaceInto(params)     // 先查 id，存在则 update，不存在则 insert（非原子操作）
getRecordList(infos)    // 查询列表
```

### 主要数据表

| 表名（前缀） | 说明 |
|------------|------|
| `t_o_user` | 用户表 |
| `t_o_project` | 项目表 |
| `t_o_project_member` | 项目成员/权限表 |
| `t_o_monitor_{pid}_{YYYYMM}` | 错误监控原始数据（按月分表） |
| `t_o_monitor_ext_{pid}_{YYYYMM}` | 错误监控扩展数据（extra_json） |
| `t_r_behavior_distribution_{pid}` | 用户行为分布（按项目分表） |
| `t_r_city_distribution_{pid}` | 城市分布（按项目分表） |
| `t_r_duration_distribution_{pid}` | 停留时长分布（按项目分表） |
| `t_r_uv_record_{pid}` | UV 记录（按项目分表） |
| `t_o_alarm_config` | 报警配置 |
| `t_o_alarm_log` | 报警日志 |

---

## 八、日志文件路径规范

本地 Kafka 模拟日志（`server/log/kafka/`）：

```
server/log/kafka/
├── raw/    原始 Nginx 日志（未处理）
│   └── month_YYYYMM/day_DD/HH/mm.log
├── json/   解析后的 JSON 日志（供 Parse:* 命令消费）
│   └── month_YYYYMM/day_DD/HH/mm.log
└── test/   测试数据日志
    └── month_YYYYMM/day_DD/HH/mm.log
```

`library/kafka/index.js` 提供 `getAbsoluteLogUriByType(timestamp, type)` 获取对应路径。
