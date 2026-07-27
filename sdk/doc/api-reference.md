# Fee SDK API 参考文档

## 1. 核心 API

### 1.1 log(type, code, detail, extra)

通用日志上报函数，是所有上报方法的基础。

**参数说明：**
- `type`：日志类型，可选值为 'error'、'product'、'info'、'perf'
- `code`：日志代码，不同类型有不同的取值范围
  - error: 1-9999
  - product: 10000-19999
  - info: 20000-29999
- `detail`：消费数据，对象类型，包含核心数据字段
- `extra`：展示数据，对象类型，包含附加信息

**返回值：**
- 成功返回空字符串，失败返回错误信息

**示例：**
```javascript
dt('error', 7, {
  error_no: '页面报错_JS_RUNTIME_ERROR',
  url: 'example.com/page'
}, {
  desc: 'TypeError: Cannot read property \'length\' of undefined',
  stack: 'Error: ...'
})
```

### 1.2 log.set(config, isOverwrite)

设置 SDK 配置。

**参数说明：**
- `config`：配置对象
- `isOverwrite`：是否覆盖模式，默认为 false（合并模式）
- 覆盖模式会同时重置旧的传输配置，因此新的 `config` 仍需包含 `reportUrl`

**配置选项：**

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| pid | String | '' | [必填]项目id, 由灯塔项目组统一分配 |
| reportUrl | String | '' | [必填]打点服务器或 Nginx `/dig` 地址；仅用于传输，不写入 `common` |
| uuid | String | '' | [可选]设备唯一id, 用于计算uv数&设备分布 |
| ucid | String | '' | [可选]用户ucid, 用于发生异常时追踪用户信息 |
| is_test | Boolean | false | 是否为测试数据 |
| record.time_on_page | Boolean | true | 是否监控用户在线时长数据 |
| record.performance | Boolean | true | 是否监控页面载入性能 |
| record.js_error | Boolean | true | 是否监控页面报错信息 |
| record.js_error_report_config | Object | 见下方 | 配置需要监控的页面报错类别 |
| version | String | '1.0.0' | 业务方的js版本号 |
| getPageType | Function | 见下方 | 页面类型解析函数 |

**record.js_error_report_config 默认值：**
```javascript
{
  ERROR_RUNTIME: true, // js运行时报错
  ERROR_SCRIPT: true, // js资源加载失败
  ERROR_STYLE: true, // css资源加载失败
  ERROR_IMAGE: true, // 图片资源加载失败
  ERROR_AUDIO: true, // 音频资源加载失败
  ERROR_VIDEO: true, // 视频资源加载失败
  ERROR_CONSOLE: true, // vue运行时报错
  ERROR_TRY_CATCH: true, // 未catch错误
  checkErrrorNeedReport: (desc = '', stack = '') => { return true }
}
```

**getPageType 默认值：**
```javascript
(location = window.location) => { return `${location.host}${location.pathname}` }
```

**示例：**
```javascript
dt.set({
  pid: 'your-project-id',
  reportUrl: 'https://fee.example.com/dig',
  uuid: 'user-device-id',
  ucid: 'user-id',
  record: {
    time_on_page: true,
    performance: true,
    js_error: true
  }
})
```

### 1.3 log.notify(errorName, url, extraInfo)

自定义错误上报接口。

**参数说明：**
- `errorName`：错误类型，推荐格式 => "错误类型(中文)_${具体错误名}"，最长200字
- `url`：错误对应的url, location.host + location.pathname，不包括get参数，最长200个字
- `extraInfo`：附属信息，对象类型
  - `trace_url`：[String]请求对应的trace系统查看地址
  - `http_code`：[Number]接口响应的Http状态码
  - `during_ms`：[Number]接口响应时长(毫秒)
  - `request_size_b`：[Number]post参数体积, 单位b
  - `response_size_b`：[Number]响应值体积, 单位b
  - 其他字段会作为补充信息进行展示

**返回值：**
- 成功返回空字符串，失败返回错误信息

**示例：**
```javascript
dt.notify('接口错误_API请求失败', 'example.com/api', {
  http_code: 500,
  during_ms: 2000,
  request_size_b: 1024,
  response_size_b: 2048,
  api: '/api/user/list',
  params: { id: 123 }
})
```

### 1.4 log.behavior(code, name, url)

用户行为监控接口。

**参数说明：**
- `code`：[必填]用户行为标识符, 用于唯一判定用户行为类型, 最多50字符( menu/click/button_1/button_2/etc)
- `name`：[必填]用户行为名称, 和code对应, 用于展示, 最多50字符
- `url`：[可选]用户点击页面url, 可以作为辅助信息, 最多200字符

**示例：**
```javascript
dt.behavior('login_click', '登录按钮点击', window.location.href)
dt.behavior('menu_home', '首页菜单', window.location.href)
```

### 1.5 log.error(code, detail, extra)

错误日志上报，是 log('error', code, detail, extra) 的简写。

