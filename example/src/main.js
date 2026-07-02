(function () {
  'use strict'

  var state = {
    config: null,
    uuid: getOrCreateId('fee_example_uuid', 'example-device'),
    ucid: getOrCreateId('fee_example_ucid', 'example-user')
  }

  function getOrCreateId (key, prefix) {
    var existing = window.localStorage.getItem(key)
    if (existing) return existing
    var value = prefix + '-' + Date.now() + '-' + Math.random().toString(16).slice(2)
    window.localStorage.setItem(key, value)
    return value
  }

  function qs (selector) {
    return document.querySelector(selector)
  }

  function setStatus (text) {
    qs('#runtimeStatus').textContent = text
  }

  function getPageUrl () {
    return window.location.host + window.location.pathname
  }

  function initSdk (config) {
    if (!window.dt) {
      setStatus('SDK 未加载')
      return
    }

    // 初始化 SDK 公共字段。pid 必须与 server 数据库 t_o_project.project_name 对应。
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
  }

  function reportPageView () {
    // SDK 没有单独的 page_view API，本项目 UV/PV 解析会消费所有合法日志。
    // 这里额外用 behavior 记录一次“页面浏览”，便于在行为看板中看到明确的页面访问事件。
    window.dt.behavior('EXAMPLE_PAGE_VIEW', 'Example 页面浏览', getPageUrl())
  }

  function reportButtonClick () {
    // 用户行为打点：对应服务端 Parse:MenuClick，code=10002。
    window.dt.behavior('EXAMPLE_PRIMARY_BUTTON', '点击主操作按钮', getPageUrl())
  }

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

    refreshRecords()
  }

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

  function triggerPassiveError () {
    // 被动 JS 错误捕获：抛出运行时异常，由 SDK 内部 js-tracker 捕获并自动上报 code=7。
    setTimeout(function () {
      throw new Error('Example 被动捕获 JS 运行时错误')
    }, 0)
  }

  function triggerResourceError () {
    // 被动资源错误捕获：加载不存在的图片，SDK 的资源错误监听会捕获 IMAGE_LOAD_ERROR。
    var img = document.createElement('img')
    img.alt = 'missing demo asset'
    img.src = '/missing-image-' + Date.now() + '.png'
    img.style.display = 'none'
    document.body.appendChild(img)
  }

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

  function bindEvents () {
    qs('#btnPageView').addEventListener('click', function () {
      markInteraction('click-page-view')
      reportPageView()
      refreshRecords()
    })
    qs('#btnPrimaryAction').addEventListener('click', function () {
      markInteraction('click-primary-action')
      reportButtonClick()
      refreshRecords()
    })
    qs('#btnNotifyError').addEventListener('click', function () {
      markInteraction('click-notify-error')
      reportNotifyError()
      refreshRecords()
    })
    qs('#btnPassiveError').addEventListener('click', function () {
      markInteraction('click-passive-error')
      triggerPassiveError()
      setTimeout(refreshRecords, 300)
    })
    qs('#btnResourceError').addEventListener('click', function () {
      markInteraction('click-resource-error')
      triggerResourceError()
      setTimeout(refreshRecords, 300)
    })
    qs('#btnInfoMetric').addEventListener('click', function () {
      markInteraction('click-info-metric')
      reportInfoMetric()
      refreshRecords()
    })
    qs('#checkoutForm').addEventListener('submit', reportFormSubmit)
  }

  function refreshRecords () {
    window.fetch('/api/records?limit=20')
      .then(function (res) { return res.json() })
      .then(function (payload) {
        var summary = payload.summary || { total: 0, byType: {} }
        qs('#totalCount').textContent = summary.total || 0
        qs('#errorCount').textContent = summary.byType.error || 0
        qs('#productCount').textContent = summary.byType.product || 0
        qs('#perfCount').textContent = summary.byType.perf || 0
        qs('#infoCount').textContent = summary.byType.info || 0
        qs('#recordPreview').textContent = JSON.stringify(payload.records || [], null, 2)
      })
  }

  function boot () {
    window.fetch('/api/config')
      .then(function (res) { return res.json() })
      .then(function (config) {
        state.config = config
        initSdk(config)
        bindEvents()
        installPerformanceObservers()
        reportPageView()
        refreshRecords()
        window.setInterval(refreshRecords, 3000)
      })
      .catch(function (err) {
        setStatus('启动失败：' + err.message)
      })
  }

  boot()
})()
