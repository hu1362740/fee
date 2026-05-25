# Fee SDK 详细分析文档

## 1. 项目结构

Fee SDK 是一个前端监控工具，用于收集和上报前端错误、性能指标和用户行为数据。项目结构如下：

```
sdk/
├── config/              # 配置文件
│   └── index.js         # SDK 版本和构建配置
├── lib/                 # 编译后的代码
│   ├── js-tracker/      # 编译后的错误跟踪模块
│   ├── index.js         # 编译后的主文件
│   └── rule.js          # 编译后的规则配置
├── script/              # 构建脚本
│   ├── build.js         # 构建命令
│   └── webpack.conf.js  # Webpack 配置
├── src/                 # 源代码
│   ├── js-tracker/      # 错误跟踪模块
│   │   ├── index.js     # 错误跟踪主文件
│   │   ├── try.js       # try-catch 错误处理
│   │   └── util.js      # 工具函数
│   ├── index.js         # SDK 主入口
│   └── rule.js          # 数据上报规则配置
├── .babelrc             # Babel 配置
├── .npmignore           # npm 忽略文件
├── README.md            # 项目说明
└── package.json         # 项目依赖
```

## 2. 核心模块分析

### 2.1 主入口模块 (src/index.js)

这是 SDK 的核心文件，包含了主要的功能实现和 API 定义。

#### 2.1.1 主要功能

1. **错误监控**：通过 js-tracker 模块捕获 JavaScript 运行时错误、资源加载错误、Promise 未处理错误和控制台错误。
2. **性能监控**：监控页面加载性能指标，如 DNS 解析时间、TCP 连接时间、首屏渲染时间等。
3. **用户行为监控**：统计用户在线时长和点击行为。
4. **数据上报**：通过图片打点的方式将数据上报到服务器。

#### 2.1.2 核心 API

- **log(type, code, detail, extra)**：通用日志上报函数
- **log.set(config, isOverwrite)**：设置 SDK 配置
- **log.notify(errorName, url, extraInfo)**：自定义错误上报
- **log.behavior(code, name, url)**：用户行为上报
- **log.error(code, detail, extra)**：错误日志上报
- **log.product(code, detail, extra)**：产品指标上报
- **log.info(code, detail, extra)**：信息日志上报

#### 2.1.3 配置选项

SDK 提供了丰富的配置选项：

```javascript
const DEFAULT_CONFIG = {
  pid: '', // [必填]项目id, 由灯塔项目组统一分配
  uuid: '', // [可选]设备唯一id, 用于计算uv数&设备分布
  ucid: '', // [可选]用户ucid, 用于发生异常时追踪用户信息
  is_test: false, // 是否为测试数据
  record: {
    time_on_page: true, // 是否监控用户在线时长数据
    performance: true, // 是否监控页面载入性能
    js_error: true, // 是否监控页面报错信息
    js_error_report_config: {
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
  },
  version: '1.0.0', // 业务方的js版本号
  getPageType: (location = window.location) => { return `${location.host}${location.pathname}` } // 页面类型解析函数
}
```

### 2.2 错误跟踪模块 (src/js-tracker/)

#### 2.2.1 index.js

负责监听和捕获各种类型的错误：

- JavaScript 运行时错误 (ERROR_RUNTIME)
- 资源加载错误 (ERROR_SCRIPT, ERROR_STYLE, ERROR_IMAGE, ERROR_AUDIO, ERROR_VIDEO)
- 控制台错误 (ERROR_CONSOLE)
- Try-catch 错误 (ERROR_TRY_CATCH)
- Promise 未处理错误

#### 2.2.2 try.js

提供了函数包装功能，用于捕获 try-catch 中的错误：

- **wrap(func)**：包装函数，捕获执行过程中的错误
- **wrapArgs(func)**：只对函数参数进行包装

#### 2.2.3 util.js

提供了一些工具函数：

- **debounce(func, delay, callback)**：函数防抖
- **merge(src, dest)**：对象合并
- **isFunction(func)**：判断是否为函数
- **arrayFrom(arrayLike)**：将类数组对象转换为数组

### 2.3 规则配置模块 (src/rule.js)

定义了不同类型日志的字段规则：

- **df**：必填字段
- **ef**：选填字段
- **dft**：字段转换规则

