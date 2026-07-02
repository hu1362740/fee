(function () {
  'use strict'

  var state = {
    config: null,
    uuid: getOrCreateId('fee_example_uuid', 'example-device'),
    ucid: getOrCreateId('fee_example_ucid', 'example-user')
  }

  /**
   * 获取或创建一个稳定的本地标识。
   *
   * SDK 的 UV、设备分布、新用户等统计依赖 uuid / ucid：
   * - uuid：设备唯一标识，用于 UV、设备统计。
   * - ucid：用户唯一标识，用于新增用户、错误定位。
   *
   * example 没有真实登录系统，所以用 localStorage 模拟业务方自己的用户/设备 ID。
   */
  function getOrCreateId (key, prefix) {
    var existing = window.localStorage.getItem(key)
    if (existing) return existing
    var value = prefix + '-' + Date.now() + '-' + Math.random().toString(16).slice(2)
    window.localStorage.setItem(key, value)
    return value
  }

  /**
   * 简单 DOM 查询工具。
   */
  function qs (selector) {
    return document.querySelector(selector)
  }

  /**
   * 更新页面右上角 SDK 运行状态。
   */
  function setStatus (text) {
    qs('#runtimeStatus').textContent = text
  }

  /**
   * 生成当前页面 URL。
   *
   * SDK 的错误、行为、性能数据中都会带 url，server/client 会用它做页面维度聚合。
   */
  function getPageUrl () {
    return window.location.host + window.location.pathname
  }

  /**
   * 初始化主项目 SDK。
   *
   * 调用来源：
   * - boot() 获取 /api/config 后调用。
   *
   * 关键点：
   * - window.dt 由 /sdk/index.js 提供。
   * - pid 必须等于 server 数据库 t_o_project.project_name。
   * - 本示例默认 pid=template，对应 Utils:TemplateSQL 创建的模板项目。
   */
  function initSdk (config) {
    if (!window.dt) {
      setStatus('SDK 未加载')
      return
    }

    // 初始化 SDK 公共字段。pid 必须与 server 数据库 t_o_project.project_name 对应。
    alert(config.projectPid)
    window.dt.set({
      pid: config.projectPid,
      uuid: state.uuid,
      ucid: state.ucid,
      is_test: false,
      version: 'example-business-1.0.0',
      record: {
        time_on_page: true,
        performance: true,
        js_error: true,
        js_error_report_config: {
          ERROR_RUNTIME: true,
          ERROR_SCRIPT: true,
          ERROR_STYLE: true,
          ERROR_IMAGE: true,
          ERROR_AUDIO: true,
          ERROR_VIDEO: true,
          ERROR_CONSOLE: true,
          ERROR_TRY_CATCH: true,
          checkErrrorNeedReport: function () {
            return true
          }
        }
      },
      getPageType: function (location) {
        return 'example:' + location.pathname
      }
    })

    setStatus('SDK 已初始化，pid=' + config.projectPid)
    qs('#sdkState').textContent = '已初始化'
    qs('#projectPid').textContent = config.projectPid
  }

  /**
   * 页面浏览打点。
   *
   * 对应 index.html 业务操作台按钮：
   * - id: btnPageView
   * - 文案: 页面浏览打点
   *
   * SDK 调用：
   * - window.dt.behavior(...)
   *
   * 数据类型：
   * - type=product
   * - code=10002
   *
   * 服务端消费：
   * - Parse:MenuClick 会统计行为点击。
   * - Parse:UV / Summary:PV 也会消费合法日志，用于 UV/PV 统计。
   */
  function reportPageView () {
    // SDK 没有单独的 page_view API，本项目 UV/PV 解析会消费所有合法日志。
    // 这里额外用 behavior 记录一次“页面浏览”，便于在行为看板中看到明确的页面访问事件。
    window.dt.behavior('EXAMPLE_PAGE_VIEW', 'Example 页面浏览', getPageUrl())
  }

  /**
   * 普通按钮点击打点。
   *
   * 对应 index.html 业务操作台按钮：
   * - id: btnPrimaryAction
   * - 文案: 按钮点击打点
   *
   * SDK 调用：
   * - window.dt.behavior(...)
   *
   * 服务端消费：
   * - Parse:MenuClick
   * - 行为数据最终可在 client 的菜单点击量/行为分布页面查看。
   */
  function reportButtonClick () {
    // 用户行为打点：对应服务端 Parse:MenuClick，code=10002。
    window.dt.behavior('EXAMPLE_PRIMARY_BUTTON', '点击主操作按钮', getPageUrl())
  }

  /**
   * 表单提交打点。
   *
   * 对应 index.html 表单：
   * - id: checkoutForm
   * - 提交按钮文案: 提交订单表单
   *
   * SDK 调用：
   * - window.dt.behavior(...) 记录“提交表单”这个关键用户行为。
   * - window.dt.info(...) 额外记录订单号、金额等业务扩展信息。
   *
   * 注意：
   * - 当前主项目 client 已有行为看板，会展示 behavior 数据。
   * - info 类型会进入日志链路，但当前 client 没有内置 info 看板，需要后续扩展解析器/API/页面。
   */
  function reportFormSubmit (event) {
    event.preventDefault()
    var form = event.currentTarget
    var orderNo = form.orderNo.value
    var amount = form.amount.value

    // 表单提交也是一种关键用户行为，统一使用 behavior 上报。
    window.dt.behavior('EXAMPLE_FORM_SUBMIT', '提交订单表单', getPageUrl())

    // info 类型用于展示 SDK 支持的扩展信息上报。当前主项目 client 没有内置信息看板，
    // 但 example 收集器和 server kafka json 日志会保留这类数据，便于后续扩展解析器。
    window.dt.info(20020, {
      url: getPageUrl(),
      action: 'form_submit',
      order_no: orderNo,
      amount: amount
    }, {
      scene: 'checkout',
      note: '表单提交附加信息'
    })

    console.info('Example 表单提交打点已触发', { orderNo: orderNo, amount: amount })
  }

  /**
   * 主动错误上报。
   *
   * 对应 index.html 业务操作台按钮：
   * - id: btnNotifyError
   * - 文案: 主动错误上报
   *
   * SDK 调用：
   * - window.dt.notify(errorName, url, extraInfo)
   *
   * 适用场景：
   * - 接口请求失败。
   * - 业务流程异常。
   * - try/catch 捕获到异常后主动上报。
   *
   * 数据类型：
   * - type=error
   * - code=8
   *
   * 服务端消费：
   * - Parse:Monitor
   * - Summary:Error
   * - client 错误看板。
   */
  function reportNotifyError () {
    // 主动错误上报：对应 SDK log.notify，服务端按 error code=8 解析入错误看板。
    window.dt.notify('Example接口请求失败_getOrderDetail', getPageUrl(), {
      http_code: 502,
      during_ms: 860,
      request_size_b: 128,
      response_size_b: 512,
      trace_url: 'https://trace.example.local/order/ORDER-20260702-001',
      request_id: 'REQ-' + Date.now()
    })
  }

  /**
   * 触发被动 JS 运行时错误。
   *
   * 对应 index.html 业务操作台按钮：
   * - id: btnPassiveError
   * - 文案: 触发 JS 运行时错误
   *
   * SDK 调用：
   * - 这里不直接调用 window.dt。
   * - 而是抛出一个真实 JS Error，由 SDK 内部 js-tracker 自动捕获。
   *
   * 数据类型：
   * - type=error
   * - code=7
   * - error_no 通常类似 页面报错_JS_RUNTIME_ERROR
   */
  function triggerPassiveError () {
    // 被动 JS 错误捕获：抛出运行时异常，由 SDK 内部 js-tracker 捕获并自动上报 code=7。
    setTimeout(function () {
      throw new Error('Example 被动捕获 JS 运行时错误')
    }, 0)
  }

  /**
   * 触发被动资源加载错误。
   *
   * 对应 index.html 业务操作台按钮：
   * - id: btnResourceError
   * - 文案: 触发资源加载错误
   *
   * SDK 调用：
   * - 这里不直接调用 window.dt。
   * - 动态创建一个不存在的图片 URL，由 SDK 内部资源错误监听捕获。
   *
   * 数据类型：
   * - type=error
   * - code=7
   * - error_no 通常类似 页面报错_IMAGE_LOAD_ERROR
   */
  function triggerResourceError () {
    // 被动资源错误捕获：加载不存在的图片，SDK 的资源错误监听会捕获 IMAGE_LOAD_ERROR。
    var img = document.createElement('img')
    img.alt = 'missing demo asset'
    img.src = '/missing-image-' + Date.now() + '.png'
    img.style.display = 'none'
    document.body.appendChild(img)
  }

  /**
   * 自定义 info 指标上报。
   *
   * 对应 index.html 业务操作台按钮：
   * - id: btnInfoMetric
   * - 文案: 自定义信息指标
   *
   * SDK 调用：
   * - window.dt.info(...)
   *
   * 适用场景：
   * - 业务方想上报 SDK 现有错误/性能/行为以外的扩展信息。
   *
   * 注意：
   * - SDK 支持 info 类型。
   * - 当前 server/client 没有完整 info 看板，这里用于演示“可以上报并进入日志”。
   */
  function reportInfoMetric () {
    // info 类型示例：资源加载或业务指标可通过 info 扩展记录。
    window.dt.info(20010, {
      url: getPageUrl(),
      metric: 'manual_resource_timing',
      duration_ms: Math.round(20 + Math.random() * 80),
      resource_name: 'example-manual-resource'
    }, {
      source: 'PerformanceObserver/manual fallback'
    })
  }

  /**
   * 安装浏览器 PerformanceObserver。
   *
   * 调用来源：
   * - boot() 初始化 SDK 后调用。
   *
   * 作用：
   * - 监听 resource：资源加载性能，例如 JS/CSS/图片请求耗时。
   * - 监听 measure：交互性能，由 markInteraction() 主动创建 measure。
   *
   * SDK 调用：
   * - window.dt.info(20010, ...) 上报资源性能扩展信息。
   * - window.dt.info(20011, ...) 上报交互性能扩展信息。
   *
   * 与 SDK 内置性能采集的关系：
   * - SDK 自身会在 window.onload 上报 type=perf/code=20001 的页面加载性能。
   * - 这里额外演示业务方如何补充资源和交互类性能。
   */
  function installPerformanceObservers () {
    if (!('PerformanceObserver' in window) || !window.dt) return

    try {
      var resourceObserver = new PerformanceObserver(function (list) {
        list.getEntries().slice(0, 5).forEach(function (entry) {
          if (!entry.name || entry.name.indexOf('/dig?') !== -1) return
          window.dt.info(20010, {
            url: getPageUrl(),
            metric: 'resource',
            resource_name: entry.name.slice(0, 180),
            duration_ms: Math.round(entry.duration || 0),
            transfer_size_b: entry.transferSize || 0
          }, {
            initiatorType: entry.initiatorType || ''
          })
        })
      })
      resourceObserver.observe({ entryTypes: ['resource'] })
    } catch (err) {
      console.warn('resource PerformanceObserver 不可用', err)
    }

    try {
      var measureObserver = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          window.dt.info(20011, {
            url: getPageUrl(),
            metric: 'interaction',
            name: entry.name,
            duration_ms: Math.round(entry.duration || 0)
          }, {
            entryType: entry.entryType
          })
        })
      })
      measureObserver.observe({ entryTypes: ['measure'] })
    } catch (err) {
      console.warn('measure PerformanceObserver 不可用', err)
    }
  }

  /**
   * 标记一次用户交互耗时。
   *
   * 调用来源：
   * - bindEvents() 中各个按钮点击事件。
   *
   * 作用：
   * - 使用 performance.mark / performance.measure 生成一条交互耗时记录。
   * - installPerformanceObservers() 中的 measureObserver 会捕获该记录并通过 dt.info 上报。
   */
  function markInteraction (name) {
    if (!window.performance || !window.performance.mark || !window.performance.measure) return
    var start = name + '-start'
    var end = name + '-end'
    window.performance.mark(start)
    setTimeout(function () {
      window.performance.mark(end)
      window.performance.measure(name, start, end)
    }, Math.round(30 + Math.random() * 120))
  }

  /**
   * 绑定 index.html 业务操作台事件。
   *
   * 按钮/表单与函数对应关系：
   *
   * - #btnPageView
   *   页面文案：页面浏览打点
   *   调用函数：reportPageView()
   *
   * - #btnPrimaryAction
   *   页面文案：按钮点击打点
   *   调用函数：reportButtonClick()
   *
   * - #btnNotifyError
   *   页面文案：主动错误上报
   *   调用函数：reportNotifyError()
   *
   * - #btnPassiveError
   *   页面文案：触发 JS 运行时错误
   *   调用函数：triggerPassiveError()
   *
   * - #btnResourceError
   *   页面文案：触发资源加载错误
   *   调用函数：triggerResourceError()
   *
   * - #btnInfoMetric
   *   页面文案：自定义信息指标
   *   调用函数：reportInfoMetric()
   *
   * - #checkoutForm
   *   页面文案：提交订单表单
   *   调用函数：reportFormSubmit(event)
   *
   * 每个按钮点击时都会先调用 markInteraction(...)，用于额外演示交互性能指标。
   */
  function bindEvents () {
    qs('#btnPageView').addEventListener('click', function () {
      markInteraction('click-page-view')
      reportPageView()
    })
    qs('#btnPrimaryAction').addEventListener('click', function () {
      markInteraction('click-primary-action')
      reportButtonClick()
    })
    qs('#btnNotifyError').addEventListener('click', function () {
      markInteraction('click-notify-error')
      reportNotifyError()
    })
    qs('#btnPassiveError').addEventListener('click', function () {
      markInteraction('click-passive-error')
      triggerPassiveError()
    })
    qs('#btnResourceError').addEventListener('click', function () {
      markInteraction('click-resource-error')
      triggerResourceError()
    })
    qs('#btnInfoMetric').addEventListener('click', function () {
      markInteraction('click-info-metric')
      reportInfoMetric()
    })
    qs('#checkoutForm').addEventListener('submit', reportFormSubmit)
  }

  /**
   * example 页面启动入口。
   *
   * 执行顺序：
   * 1. 请求 /api/config，读取 example 配置。
   * 2. 初始化 SDK。
   * 3. 绑定页面按钮/表单事件。
   * 4. 安装资源性能和交互性能观察器。
   * 5. 自动发送一次页面浏览行为打点。
   */
  function boot () {
    window.fetch('/api/config')
      .then(function (res) { return res.json() })
      .then(function (config) {
        console.log('config',config)
        state.config = config
        initSdk(config)
        bindEvents()
        installPerformanceObservers()
        reportPageView()
      })
      .catch(function (err) {
        setStatus('启动失败：' + err.message)
      })
  }

  boot()
})()
