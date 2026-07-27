# Fee SDK 源码解析

## 1. 主入口文件 (src/index.js)

### 1.1 核心结构

主入口文件是 SDK 的核心，负责初始化配置、注册API、监听事件和数据上报。

**主要功能：**
- 导入依赖模块（js-tracker、rule、config）
- 定义常量和默认配置
- 实现核心API（log、set、notify、behavior等）
- 初始化错误监控
- 实现性能监控
- 实现用户行为监控

### 1.2 关键代码分析

#### 1.2.1 配置管理

```javascript
// 默认配置
const DEFAULT_CONFIG = {
  pid: '', // [必填]项目id
  uuid: '', // [可选]设备唯一id
  ucid: '', // [可选]用户ucid
  is_test: false, // 是否为测试数据
  record: {
    time_on_page: true, // 是否监控用户在线时长
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
  getPageType: (location = window.location) => { return `${location.host}${location.pathname}` }
}

let commonConfig = _.clone(DEFAULT_CONFIG)
```

**分析：**
- 使用 `DEFAULT_CONFIG` 定义默认配置
- 使用 `commonConfig` 存储当前配置，初始值为默认配置的深拷贝
- 配置项包括项目标识、用户信息、监控开关和自定义函数等

#### 1.2.2 核心上报函数

```javascript
/**
 * @param {类型} type
 * @param {code码} code
 * @param {消费数据} detail
 * @param {展示数据} extra
 */
const log = (type = '', code, detail = {}, extra = {}) => {
  const errorMsg = validLog(type, code, detail, extra)
  if (errorMsg) {
    clog(errorMsg)
    return errorMsg
  }

  // 调用自定义函数, 计算pageType
  let getPageTypeFunc = _.get(
    commonConfig,
    ['getPageType'],
    _.get(DEFAULT_CONFIG, ['getPageType'])
  )
  let location = window.location
  let pageType = location.href
  try {
    pageType = '' + getPageTypeFunc(location)
  } catch (e) {
    debugLogger(`config.getPageType执行时发生异常, 请注意, 错误信息=>`, { e, location })
    pageType = `${location.host}${location.pathname}`
  }

  const logInfo = {
    type,
    code,
    detail: detailAdapter(code, detail),
    extra: extra,
    common: {
      ...commonConfig,
      timestamp: Date.now(),
      runtime_version: commonConfig.version,
      sdk_version: config.version,
      page_type: pageType
    }
  }
  // 图片打点
  const reportUrl = _.get(transportConfig, ['reportUrl']).trim()
  const querySeparator = reportUrl.indexOf('?') === -1 ? '?' : '&'
  const img = new window.Image()
  img.src = `${reportUrl}${querySeparator}d=${encodeURIComponent(JSON.stringify(logInfo))}`
}
```

**分析：**
- 首先验证日志数据的有效性
- 调用 `getPageType` 函数获取页面类型
- 构建日志信息对象，包含类型、代码、详细数据、附加信息和公共信息
- 使用图片打点的方式上报数据，地址由业务方通过 `dt.set({ reportUrl })` 配置
- `reportUrl` 保存在独立的传输配置中，不会写入日志的 `common` 字段

#### 1.2.3 配置设置函数

```javascript
log.set = (customerConfig = {}, isOverwrite = false) => {
  const commonCustomerConfig = { ...customerConfig }
  const hasReportUrl = _.has(commonCustomerConfig, ['reportUrl'])
  const customerReportUrl = _.get(commonCustomerConfig, ['reportUrl'])
  delete commonCustomerConfig.reportUrl

  if (isOverwrite) {
    commonConfig = { ...commonCustomerConfig }
    transportConfig = _.clone(DEFAULT_TRANSPORT_CONFIG)
  } else {
    // lodash内置函数, 相当于递归版assign
    commonConfig = _.merge(commonConfig, commonCustomerConfig)
  }

  if (hasReportUrl) {
    transportConfig.reportUrl = customerReportUrl
  }

  // 检测是否为测试数据
  const isTestFlagOn = _.get(
    commonConfig,
    ['is_test'],
    _.get(DEFAULT_CONFIG, ['is_test'])
  )
  const isOldTestFlagOn = _.get(commonConfig, ['test'], false) // 兼容旧配置项
  const isTest = isTestFlagOn || isOldTestFlagOn

  // 检测配置项
  const uuid = _.get(commonConfig, ['uuid'], '')
  if (uuid === '') {
    debugLogger('警告: 未设置uuid(设备唯一标识), 无法统计设备分布数等信息')
  }
  const ucid = _.get(commonConfig, ['ucid'], '')
  if (ucid === '') {
    debugLogger('警告: 未设置ucid(用户唯一标识), 无法统计新增用户数')
  }

  const checkErrrorNeedReportFunc = _.get(commonConfig, ['record', 'js_error_report_config', 'checkErrrorNeedReport'])
  if (_.isFunction(checkErrrorNeedReportFunc) === false) {
    debugLogger('警告: config.record.js_error_report_config.checkErrrorNeedReport 不是可执行函数, 将导致错误打点数据异常')
  }

  const getPageTypeFunc = _.get(commonConfig, ['getPageType'])
  if (_.isFunction(getPageTypeFunc) === false) {
    debugLogger('警告: config.getPageType 不是可执行函数, 将导致打点数据异常!')
  }

  if (isTest) {
    commonConfig.test = TEST_FLAG
    debugLogger('配置更新完毕')
    debugLogger('当前为测试模式')
    debugLogger('Tip: 测试模式下打点数据仅供浏览, 不会展示在系统中')
    debugLogger('更新后配置为:', commonConfig)
  }
}
```