## 3. 数据流程

1. **数据收集**：通过各种监听器收集错误、性能和行为数据
2. **数据处理**：对收集到的数据进行格式化和验证
3. **数据上报**：通过图片打点的方式将数据上报到服务器

```javascript
// 图片打点实现
const img = new window.Image()
img.src = `${feeTarget}?d=${encodeURIComponent(JSON.stringify(logInfo))}`
```

## 4. 核心功能详解

### 4.1 错误监控

SDK 监控以下类型的错误：

1. **JavaScript 运行时错误**：通过 window.addEventListener('error') 监听
2. **资源加载错误**：通过 window.addEventListener('error') 监听，区分不同类型的资源
3. **Promise 未处理错误**：通过 window.addEventListener('unhandledrejection') 监听
4. **控制台错误**：重写 console.error 方法
5. **Try-catch 错误**：通过 tryJS.wrap 包装函数捕获

### 4.2 性能监控

在 window.onload 事件中，通过 window.performance API 收集页面加载性能指标：

- DNS 解析时间
- TCP 连接时间
- 请求响应时间
- 页面渲染时间
- 首屏加载时间

### 4.3 用户行为监控

1. **在线时长统计**：通过点击事件和时间差计算用户在线时长
2. **用户行为上报**：通过 log.behavior API 上报用户点击等行为

## 5. 使用方法

### 5.1 基本使用

```javascript
// 引入 SDK
import dt from 'fee-sdk'

// 初始化配置
dt.set({
  pid: 'your-project-id',
  uuid: 'user-device-id',
  ucid: 'user-id'
})

// 上报自定义错误
dt.notify('错误类型', '错误页面URL', {
  http_code: 500,
  during_ms: 1000,
  extra: '附加信息'
})

// 上报用户行为
dt.behavior('button_click', '按钮点击', window.location.href)

// 上报产品指标
dt.product(10001, { duration_ms: 5000 })
```

### 5.2 高级配置

```javascript
dt.set({
  pid: 'your-project-id',
  uuid: 'user-device-id',
  ucid: 'user-id',
  is_test: false,
  record: {
    time_on_page: true,
    performance: true,
    js_error: true,
    js_error_report_config: {
      ERROR_RUNTIME: true,
      ERROR_SCRIPT: false, // 关闭脚本加载错误监控
      ERROR_STYLE: false,  // 关闭样式加载错误监控
      checkErrrorNeedReport: (desc, stack) => {
        // 自定义错误过滤逻辑
        return !desc.includes('忽略的错误')
      }
    }
  },
  version: '1.0.0',
  getPageType: (location) => {
    // 自定义页面类型解析
    if (location.pathname.includes('/detail/')) {
      return '详情页'
    }
    return `${location.host}${location.pathname}`
  }
})
```

## 6. 技术特点

1. **轻量级**：代码简洁，体积小
2. **无侵入性**：通过监听事件和包装函数实现，对业务代码影响小
3. **灵活配置**：提供丰富的配置选项，可根据需要开启或关闭不同功能
4. **数据安全**：通过图片打点方式上报，避免跨域问题
5. **兼容性**：支持主流浏览器

## 7. 代码优化建议

1. **错误去重**：同一错误在短时间内多次发生时，可考虑去重处理，减少重复上报
2. **批量上报**：可将多个错误或事件合并上报，减少网络请求
3. **网络状态检测**：在网络离线时，可将数据存储在本地，待网络恢复后再上报
4. **性能优化**：对于高频事件（如点击），可考虑使用节流或防抖处理
5. **类型定义**：添加 TypeScript 类型定义，提高代码可维护性

## 8. 总结

Fee SDK 是一个功能强大的前端监控工具，通过收集和分析前端错误、性能指标和用户行为数据，帮助开发者了解应用的运行状态，及时发现和解决问题。它具有配置灵活、使用简单、轻量无侵入等特点，是前端监控的得力助手。

通过合理配置和使用 Fee SDK，可以：

1. **提高应用稳定性**：及时发现和解决错误
2. **优化用户体验**：监控和改进页面性能
3. **了解用户行为**：分析用户操作习惯
4. **数据驱动决策**：基于监控数据进行产品优化

Fee SDK 为前端应用的质量保障和持续优化提供了有力支持。