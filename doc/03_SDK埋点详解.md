# SDK 埋点详解

> 路径：`sdk/src/index.js`

---

## 一、SDK 核心设计

SDK 以 **1px 图片 GET 请求** 方式发送打点数据，具体方式：

```js
const img = new window.Image()
img.src = `${feeTarget}?d=${encodeURIComponent(JSON.stringify(logInfo))}`
```

- `feeTarget`：打点服务器地址，默认 `http://test.com/dig`（需要业务方修改为实际 Nginx 地址）
- 数据通过 URL Query 参数 `d` 传递，JSON 格式后 URL 编码

**优点：** 跨域无限制，兼容性好，不阻塞主线程。

---

## 二、打点数据结构（logInfo）

```json
{
  "type": "error | product | perf | info",
  "code": 7,
  "detail": {
    "error_no": "页面报错_JS_RUNTIME_ERROR",
    "url": "example.com/index.html",
    "http_code": 0,
    "during_ms": 0,
    "request_size_b": 0,
    "response_size_b": 0
  },
  "extra": {
    "desc": "Uncaught TypeError: ...",
    "stack": "at xxx:1:1"
  },
  "common": {
    "pid": "hello_fe",
    "uuid": "设备唯一ID",
    "ucid": "用户唯一ID",
    "is_test": false,
    "version": "1.0.0",
    "timestamp": 1555574400507,
    "runtime_version": "1.0.0",
    "sdk_version": "1.1.2",
    "page_type": "example.com/index.html",
    "record": { ... }
  }
}
```

---

## 三、type 与 code 规范

| type | code 范围 | 说明 |
|------|----------|------|
| `error` | 1 ~ 9999 | 错误类型 |
| `product` | 10000 ~ 19999 | 产品指标（UV、停留时长、用户行为） |
| `info` | 20000 ~ 29999 | 信息类型（暂未使用） |
| `perf` | 20001 | 性能指标 |

### 错误类型（type=error）

| code | JS_TRACKER 类型 | 展示名称 |
|------|---------------|---------|
| 7 | `ERROR_RUNTIME`(1) | JS_RUNTIME_ERROR |
| 7 | `ERROR_SCRIPT`(2) | SCRIPT_LOAD_ERROR |
| 7 | `ERROR_STYLE`(3) | CSS_LOAD_ERROR |
| 7 | `ERROR_IMAGE`(4) | IMAGE_LOAD_ERROR |
| 7 | `ERROR_AUDIO`(5) | AUDIO_LOAD_ERROR |
| 7 | `ERROR_VIDEO`(6) | VIDEO_LOAD_ERROR |
| 7 | `ERROR_CONSOLE`(7) | CONSOLE_ERROR |
| 8 | `ERROR_TRY_CATCH`(8) | TRY_CATCH_ERROR / 主动 notify |

### 产品指标（type=product）

| code | 说明 |
|------|------|
| 10001 | 用户在线停留时长（`duration_ms`） |
| 10002 | 用户行为埋点（菜单点击，`code + name + url`） |

---

## 四、初始化配置（log.set）

```js
window.dt.set({
  pid: 'your_project_id',    // [必填] 项目 ID，与后台 t_o_project.project_name 对应
  uuid: 'device_uuid',       // [建议填] 设备唯一 ID，用于 UV 统计
  ucid: 'user_ucid',         // [建议填] 用户 ID，用于新增用户统计
  is_test: false,             // 测试模式：true 时打点数据不录入系统

  version: '1.0.0',           // 业务方 JS 版本号

  record: {
    time_on_page: true,        // 开启在线时长监控
    performance: true,         // 开启性能监控
    js_error: true,            // 开启 JS 错误监控
    js_error_report_config: {
      ERROR_RUNTIME: true,
      ERROR_SCRIPT: true,
      ERROR_STYLE: true,
      ERROR_IMAGE: true,
      ERROR_AUDIO: true,
      ERROR_VIDEO: true,
      ERROR_CONSOLE: true,
      ERROR_TRY_CATCH: true,
      // 自定义过滤函数
      checkErrrorNeedReport: (desc, stack) => true
    }
  },

  // 页面类型解析函数（用于聚合同类页面的错误）
  getPageType: (location) => `${location.host}${location.pathname}`
})
```

---

## 五、自动上报机制

### 5.1 JS 错误自动上报

通过内嵌 `js-tracker`（`sdk/src/js-tracker/`）模块，自动监听：
- `window.onerror`（JS 运行时错误）
- 资源加载失败（`error` 事件 on `<script>/<link>/<img>/<audio>/<video>`）
- `console.error`（可选）
- Vue `errorHandler`（可选）

触发后调用 SDK 注册的 `report` 回调，回调内调用 `log('error', 7, {...})`。

### 5.2 性能数据自动上报

`window.onload` 触发后采集 `performance.timing.toJSON()`，调用：
```js
log('perf', 20001, { ...times, url: 'host+pathname' })
```

### 5.3 在线时长自动上报

- 监听 `window.click` 事件
- 每次 click 检查距离上次 click 的时间差：
  - `> 15分钟`：视为离线，重置计时器
  - `> 5秒` 且 `< 15分钟`：调用 `log.product(10001, { duration_ms: duration })`

---

## 六、主动上报 API

### notify（主动上报 JS 错误）

```js
window.dt.notify(
  '接口请求失败_getUserInfo',   // errorName（最多200字）
  'example.com/index.html',      // url（最多200字）
  {
    http_code: 500,              // HTTP 状态码
    during_ms: 1200,             // 请求耗时（毫秒）
    request_size_b: 256,         // 请求体大小（字节）
    response_size_b: 1024,       // 响应体大小（字节）
    trace_url: 'http://...',     // trace 系统链接（自定义展示字段）
    // 其他字段放入 extra 展示
  }
)
```

实际调用：`log('error', 8, detail, extra)`（code=8 对应 `ERROR_TRY_CATCH`）

### behavior（用户行为埋点）

```js
window.dt.behavior('menu_click_home', '首页', 'example.com/home')
// 实际调用：log.product(10002, { code, name, url })
```

---

## 七、rule.js 字段映射

`sdk/src/rule.js` 定义了 code 对应的必填字段（`df`）和字段名映射（`dft`）：
- 传入的 `detail` 字段名会根据 `dft` 规则自动重命名，映射到标准字段名（如 `error_no`, `http_code` 等）
- 保证即使业务方使用不同字段名，服务端收到的数据格式一致

---

## 八、测试模式

```js
dt.set({ is_test: true })
```

- 打点请求中 `common.test` 字段设为固定 hash 值 `'b47ca710747e96f1c523ebab8022c19e9abaa56b'`
- `SaveLog:Nginx` 检测到测试日志后写入 `LOG_TYPE_TEST` 目录，不参与正常数据统计
- 测试模式开启时 `is_test: true`，`debugLogger` 会在控制台打印调试信息