**参数说明：**
- `code`：错误代码，1-9999
- `detail`：错误详情，对象类型
- `extra`：附加信息，对象类型

**示例：**
```javascript
dt.error(1, {
  url: 'example.com/api',
  http_code: 404,
  during_ms: 500,
  size: 1024
}, {
  params: { id: 123 },
  response: 'Not Found'
})
```

### 1.6 log.product(code, detail, extra)

产品指标上报，是 log('product', code, detail, extra) 的简写。

**参数说明：**
- `code`：产品指标代码，10000-19999
- `detail`：指标详情，对象类型
- `extra`：附加信息，对象类型

**示例：**
```javascript
// 上报用户在线时长
dt.product(10001, { duration_ms: 5000 })

// 上报用户行为
dt.product(10002, {
  code: 'button_click',
  name: '按钮点击',
  url: window.location.href
})
```

### 1.7 log.info(code, detail, extra)

信息日志上报，是 log('info', code, detail, extra) 的简写。

**参数说明：**
- `code`：信息代码，20000-29999
- `detail`：信息详情，对象类型
- `extra`：附加信息，对象类型

**示例：**
```javascript
dt.info(20001, {
  message: '用户登录',
  user_id: '123456'
})
```

## 2. 错误跟踪 API

### 2.1 tryJS.wrap(func)

将函数使用 try..catch 包装，捕获执行过程中的错误。

**参数说明：**
- `func`：需要包装的函数

**返回值：**
- 包装后的函数

**示例：**
```javascript
import { tryJS } from 'fee-sdk/js-tracker'

const safeFunction = tryJS.wrap(function() {
  // 可能会抛出错误的代码
  if (Math.random() > 0.5) {
    throw new Error('随机错误')
  }
  return '成功'
})

safeFunction() // 执行时会捕获错误并上报
```

### 2.2 tryJS.wrapArgs(func)

只对函数参数进行包装。

**参数说明：**
- `func`：需要包装的函数

**返回值：**
- 包装后的函数

**示例：**
```javascript
import { tryJS } from 'fee-sdk/js-tracker'

const safeFunction = tryJS.wrapArgs(function(callback) {
  // 执行回调函数，会捕获回调中的错误
  callback()
})

safeFunction(function() {
  throw new Error('回调错误')
}) // 执行时会捕获错误并上报
```

## 3. 内部 API

### 3.1 validLog(type, code, detail, extra)

验证日志数据的有效性。

**参数说明：**
- `type`：日志类型
- `code`：日志代码
- `detail`：消费数据
- `extra`：展示数据

**返回值：**
- 验证通过返回空字符串，失败返回错误信息

### 3.2 detailAdapter(code, detail)

根据规则转换详细数据字段。

**参数说明：**
- `code`：日志代码
- `detail`：原始详细数据

**返回值：**
- 转换后的详细数据

### 3.3 debugLogger(...arguments)

调试日志输出函数，只在测试模式下打印。

**参数说明：**
- `...arguments`：要打印的参数

### 3.4 clog(text)

红色日志输出函数。

**参数说明：**
- `text`：要打印的文本

## 4. 全局对象

SDK 会在全局对象 `window` 上注册 `dt` 对象，可直接使用：

```javascript
window.dt.set({
  pid: 'your-project-id',
  reportUrl: 'https://fee.example.com/dig'
})
window.dt.notify('错误类型', '错误页面URL')
```

同时，SDK 也导出了以下对象：

- `Elog`：错误日志上报函数，等同于 `log.error`
- `Plog`：产品指标上报函数，等同于 `log.product`
- `Ilog`：信息日志上报函数，等同于 `log.info`
- 默认导出：`log` 函数

## 5. 数据上报格式

SDK 通过图片打点的方式上报数据，数据格式如下：

```javascript
{
  type: 'error', // 日志类型
  code: 7, // 日志代码
  detail: { // 消费数据
    error_no: '页面报错_JS_RUNTIME_ERROR',
    url: 'example.com/page'
  },
  extra: { // 展示数据
    desc: 'TypeError: Cannot read property \'length\' of undefined',
    stack: 'Error: ...'
  },
  common: { // 公共数据
    pid: 'your-project-id',
    uuid: 'user-device-id',
    ucid: 'user-id',
    timestamp: 1617297600000,
    runtime_version: '1.0.0',
    sdk_version: '1.0.40',
    page_type: 'example.com/page'
  }
}
```

## 6. 错误类型码

| 错误类型码 | 常量 | 显示名称 | 说明 |
|------------|------|----------|------|
| 1 | ERROR_RUNTIME | JS_RUNTIME_ERROR | JavaScript 运行时错误 |
| 2 | ERROR_SCRIPT | SCRIPT_LOAD_ERROR | JavaScript 资源加载失败 |
| 3 | ERROR_STYLE | CSS_LOAD_ERROR | CSS 资源加载失败 |
| 4 | ERROR_IMAGE | IMAGE_LOAD_ERROR | 图片资源加载失败 |
| 5 | ERROR_AUDIO | AUDIO_LOAD_ERROR | 音频资源加载失败 |
| 6 | ERROR_VIDEO | VIDEO_LOAD_ERROR | 视频资源加载失败 |
| 7 | ERROR_CONSOLE | CONSOLE_ERROR | 控制台错误 |
| 8 | ERROR_TRY_CATCH | TRY_CATCH_ERROR | Try-catch 捕获的错误 |

