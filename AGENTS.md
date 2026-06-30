# AGENTS.md

本文件适用于整个仓库。除非更深层目录另有 `AGENTS.md`，后续代理都应遵循这里的约定。

## 工作语言与协作方式

- 中文是工作语言；回复、说明、计划和总结都使用中文。
- 开始修改前先快速阅读相关源码与文档，优先参考 `doc/`、`README.md`、各模块 `package.json` 和现有实现。
- 开工前查看 `git status --short`。仓库可能已有用户未提交改动，不要回退、覆盖或格式化无关文件。
- 保持改动聚焦：只改与任务直接相关的源码、测试或文档，不做顺手重构。

## 项目速览

这是 `fee`（灯塔）前端监控系统，分为三块：

- `sdk/`：浏览器端埋点 SDK，核心入口 `sdk/src/index.js`，通过 1px Image GET 请求上报数据，全局暴露 `window.dt`。
- `server/`：Node.js / Express 后端与 CLI 任务系统，入口为 `server/src/app.js` 和 `server/src/fee.js`，使用 MySQL、Redis，支持 Nginx 日志或 Kafka 日志链路。
- `client/`：Vue 2 管理后台，使用 iView、Viser、Vue Router、Vuex，入口 `client/src/main.js`。

数据大致流向：浏览器 SDK 打点 -> Nginx/Kafka 日志 -> `server` 的 `SaveLog:*`、`Parse:*`、`Summary:*` 命令处理 -> MySQL -> `client` 通过 `/api/*` 展示。

## 关键目录

- `server/src/routes/api/`：后端 API 路由模块。
- `server/src/model/`：数据库访问层，包含分表逻辑。
- `server/src/commands/`：Ace CLI 命令，包含日志保存、解析、汇总、报警和任务调度。
- `server/src/configs/`：环境、MySQL、Redis、Kafka、报警、Nginx 日志路径等配置。
- `client/src/api/`：前端接口封装。
- `client/src/view/`：业务页面。
- `client/src/components/`：通用组件。
- `sdk/src/rule.js`：SDK 上报字段规则与字段名映射。
- `doc/`：项目架构、开发、部署、数据库和常见问题说明。

## 常用命令

命令默认在对应子目录执行。

### Server

```bash
cd server
npm install
npm run build
npm run watch
npm run dev
npm test
npm run fee Task:Manager
npm run fee Utils:TemplateSQL
```

注意：

- `server` 实际运行 `dist/`，改 `server/src/` 后必须先 `npm run build`，或保持 `npm run watch` 运行。
- Windows PowerShell 下，`NODE_ENV=development ...` 风格脚本可能不可用。可使用 `npm run dev_test`、`npm run fee_test`，或手动设置 `$env:NODE_ENV='development'` 后运行 `node dist/app.js` / `node dist/fee.js`。
- `npm test` 读取 `dist/test/*.js`，需要先编译。
- 项目文档提到 `npm run lint`，但当前 `server/package.json` 没有该脚本；如需检查风格，优先使用项目已安装的 Standard JS 工具。

### Client

```bash
cd client
npm install
npm run dev
npm run build
npm run lint
npm run test:unit
npm run test:e2e
```

注意：

- 开发服务默认端口 `8080`，并把 `/api` 代理到 `http://localhost:3000`。
- `client/script/build.js` 会清空并重建 `client/dist`。
- `client/vue.config.js` 运行时会写入 `client/config/env.js`，提交前注意检查该文件是否出现无关变化。

### SDK

```bash
cd sdk
npm install
npm run build
```

注意：优先修改 `sdk/src/`。`sdk/lib/` 是发布产物，若任务要求同步发布代码，应通过构建生成，不要只手改 `lib/`。

## 代码风格

