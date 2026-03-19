"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _try = _interopRequireWildcard(require("./try"));
var _util = require("./util");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
var monitor = {};
monitor.tryJS = _try.default;
(0, _try.setting)({
  handleTryCatchError: handleTryCatchError
});
monitor.init = function (opts) {
  __config(opts);
  __init();
};

// 忽略错误监听
window.ignoreError = false;
// 错误日志列表
var errorList = [];
// 错误处理回调
var report = function () {};
var config = {
  concat: true,
  delay: 2000,
  // 错误处理间隔时间
  maxError: 16,
  // 异常报错数量限制
  sampling: 1 // 采样率
};

// 定义的错误类型码
var ERROR_RUNTIME = 1; // JS 运行时错误
var ERROR_SCRIPT = 2; // JS 资源加载失败
var ERROR_STYLE = 3; // CSS 资源加载失败
var ERROR_IMAGE = 4; // 图片加载失败
var ERROR_AUDIO = 5; // 音频加载失败
var ERROR_VIDEO = 6; // 视频加载失败
var ERROR_CONSOLE = 7; // console.error 捕获
var ERROR_TRY_CATHC = 8; // try-catch 捕获的错误

var LOAD_ERROR_TYPE = {
  SCRIPT: ERROR_SCRIPT,
  LINK: ERROR_STYLE,
  IMG: ERROR_IMAGE,
  AUDIO: ERROR_AUDIO,
  VIDEO: ERROR_VIDEO
};
function __config(opts) {
  (0, _util.merge)(opts, config);
  report = (0, _util.debounce)(config.report, config.delay, function () {
    errorList = [];
  });
}
function __init() {
  // 监听 JavaScript 报错异常(JavaScript runtime error)
  // window.onerror = function () {
  //   if (window.ignoreError) {
  //     window.ignoreError = false
  //     return
  //   }

  //   handleError(formatRuntimerError.apply(null, arguments))
  // }

  // 监听资源加载错误(JavaScript Scource failed to load)
  window.addEventListener('error', function (event) {
    // 过滤 target 为 window 的异常，避免与上面的 onerror 重复
    var errorTarget = event.target;
    if (errorTarget !== window && errorTarget.nodeName && LOAD_ERROR_TYPE[errorTarget.nodeName.toUpperCase()]) {
      handleError(formatLoadError(errorTarget));
    } else {
      // onerror会被覆盖, 因此转为使用Listener进行监控
      let {
        message,
        filename,
        lineno,
        colno,
        error
      } = event;
      handleError(formatRuntimerError(message, filename, lineno, colno, error));
    }
  }, true);

  //监听开发中浏览器中捕获到未处理的Promise错误
  window.addEventListener('unhandledrejection', function (event) {
    console.log('Unhandled Rejection at:', event.promise, 'reason:', event.reason);
    handleError(event);
  }, true);

  // 针对 vue 报错重写 console.error
  // TODO
  console.error = function (origin) {
    return function (info) {
      var errorLog = {
        type: ERROR_CONSOLE,
        desc: info
      };
      handleError(errorLog);
      origin.call(console, info);
    };
  }(console.error);
}

// 处理 try..catch 错误
function handleTryCatchError(error) {
  handleError(formatTryCatchError(error));
}

/**
 * 生成 runtime 错误日志
 *
 * @param  {String} message 错误信息
 * @param  {String} source  发生错误的脚本 URL
 * @param  {Number} lineno  发生错误的行号
 * @param  {Number} colno   发生错误的列号
 * @param  {Object} error   error 对象
 * @return {Object}
 */
function formatRuntimerError(message, source, lineno, colno, error) {
  return {
    type: ERROR_RUNTIME,
    desc: message + ' at ' + source + ':' + lineno + ':' + colno,
    stack: error && error.stack ? error.stack : 'no stack' // IE <9, has no error stack
  };
}

/**
 * 生成 laod 错误日志
 *
 * @param  {Object} errorTarget
 * @return {Object}
 */
function formatLoadError(errorTarget) {
  return {
    type: LOAD_ERROR_TYPE[errorTarget.nodeName.toUpperCase()],
    desc: errorTarget.baseURI + '@' + (errorTarget.src || errorTarget.href),
    stack: 'no stack'
  };
}

/**
 * 生成 try..catch 错误日志
 *
 * @param  {Object} error error 对象
 * @return {Object} 格式化后的对象
 */
function formatTryCatchError(error) {
  return {
    type: ERROR_TRY_CATHC,
    desc: error.message,
    stack: error.stack
  };
}

/**
 * 错误数据预处理
 *
 * @param  {Object} errorLog    错误日志
 */
function handleError(errorLog) {
  // 是否延时处理
  if (!config.concat) {
    !needReport(config.sampling) || config.report([errorLog]);
  } else {
    pushError(errorLog);
    report(errorList);
  }
}

/**
 * 往异常信息数组里面添加一条记录
 *
 * @param  {Object} errorLog 错误日志
 */
function pushError(errorLog) {
  if (needReport(config.sampling) && errorList.length < config.maxError) {
    errorList.push(errorLog);
  }
}

/**
 * 设置一个采样率，决定是否上报
 *
 * @param  {Number} sampling 0 - 1
 * @return {Boolean}
 */
function needReport(sampling) {
  return Math.random() < (sampling || 1);
}
var _default = exports.default = monitor;