## 7. 最佳实践

### 7.1 初始化配置

在应用入口处进行初始化配置，确保 SDK 能够正常工作：

```javascript
// 在 main.js 或入口文件中
import dt from 'fee-sdk'

// 从 cookie 或 localStorage 获取 uuid 和 ucid
const uuid = getCookie('uuid') || generateUUID()
const ucid = getCookie('ucid') || ''

// 初始化配置
dt.set({
  pid: 'your-project-id',
  reportUrl: window.__APP_CONFIG__.FEE_REPORT_URL,
  uuid: uuid,
  ucid: ucid,
  record: {
    time_on_page: true,
    performance: true,
    js_error: true
  },
  version: '1.0.0',
  getPageType: (location) => {
    // 自定义页面类型解析逻辑
    const path = location.pathname
    if (path.startsWith('/home')) return '首页'
    if (path.startsWith('/list')) return '列表页'
    if (path.startsWith('/detail')) return '详情页'
    return `${location.host}${path}`
  }
})
```

### 7.2 错误处理

对于异步操作和可能抛出错误的代码，使用 try-catch 包装并上报错误：

```javascript
import { tryJS } from 'fee-sdk/js-tracker'

// 包装异步函数
const safeAsyncFunction = tryJS.wrap(async function() {
  try {
    const response = await fetch('/api/data')
    if (!response.ok) {
      // 上报 HTTP 错误
      dt.notify('接口错误_' + response.status, window.location.href, {
        http_code: response.status,
        during_ms: response.headers.get('X-Response-Time') || 0,
        url: '/api/data'
      })
    }
    return await response.json()
  } catch (error) {
    // 上报网络错误
    dt.notify('网络错误_Fetch失败', window.location.href, {
      desc: error.message,
      stack: error.stack
    })
    throw error
  }
})
```

### 7.3 用户行为监控

在关键用户操作处上报行为数据：

```javascript
// 按钮点击事件
document.getElementById('login-btn').addEventListener('click', function() {
  dt.behavior('login_click', '登录按钮点击', window.location.href)
  // 登录逻辑
})

// 表单提交事件
document.getElementById('register-form').addEventListener('submit', function() {
  dt.behavior('register_submit', '注册表单提交', window.location.href)
  // 提交逻辑
})
```

### 7.4 性能监控

除了 SDK 自动监控的页面加载性能，还可以手动监控特定操作的性能：

```javascript
// 监控函数执行时间
function measurePerformance(name, func) {
  const start = performance.now()
  const result = func()
  const end = performance.now()
  const duration = end - start
  
  dt.product(10003, {
    name: name,
    duration_ms: duration
  })
  
  return result
}

// 使用
measurePerformance('数据处理', function() {
  // 数据处理逻辑
  return processedData
})
```

## 8. 注意事项

1. **pid 必须设置**：pid 是项目的唯一标识，必须设置，否则数据无法正确上报
2. **合理设置 uuid**：uuid 用于计算 UV 和设备分布，建议使用稳定的设备标识
3. **错误过滤**：通过 `checkErrrorNeedReport` 函数过滤不需要上报的错误，减少数据量
4. **页面类型解析**：合理设置 `getPageType` 函数，确保页面类型分类准确
5. **测试模式**：在开发环境中可设置 `is_test: true`，此时数据不会展示在系统中
6. **数据量控制**：避免频繁上报大量数据，可通过采样率和批量上报控制
7. **浏览器兼容性**：performance API 在一些旧浏览器中可能不支持，SDK 会自动检测并跳过

## 9. 常见问题

### 9.1 数据没有上报

- 检查 pid 是否正确设置
- 检查网络连接是否正常
- 检查浏览器控制台是否有错误信息
- 确认不是在测试模式下（is_test: true）

### 9.2 错误上报重复

- 检查是否有多个 SDK 实例
- 确认错误处理逻辑是否正确，避免重复捕获

### 9.3 性能数据不准确

- 确保在 window.onload 事件后获取性能数据
- 注意浏览器兼容性，某些浏览器可能不支持完整的 performance API

### 9.4 页面类型解析错误

- 检查 getPageType 函数的实现是否正确
- 确保函数返回的是字符串类型

## 10. 总结

Fee SDK 提供了丰富的 API 用于前端监控，包括错误监控、性能监控和用户行为监控。通过合理使用这些 API，可以全面了解应用的运行状态，及时发现和解决问题，提高应用的稳定性和用户体验。

在使用过程中，应根据实际需求配置 SDK，确保数据的准确性和完整性，同时注意控制数据量，避免对应用性能造成影响。
