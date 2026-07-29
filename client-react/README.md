# fee-pro React 客户端

`client-react` 是灯塔前端监控平台的新客户端，使用 React、Ant Design、TypeScript、Vite 和 ECharts 重构。它与旧 `client` 并存，不会覆盖旧客户端构建产物，也不修改 `server`、`sdk` 或 `example`。

## 开发

要求 Node.js 22.16 或更高版本。

```bash
npm install
npm run dev
```

开发地址为 `http://localhost:8081`。默认把 `/api/*` 与 `/project/:id/api/*` 代理到 `http://localhost:3000`；`/project/:id/*` 页面地址仍由 React Router 处理。可复制 `.env.example` 并通过 `VITE_PROXY_TARGET` 修改后端地址。

## 验证与构建

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

生产产物只输出到 `client-react/dist`，不会自动复制到 `server/public`。

## 兼容约定

- 保持旧客户端的正式路由、菜单分组、账号操作和项目切换流程。
- 请求沿用服务端现有字段与路径；默认携带 Cookie，并兼容 `fee_token` 请求头。
- 错误看板接口使用秒；性能、在线时长、新增用户、UV/PV 使用毫秒；报警日志列表使用毫秒、趋势使用秒。
- `admin` 可访问项目和成员管理，`owner` 可访问成员管理，`dev` 只访问业务页面。页面路由与菜单同时执行权限判断。
- 页签按项目保存到浏览器本地存储；切换项目会回到该项目首页。

## 地图资源

中国地图 GeoJSON 位于 `public/map/china.json`，来自项目旧客户端依赖中的 Apache ECharts 地图数据，仅在地图图表首次展示时加载。来源与许可说明见 `NOTICE.md`。
