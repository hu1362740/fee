"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
exports.setting = setting;
var _util = require("./util");
var tryJS = {};

// 导出包装函数
tryJS.wrap = wrap;
// 导出参数包装函数
tryJS.wrapArgs = tryifyArgs;

// 内部配置，用于存储错误处理回调
var config = {
  handleTryCatchError: function () {}
};

/**
 * 更新内部配置
 * @param {Object} opts 配置项，通常包含 handleTryCatchError 回调
 */
function setting(opts) {
  (0, _util.merge)(opts, config);
}

/**
 * 判断是否为函数并进行包装
 * @param {Function} func 待检查的函数
 * @return {Function} 如果是函数则返回包装后的函数，否则原样返回
 */
function wrap(func) {
  return (0, _util.isFunction)(func) ? tryify(func) : func;
}

/**
 * 将函数使用 try..catch 包装
 * 核心逻辑：在执行原函数时捕获异常，调用配置的回调函数处理错误，然后重新抛出异常
 *
 * @param  {Function} func 需要进行包装的函数
 * @return {Function} 包装后的函数
 */
function tryify(func) {
  // 确保只包装一次，避免嵌套包装
  if (!func._wrapped) {
    func._wrapped = function () {
      try {
        // 执行原函数
        return func.apply(this, arguments);
      } catch (error) {
        // 捕获异常后，调用全局配置的错误处理回调（通常是 index.js 中的 handleTryCatchError）
        config.handleTryCatchError(error);
        // 设置全局标记，防止该错误被 window.onerror 重复捕获
        window.ignoreError = true;

        // 重新抛出错误，保持原有的错误传播行为
        throw error;
      }
    };
  }
  return func._wrapped;
}

/**
 * 只对函数参数进行包装
 * 遍历传入的参数列表，对其中的函数类型参数进行 try-catch 包装
 *
 * @param  {Function} func 需要进行参数包装的函数
 * @return {Function} 新的函数，其参数已被处理
 */
function tryifyArgs(func) {
  return function () {
    // 将 arguments 转为数组，并对每个参数进行 wrap 处理
    var args = (0, _util.arrayFrom)(arguments).map(function (arg) {
      return wrap(arg);
    });

    // 使用包装后的参数调用原函数
    return func.apply(this, args);
  };
}
var _default = exports.default = tryJS;