- 使用现有 JavaScript 风格：Standard JS、2 空格缩进、无分号、单引号为主。
- 服务端源码使用 ES Module 语法和 Babel 编译；不要把业务改动直接写进 `server/dist/`。
- 服务端路径别名：`~/src` 指向 `server/src`。
- 前端路径别名：`@` / `src` 指向 `client/src`，`_c` 指向 `client/src/components`，`_conf` 指向 `client/config`。
- 保持中文注释简洁，只在复杂业务、分表、任务调度或兼容逻辑处补充必要说明。
- 不要批量格式化旧文件；旧代码中存在历史拼写和兼容写法，除非任务要求，不要为了“修干净”改动行为。

## Server 开发约定

- 新增 API 路由时，使用 `server/src/library/utils/modules/router_config_builder.js` 的 `routerConfigBuilder()`，并在 `server/src/routes/api/index.js` 中汇总注册。
- API 返回结构使用 `server/src/constants/api_res.js`。其中 `forbitan` 是已有兼容字符串，不要擅自改成 `forbidden`。
- 新增 CLI 命令时继承现有命令基类，并在 `server/src/fee.js` 的 `registedCommandList` 注册。
- `ParseBase` 子类必须实现 `isLegalRecord`、`processRecordAndCacheInProjectMap`、`save2DB`、`getRecordCountInProjectMap`。
- 数据库读写优先沿用 `server/src/model/` 中已有模型和 `model/parse/common.js` 的分表工具，不要在路由里散落原始 SQL。
- 涉及任务调度时检查 `server/src/commands/task/manage.js`，注意其防重逻辑依赖 Linux `ps` 命令，在 Windows 上不完整。

## Client 开发约定

- 新接口放到 `client/src/api/` 对应模块，经 `client/src/libs/api.request.js` / `client/src/libs/axios.js` 统一请求。
- 页面改动优先复用 `client/src/components/`、iView 组件和已有图表组件，不引入新的 UI 体系。
- 路由与权限逻辑集中在 `client/src/router/` 和 `client/src/libs/util.js`，新增页面时同步维护路由、菜单和权限判断。
- 多语言文案在 `client/src/locale/` 下维护；不要把可复用业务文案散落在多个组件中。

## SDK 开发约定

- 保持 `window.dt`、`log.set`、`log.notify`、`log.behavior` 等外部 API 兼容。
- 新增上报字段或 code 时同步维护 `sdk/src/rule.js`，并确认服务端解析与数据库字段能接住。
- 测试模式依赖固定 `TEST_FLAG`，会让日志进入测试目录，不参与正常统计；不要误删该兼容逻辑。

## 配置、数据与生成物

- MySQL、Redis、Kafka、报警、UC、Nginx 日志路径都在 `server/src/configs/`。不要把个人机器路径、账号密码或生产密钥作为通用默认值提交。
- 默认数据库名是 `platform`；建表 SQL 通过 `Utils:GenerateSQL` 生成，执行时需跳过命令输出的前两行。
- `.gitignore` 已忽略 `server/dist`、`client/dist`、`server/log`、`server/public`、`node_modules`、`init.sql`、`package-lock.json` 等产物；通常不要手动编辑或提交这些文件。
- `server/src/library/auth/index.js` 和 `server/src/model/project/user.js` 有历史硬编码 salt，安全相关任务应优先评估这些位置。

## 验证要求

- 文档-only 改动可不跑测试，但要检查 Markdown 内容和路径准确。
- 服务端源码改动至少运行 `npm run build`；涉及命令、解析、汇总或 API 时，尽量运行对应 `npm test` 或具体 `npm run fee ...` 命令。
- 前端改动优先运行 `npm run lint` 和相关单测；涉及页面交互时启动 `npm run dev` 做浏览器验证。
- SDK 改动运行 `npm run build`，并确认 `src` 与需要同步的发布产物一致。
- 如果因为缺少 MySQL、Redis、Nginx、Kafka 或依赖未安装而无法验证，在最终回复中明确说明限制和未执行的命令。
