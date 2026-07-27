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

// 设置 try-catch 错误处理回调，将内部捕获的错误传递给 handleTryCatchError 处理
(0, _try.setting)({
  handleTryCatchError: handleTryCatchError
});

/**
 * 初始化监控器
 * @param {Object} opts 配置选项，包含 report 回调函数及各类配置项
 */
monitor.init = function (opts) {
  __config(opts);
  __init();
};

// 忽略错误监听标记，用于防止 try-catch 捕获后的错误被重复上报
window.ignoreError = false;
// 错误日志列表，用于暂存待上报的错误
var errorList = [];
// 错误处理回调，默认空函数，后续会被用户传入的 report 函数替换
var report = function () {};

// 默认配置
var config = {
  concat: true,
  // 是否合并错误上报：true 为累积一定时间或数量后统一上报，false 为立即上报
  delay: 2000,
  // 错误处理间隔时间（ms），仅在 concat 为 true 时生效
  maxError: 16,
  // 异常报错数量限制，防止内存溢出
  sampling: 1 // 采样率（0-1），1 表示 100% 上报
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

// 资源加载错误类型映射，将 DOM 标签名映射到对应的错误类型码
var LOAD_ERROR_TYPE = {
  SCRIPT: ERROR_SCRIPT,
  LINK: ERROR_STYLE,
  IMG: ERROR_IMAGE,
  AUDIO: ERROR_AUDIO,
  VIDEO: ERROR_VIDEO
};

/**
 * 配置合并与报告函数初始化
 * @param {Object} opts 用户配置
 *
 * 【关键逻辑】：
 * 1. merge(opts, config): 将用户传入的配置（包含 report 函数）合并到 config 对象中
 *    此时 config.report 已经被赋值为 index.js 中传入的那个函数
 * 2. debounce(...): 使用防抖函数包装 config.report
 *    这意味着当错误频繁发生时，不会每次都立即调用，而是等待 delay 毫秒后统一调用一次
 * 3. report = debounce(...): 将包装后的函数重新赋值给局部变量 report
 *    后续 handleError 中调用的就是这个 report 变量
 */
function __config(opts) {
  (0, _util.merge)(opts, config);

  // 使用防抖函数包装报告方法，避免频繁上报
  // 这里 config.report 就是 index.js 中传入的用户自定义回调函数
  report = (0, _util.debounce)(config.report, config.delay, function () {
    // 防抖执行后的回调：清空错误队列
    errorList = [];
  });
}

/**
 * 初始化错误监听
 * 注册全局事件监听器以捕获各类前端错误
 */
function __init() {
  // 监听资源加载错误 (JavaScript Source failed to load) 及运行时错误
  window.addEventListener('error', function (event) {
    var errorTarget = event.target;
    // 过滤 target 为 window 的异常，避免与下面的 runtime 错误重复
    // 如果 target 不是 window 且是特定的资源标签，则判定为资源加载错误
    if (errorTarget !== window && errorTarget.nodeName && LOAD_ERROR_TYPE[errorTarget.nodeName.toUpperCase()]) {
      handleError(formatLoadError(errorTarget));
    } else {
      // onerror 会被覆盖，因此转为使用 Listener 进行监控
      // 提取运行时错误的详细信息
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

  // 监听未处理的 Promise 错误 (unhandledrejection)
  window.addEventListener('unhandledrejection', function (event) {
    console.log('Unhandled Rejection at:', event.promise, 'reason:', event.reason);
    handleError(event);
  }, true);

  // 针对 vue、react 报错重写 console.error
  // 拦截 console.error 调用，将其视为一种错误类型进行上报
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
// 该函数由 try.js 中的 setting 配置注入，用于接收被 wrap 包裹函数抛出的异常
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
 * @return {Object} 格式化后的错误对象
 */
function formatRuntimerError(message, source, lineno, colno, error) {
  return {
    type: ERROR_RUNTIME,
    desc: message + ' at ' + source + ':' + lineno + ':' + colno,
    stack: error && error.stack ? error.stack : 'no stack' // IE <9, has no error stack
  };
}

/**
 * 生成 load 错误日志
 *
 * @param  {Object} errorTarget 出错 DOM 元素
 * @return {Object} 格式化后的错误对象
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
 * 错误数据预处理与分发
 *
 * @param  {Object} errorLog    错误日志
 *
 * 【调用触发点】：
 * 当 __init 中监听到 error 或 unhandledrejection 事件，或 try-catch 捕获错误时，会调用此函数
 *
 * 【处理逻辑】：
 * 根据 config.concat 配置决定上报策略：
 * - 如果 concat 为 false: 直接调用 config.report([errorLog])，即立即执行用户传入的 report 回调
 * - 如果 concat 为 true: 将错误推入 errorList 队列，然后调用 report(errorList)
 *   此时调用的 report 是经过 __config 防抖处理的，会在 delay 时间后统一执行一次上报并清空队列
 */
function handleError(errorLog) {
  // 是否延时处理
  if (!config.concat) {
    // 非合并模式：根据采样率决定是否立即上报
    // needReport 返回 false 时短路，不执行上报；返回 true 时执行 config.report
    !needReport(config.sampling) || config.report([errorLog]);
  } else {
    // 合并模式：推入队列，触发防抖上报
    pushError(errorLog);
    // 这里的 report 是经过 __config 处理过的防抖函数，最终会执行 index.js 传入的回调
    report(errorList);
  }
}

/**
 * 往异常信息数组里面添加一条记录
 *
 * @param  {Object} errorLog 错误日志
 */
function pushError(errorLog) {
  // 仅当采样命中且未达到最大错误数量限制时才存入队列
  if (needReport(config.sampling) && errorList.length < config.maxError) {
    errorList.push(errorLog);
  }
}

/**
 * 设置一个采样率，决定是否上报
 *
 * @param  {Number} sampling 0 - 1
 * @return {Boolean} 是否需要上报
 */
function needReport(sampling) {
  return Math.random() < (sampling || 1);
}
var _default = exports.default = monitor;