**分析：**
- 支持两种配置模式：覆盖模式和合并模式
- `reportUrl` 单独保存到 `transportConfig`，覆盖模式下未重新传入时会恢复为空
- 兼容旧的配置项（如 `test`）
- 检测配置的有效性，包括 uuid、ucid、函数类型等
- 在测试模式下添加测试标记

#### 1.2.4 错误监控初始化

```javascript
jstracker.init({
  concat: false,
  report: function (errorLogList = []) {
    const isJsErrorFlagOn = _.get(
      commonConfig,
      ['record', 'js_error'],
      _.get(DEFAULT_CONFIG, ['record', 'js_error'])
    )
    const isOldJsErrorFlagOn = _.get(commonConfig, ['jserror'], false)
    const needRecordJsError = isJsErrorFlagOn || isOldJsErrorFlagOn
    if (needRecordJsError === false) {
      debugLogger(`config.record.js_error为false, 跳过页面报错打点, 页面报错内容为 =>`, errorLogList)
      return
    }
    for (let errorLog of errorLogList) {
      const { type, desc, stack } = errorLog

      // 检测该errorType是否需要记录
      let strErrorType = _.get(JS_TRACKER_ERROR_CONSTANT_MAP, type, '')
      let isErrorTypeNeedRecord = _.get(
        commonConfig,
        ['record', 'js_error_report_config', strErrorType],
        _.get(DEFAULT_CONFIG, ['record', 'js_error_report_config', strErrorType])
      )
      if (isErrorTypeNeedRecord === false) {
        // 主动配置了忽略该错误, 自动返回
        debugLogger(`config.record.js_error_report_config.${strErrorType}值为false, 跳过类别为${strErrorType}的页面报错打点, 错误信息=>`, errorLog)
        continue
      }

      // 调用自定义函数, 检测是否需要上报错误
      let customerErrorCheckFunc = _.get(
        commonConfig,
        ['record', 'js_error_report_config', 'checkErrrorNeedReport'],
        _.get(DEFAULT_CONFIG, ['record', 'js_error_report_config', 'checkErrrorNeedReport'])
      )
      let isNeedReport = false
      try {
        isNeedReport = customerErrorCheckFunc(desc, stack)
      } catch (e) {
        debugLogger(`config.record.js_error_report_config.checkErrrorNeedReport执行时发生异常, 请注意, 页面报错信息为=>`, { e, desc, stack })
        isNeedReport = true
      }
      if (isNeedReport === false) {
        debugLogger(`config.record.js_error_report_config.checkErrrorNeedReport返回值为false, 跳过此类错误, 页面报错信息为=>`, { desc, stack })
        continue
      }

      let errorName = '页面报错_' + JS_TRACKER_ERROR_DISPLAY_MAP[type]

      let location = window.location
      debugLogger('[自动]捕捉到页面错误, 发送打点数据, 上报内容 => ', {
        error_no: errorName,
        url: `${location.host}${location.pathname}`,
        desc,
        stack
      })

      log('error', 7, {
        error_no: errorName,
        url: `${location.host}${location.pathname}`
      }, {
        desc,
        stack
      })
    }
  }
})
```

**分析：**
- 初始化 js-tracker 模块，设置错误上报回调
- 检查是否开启错误监控
- 遍历错误日志列表，对每个错误进行处理
- 检查错误类型是否需要记录
- 调用自定义函数检查是否需要上报错误
- 构建错误信息并上报

#### 1.2.5 性能监控

