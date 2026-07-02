(function () {
  'use strict'

  var nativeImage = window.Image
  var defaultSdkTarget = 'http://test.com/dig'
  var collectorPath = '/dig'

  window.__feeExampleBridge = {
    sdkTarget: defaultSdkTarget,
    collectorPath: collectorPath,
    redirectedCount: 0
  }

  function rewriteSdkUrl (value) {
    if (typeof value !== 'string') return value
    if (value.indexOf(defaultSdkTarget) !== 0) return value
    window.__feeExampleBridge.redirectedCount += 1
    return window.location.origin + collectorPath + value.slice(defaultSdkTarget.length)
  }

  // SDK 内部通过 new window.Image().src = "http://test.com/dig?d=..." 发送日志。
  // 示例项目不修改 SDK 源码，而是在业务方环境中把目标地址桥接到本地收集器。
  function BridgedImage (width, height) {
    var img = new nativeImage(width, height)
    var currentSrc = ''

    Object.defineProperty(img, 'src', {
      configurable: true,
      enumerable: true,
      get: function () {
        return currentSrc
      },
      set: function (value) {
        currentSrc = rewriteSdkUrl(value)
        img.setAttribute('src', currentSrc)
      }
    })

    return img
  }

  BridgedImage.prototype = nativeImage.prototype
  window.Image = BridgedImage
})()
