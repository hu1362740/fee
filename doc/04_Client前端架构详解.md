# Client 前端（管理后台）架构详解

> 路径：`client/src/`

---

## 一、目录结构

```
client/src/
├── main.js             应用入口
├── App.vue             根组件
├── router/
│   ├── index.js        路由守卫（登录检测、移动端检测）
│   └── routers.js      路由配置表
├── store/              Vuex 状态管理
├── api/                后端接口调用封装
│   ├── alarm/          报警相关接口
│   ├── behavior/       用户行为接口
│   ├── error/          错误看板接口
│   ├── performance/    性能数据接口
│   ├── project/        项目管理接口
│   └── user.js         用户接口
├── view/               页面视图组件
│   ├── login/          登录页
│   ├── main/           主框架布局
│   ├── error-dashboard/  错误看板
│   ├── performance/    性能监控
│   ├── online-time/    用户在线时长
│   ├── new-users/      新增用户
│   ├── alarm-config/   报警配置
│   ├── alarm-log/      报警日志
│   ├── menu-count/     菜单点击量
│   ├── system/         系统分布（OS/浏览器/设备）
│   ├── single-page/    单页性能
│   └── management/     项目/成员管理
├── components/         全局通用组件
├── assets/             静态资源（图片、图标）
├── config/             前端配置
├── constants/          前端常量
├── directive/          Vue 自定义指令
├── libs/               工具库
│   └── util.js         getToken/canTurnTo 等
└── locale/             i18n 国际化文件
```

---

## 二、路由守卫逻辑（router/index.js）

```
beforeEach:
  ├── 未登录 + 非 login 页 → 跳转 login
  ├── 未登录 + login 页 → 放行
  └── 已登录
        ├── 移动端 → 强制跳转 mobileView
        ├── 访问 login 页 → 跳转 home（projectId=1）
        └── 其他 → canTurnTo() 权限检查
              ├── 有权限 → 放行
              └── 无权限 → error_401

afterEach: LoadingBar.finish() + scrollTo(0,0)
```

**Token 获取：** `libs/util.js` 的 `getToken()` 从 Cookie 读取 `fee_token`。

---

## 三、主要页面功能

| 路由/页面目录 | 功能 |
|-------------|------|
| `login/` | 账号密码登录，调用 `/api/login` |
| `main/` | 主框架（左侧菜单、顶部导航、内容区域） |
| `error-dashboard/` | 错误看板：JS 错误列表、错误详情、错误趋势图 |
| `performance/` | 页面加载性能指标（DNS/TCP/白屏/首屏/完全加载时长） |
| `online-time/` | 用户在线时长分布图 |
| `new-users/` | 新增用户增长曲线 |
| `alarm-config/` | 报警规则配置（阈值、接收人） |
| `alarm-log/` | 历史报警记录 |
| `menu-count/` | 菜单点击量统计 |
| `system/` | 操作系统/浏览器/设备分布饼图 |
| `single-page/` | 单页面性能详情 |
| `management/` | 项目管理 + 成员管理 |
| `mobile-view/` | 移动端简化视图 |

---

## 四、技术依赖

| 依赖 | 说明 |
|------|------|
| Vue 2 | 前端框架 |
| vue-router | history 模式路由 |
| Vuex | 状态管理 |
| iView 3 | UI 组件库（表格/表单/按钮/布局） |
| Viser-vue | 基于 AntV G2 的图表库（折线图/柱状图/饼图） |
| vue-i18n | 国际化（中文/英文） |
| axios | HTTP 请求 |
| js-cookie | Cookie 读写 |
| md5 | MD5 加密 |
| uuid | 设备唯一 ID 生成 |

---

## 五、设备 UUID 机制（main.js）

```js
// 优先从 localStorage 读取，不存在则生成并存储
if (storage.getItem('uuid')) {
  onlyUuid = storage.getItem('uuid')
} else {
  const uuidRandom = uuid()
  onlyUuid = md5(md5(uuidRandom) + uuid())  // 双重 md5 混淆
  storage.setItem('uuid', onlyUuid)
}
// localStorage 不可用时降级为 Cookie ucid
```

---

## 六、API 层

- 所有接口封装在 `api/` 目录下各子模块
- 统一使用 axios，基础 URL 由 `config/` 配置
- API 响应格式标准：
  ```json
  {
    "code": 0,
    "action": "success | alert | redirect | login | forbitan",
    "data": {},
    "msg": "",
    "url": ""
  }
  ```
- 前端根据 `action` 类型决定处理方式：
  - `success` → 正常处理 data
  - `alert` → 弹出错误提示框（msg）
  - `redirect` → 跳转 url
  - `login` → 提示登录 + 跳转登录页
  - `forbitan` → 提示无权限

---

## 七、构建配置（vue.config.js）

- 开发服务器代理：将 `/api` 请求代理到 `http://localhost:3000`（server 端口）
- 生产构建输出到 `server/public/`（前后端一体部署，Express 静态服务该目录）