```javascript
window.onload = () => {
  // 检查是否监控性能指标
  const isPerformanceFlagOn = _.get(
    commonConfig,
    ['record', 'performance'],
    _.get(DEFAULT_CONFIG, ['record', 'performance'])
  )
  const isOldPerformanceFlagOn = _.get(commonConfig, ['performance'], false)
  const needRecordPerformance = isPerformanceFlagOn || isOldPerformanceFlagOn
  if (needRecordPerformance === false) {
    debugLogger(`config.record.performance值为false, 跳过性能指标打点`)
    return
  }

  const performance = window.performance
  if (!performance) {
    // 当前浏览器不支持
    console.log('你的浏览器不支持 performance 接口')
    return
  }
  const times = performance.timing.toJSON()

  debugLogger('发送页面性能指标数据, 上报内容 => ', {
    ...times,
    url: `${window.location.host}${window.location.pathname}`
  })

  log('perf', 20001, {
    ...times,
    url: `${window.location.host}${window.location.pathname}`
  })
}
```

**分析：**
- 在 window.onload 事件中执行性能监控
- 检查是否开启性能监控
- 检查浏览器是否支持 performance API
- 获取性能时间数据并上报

#### 1.2.6 用户在线时长统计

```javascript
// 用户在线时长统计
const OFFLINE_MILL = 15 * 60 * 1000 // 15分钟不操作认为不在线
const SEND_MILL = 5 * 1000 // 每5s打点一次

let lastTime = Date.now()
window.addEventListener('click', () => {
  // 检查是否监控用户在线时长
  const isTimeOnPageFlagOn = _.get(
    commonConfig,
    ['record', 'time_on_page'],
    _.get(DEFAULT_CONFIG, ['record', 'time_on_page'])
  )
  const isOldTimeOnPageFlagOn = _.get(commonConfig, ['online'], false)
  const needRecordTimeOnPage = isTimeOnPageFlagOn || isOldTimeOnPageFlagOn
  if (needRecordTimeOnPage === false) {
    debugLogger(`config.record.time_on_page值为false, 跳过停留时长打点`)
    return
  }

  const now = Date.now()
  const duration = now - lastTime
  if (duration > OFFLINE_MILL) {
    lastTime = Date.now()
  } else if (duration > SEND_MILL) {
    lastTime = Date.now()
    debugLogger('发送用户留存时间埋点, 埋点内容 => ', { duration_ms: duration })
    // 用户在线时长
    log.product(10001, { duration_ms: duration })
  }
}, false)
```

**分析：**
- 通过点击事件监听用户活动
- 检查是否开启在线时长监控
- 计算两次点击之间的时间差
- 如果时间差超过 15 分钟，认为用户重新在线
- 如果时间差超过 5 秒，上报在线时长数据

## 2. 错误跟踪模块 (src/js-tracker/)

### 2.1 index.js

**主要功能：**
- 监听 JavaScript 运行时错误
- 监听资源加载错误
- 监听 Promise 未处理错误
- 重写 console.error 捕获控制台错误
- 处理 try-catch 错误

**关键代码分析：**

#### 2.1.1 错误监听

```javascript
function __init () {
  // 监听资源加载错误(JavaScript Scource failed to load)
  window.addEventListener('error', function (event) {
    // 过滤 target 为 window 的异常，避免与上面的 onerror 重复
    var errorTarget = event.target
    if (errorTarget !== window && errorTarget.nodeName && LOAD_ERROR_TYPE[errorTarget.nodeName.toUpperCase()]) {
      handleError(formatLoadError(errorTarget))
    } else {
      // onerror会被覆盖, 因此转为使用Listener进行监控
      let { message, filename, lineno, colno, error } = event
      handleError(formatRuntimerError(message, filename, lineno, colno, error))
    }
  }, true)

  //监听开发中浏览器中捕获到未处理的Promise错误
  window.addEventListener('unhandledrejection', function (event) {
    console.log('Unhandled Rejection at:', event.promise, 'reason:', event.reason);
    handleError(event)
  }, true)

  // 针对 vue 报错重写 console.error
  console.error = (function (origin) {
    return function (info) {
      var errorLog = {
        type: ERROR_CONSOLE,
        desc: info
      }

      handleError(errorLog)
      origin.call(console, info)
    }
  })(console.error)
}
```

**分析：**
- 使用 `window.addEventListener('error')` 监听资源加载错误和运行时错误
- 使用 `window.addEventListener('unhandledrejection')` 监听未处理的 Promise 错误
- 重写 `console.error` 捕获控制台错误
- 对不同类型的错误进行格式化处理

#### 2.1.2 错误处理

```javascript
/**
 * 错误数据预处理
 *
 * @param  {Object} errorLog    错误日志
 */
function handleError (errorLog) {
  // 是否延时处理
  if (!config.concat) {
    !needReport(config.sampling) || config.report([errorLog])
  } else {
    pushError(errorLog)
    report(errorList)
  }
}

/**
 * 往异常信息数组里面添加一条记录
 *
 * @param  {Object} errorLog 错误日志
 */
function pushError (errorLog) {
  if (needReport(config.sampling) && errorList.length < config.maxError) {
    errorList.push(errorLog)
  }
}

/**
 * 设置一个采样率，决定是否上报
 *
 * @param  {Number} sampling 0 - 1
 * @return {Boolean}
 */
function needReport (sampling) {
  return Math.random() < (sampling || 1)
}
```

**分析：**
- 根据配置决定是否延时处理错误
- 使用采样率控制错误上报频率
- 限制错误日志数量，避免过多数据
- 调用配置的 report 函数上报错误

### 2.2 try.js

**主要功能：**
- 提供函数包装功能，捕获 try-catch 中的错误

**关键代码分析：**

```javascript
/**
 * 将函数使用 try..catch 包装
 *
 * @param  {Function} func 需要进行包装的函数
 * @return {Function} 包装后的函数
 */
function tryify (func) {
  // 确保只包装一次
  if (!func._wrapped) {
    func._wrapped = function () {
      try {
        return func.apply(this, arguments)
      } catch (error) {
        config.handleTryCatchError(error)
        window.ignoreError = true

        throw error
      }
    }
  }

  return func._wrapped
}

/**
 * 只对函数参数进行包装
 *
 * @param  {Function} func 需要进行包装的函数
 * @return {Function}
 */
function tryifyArgs (func) {
  return function () {
    var args = arrayFrom(arguments).map(function (arg) {
      return wrap(arg)
    })

    return func.apply(this, args)
  }
}
```

**分析：**
- `tryify` 函数将传入的函数包装在 try-catch 中，捕获执行过程中的错误
- 使用 `_wrapped` 属性标记函数是否已包装，避免重复包装
- 捕获错误后调用 `handleTryCatchError` 处理错误
- 设置 `window.ignoreError = true` 避免重复捕获
- 重新抛出错误，不影响原函数的执行流程
- `tryifyArgs` 函数只对函数参数进行包装，适用于需要包装回调函数的场景

### 2.3 util.js

**主要功能：**
- 提供工具函数，如防抖、对象合并、类型判断等

**关键代码分析：**

```javascript
/**
 * debounce
 *
 * @param {Function} func 实际要执行的函数
 * @param {Number} delay 延迟时间，单位是 ms
 * @param {Function} callback 在 func 执行后的回调
 *
 * @return {Function}
 */
export function debounce (func, delay, callback) {
  var timer

  return function () {
    var context = this
    var args = arguments

    clearTimeout(timer)

    timer = setTimeout(function () {
      func.apply(context, args)

      !callback || callback()
    }, delay)
  }
}

/**
 * merge
 *
 * @param  {Object} src
 * @param  {Object} dest
 * @return {Object}
 */
export function merge (src, dest) {
  for (var item in src) {
    dest[item] = src[item]
  }

  return dest
}

/**
 * 是否是函数
 *
 * @param  {Any} func 判断对象
 * @return {Boolean}
 */
export function isFunction (func) {
  return Object.prototype.toString.call(func) === '[object Function]'
}

/**
 * 将类数组转化成数组
 *
 * @param  {Object} arrayLike 类数组对象
 * @return {Array} 转化后的数组
 */
export function arrayFrom (arrayLike) {
  return [].slice.call(arrayLike)
}
```

**分析：**
- `debounce` 函数实现了函数防抖，用于限制函数的执行频率
- `merge` 函数实现了对象合并，将源对象的属性复制到目标对象
- `isFunction` 函数用于判断一个值是否为函数
- `arrayFrom` 函数用于将类数组对象转换为数组

## 3. 规则配置模块 (src/rule.js)

**主要功能：**
- 定义不同类型日志的字段规则，包括必填字段、选填字段和字段转换规则

**关键代码分析：**

```javascript
// df detail field
// ef extra field
// dft detail field transfer dbfield
const CODE_DETAIL_RULE = []

CODE_DETAIL_RULE[1] = {
  df: ['url', 'http_code', 'during_ms', 'size'],  // 必填字段 (detail field)
  ef: ['params', 'response'],                      // 选填字段 (extra field)
  dft: {                                           // 字段转换 (detail field transfer)
    'size': 'response_size_b'
  }
}

// 其他规则...

export default CODE_DETAIL_RULE
```

**分析：**
- 使用数组存储不同代码的规则配置
- 每个规则包含三个部分：
  - `df`：必填字段，上报时必须提供
  - `ef`：选填字段，上报时可选择提供
  - `dft`：字段转换规则，将上报字段转换为数据库字段
- 规则用于验证上报数据的有效性和转换字段格式

## 4. 配置模块 (config/index.js)

**主要功能：**
- 定义 SDK 版本和构建配置

**关键代码分析：**

```javascript
const ENV_DEV = 'development'
const ENV_PRODUCTION = 'production'

module.exports = {
  version: '1.0.40',
  build: {
    bundleAnalyzerReport: false,
    env: ENV_PRODUCTION
  },
  dev: {
    bundleAnalyzerReport: false,
    env: ENV_DEV
  }
}
```

**分析：**
- 定义了开发环境和生产环境常量
- 配置了 SDK 版本号
- 配置了构建选项，如是否生成 bundle 分析报告

## 5. 数据流程分析

### 5.1 错误监控流程

1. **错误捕获**：通过各种监听器捕获不同类型的错误
2. **错误格式化**：将错误信息格式化为统一的结构
3. **错误过滤**：根据配置过滤不需要上报的错误
4. **错误上报**：将错误信息通过图片打点上报到服务器

### 5.2 性能监控流程

1. **页面加载完成**：在 window.onload 事件中执行
2. **性能数据获取**：通过 window.performance API 获取性能指标
3. **数据上报**：将性能数据通过图片打点上报到服务器

### 5.3 用户行为监控流程

1. **用户活动**：监听用户点击事件
2. **时间计算**：计算两次点击之间的时间差
3. **数据上报**：将在线时长数据通过图片打点上报到服务器

## 6. 技术亮点

1. **轻量级设计**：代码简洁，体积小，对页面性能影响小
2. **无侵入性**：通过事件监听和函数包装实现，不需要修改业务代码
3. **灵活配置**：提供丰富的配置选项，可根据需要开启或关闭不同功能
4. **数据安全**：通过图片打点方式上报，避免跨域问题
5. **兼容性**：支持主流浏览器，对不支持的 API 进行优雅降级
6. **错误处理**：完善的错误处理机制，包括错误过滤、采样和批量上报
7. **性能优化**：使用防抖等技术优化事件处理

## 7. 代码优化建议

1. **错误去重**：
   - 实现错误去重机制，避免同一错误在短时间内多次上报
   - 可使用错误信息的哈希值作为唯一标识

2. **批量上报**：
   - 实现批量上报机制，减少网络请求次数
   - 可设置缓冲区，达到一定数量或时间后批量上报

3. **网络状态检测**：
   - 检测网络状态，在离线时将数据存储在本地
   - 网络恢复后再上报本地存储的数据

4. **性能优化**：
   - 对高频事件（如滚动、 resize）使用节流处理
   - 优化图片打点的实现，避免创建过多 Image 对象

5. **类型定义**：
   - 添加 TypeScript 类型定义，提高代码可维护性
   - 为配置项和 API 参数添加类型约束

6. **模块化改进**：
   - 进一步模块化代码，提高代码的可测试性和可维护性
   - 将配置、错误处理、数据上报等功能拆分为独立模块

7. **安全性**：
   - 对上报数据进行加密或签名，提高数据安全性
   - 防止恶意代码伪造上报数据

8. **可扩展性**：
   - 设计插件系统，支持自定义功能扩展
   - 提供更多的钩子函数，方便业务方定制化处理

## 8. 总结

Fee SDK 是一个功能强大的前端监控工具，通过收集和分析前端错误、性能指标和用户行为数据，帮助开发者了解应用的运行状态，及时发现和解决问题。

**核心优势：**
- **全面的监控能力**：覆盖错误、性能、用户行为等多个维度
- **灵活的配置选项**：可根据需要定制监控策略
- **轻量级设计**：对页面性能影响小
- **易于集成**：简单的 API 设计，易于集成到现有项目
- **强大的错误处理**：完善的错误捕获和处理机制

**应用场景：**
- **生产环境监控**：实时监控生产环境中的错误和性能问题
- **用户行为分析**：了解用户使用习惯，优化产品设计
- **性能优化**：识别性能瓶颈，优化页面加载速度
- **质量保证**：在发布前检测潜在问题，提高应用稳定性

通过深入理解 Fee SDK 的源码实现，开发者可以更好地使用和定制这个工具，为前端应用的质量保障和持续优化提供有力支持。
