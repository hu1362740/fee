/**
 * ============================================================================
 * Base 命令基类
 * ============================================================================
 * 文件路径：d:\mywork\demo\fee-pro\server\src\commands\base.js
 * 
 * 作用：
 * 1. 继承自 @adonisjs/ace 的 Command 类，提供命令行命令的基础功能
 * 2. 封装通用的日志输出方法（log/warn）
 * 3. 统一异常处理机制（所有子类命令都会自动捕获异常并报警）
 * 4. 提供命令签名的模板（子类需要覆盖 signature 和 description）
 * 
 * 使用方式：
 * - 所有命令类都继承 Base 类
 * - 子类只需实现 execute() 方法即可
 * - 自动获得 log()、warn()、handle() 等通用能力
 * 
 * @author ke-fe
 * @since 2017
 */

// ============================================================================
// 依赖引入
// ============================================================================

/**
 * @adonisjs/ace 的 Command 类
 * 这是 AdonisJS 框架的命令行工具核心类
 * 提供了命令注册、参数解析、帮助信息等基础能力
 */
import { Command } from '@adonisjs/ace'

/**
 * Lodash 工具库
 * 提供常用的 JavaScript 工具函数（如类型判断、对象操作等）
 */
import _ from 'lodash'

/**
 * Moment.js 时间处理库
 * 用于日期时间的格式化、计算、解析等操作
 */
import moment from 'moment'

/**
 * 项目自定义的日期格式常量
 * 包含各种时间格式定义（如 DISPLAY_BY_MILLSECOND = 'YYYY-MM-DD HH:mm:ss.SSS'）
 */
import DATE_FORMAT from '~/src/constants/date_format'

/**
 * 项目日志模块
 * 提供文件日志写入能力（基于 log4js）
 */
import Logger from '~/src/library/logger'

/**
 * 报警通知模块
 * 用于发送企业微信/钉钉等报警消息
 */
import Alert from '~/src/library/utils/modules/alert'

/**
 * 报警接收人配置
 * 定义了默认的报警接收人列表（UCID 列表）
 */
import WatchIdList from '~/src/configs/alarm'

// ============================================================================
// Base 类定义
// ============================================================================

/**
 * Base 命令基类
 * 
 * 设计模式：
 * 1. 模板方法模式：handle() 定义执行流程，子类实现 execute() 具体逻辑
 * 2. 装饰器模式：log()/warn() 增强原生 console.log，添加时间和类名前缀
 */
class Base extends Command {
  /**
   * ========================================================================
   * 静态属性：命令签名（signature）
   * ========================================================================
   * 
   * 作用：定义命令的名称、参数、选项
   * 格式说明：
   * - 第一行：命令名称（如 Parse:Base）
   * - 空行：分隔符
   * - {--optionName}: 可选参数
   * - {--optionName=@value}: 必选参数（需要传值）
   * - {--optionName?=@value}: 可选参数（需要传值）
   * 
   * 示例：
   * 启动命令：node dist/fee.js Parse:Base --onlyFlag=true --logName=access.log
   * 
   * @type {string}
   */
  static get signature() {
    return `
     Parse:Base
     
     {--onlyFlag:[必传]flag,只有 true/false 两个值} 
     {--logName=@value:[必传]日志文件名} 
     {--isTest?=@value:[可选]是否处于测试环境}
     `
  }

  /**
   * ========================================================================
   * 静态属性：命令描述（description）
   * ========================================================================
   * 
   * 作用：当用户执行 node dist/fee.js help Parse:Base 时显示的帮助信息
   * 
   * @type {string}
   */
  static get description() {
    return '解析 kafka 日志，Base'
  }

  /**
   * ========================================================================
   * 核心方法：handle() - 命令入口函数
   * ========================================================================
   * 
   * 作用：
   * 1. 这是 AdonisJS Ace 框架调用的入口方法
   * 2. 提供最外层的异常捕获，确保任何错误都能被记录和报警
   * 3. 记录命令的开始和结束时间
   * 
   * 执行流程：
   * command start → execute() → command finish
   *                    ↓
   *              (如果出错) catch error → 发送报警
   * 
   * @param {Array} args      - 位置参数数组（如 ['Parse:Monitor', '2024-01-01 10:00', '2024-01-01 10:05']）
   * @param {Object} options  - 选项参数对象（如 { onlyFlag: 'true', logName: 'access.log' }）
   * @returns {Promise<void>}
   * 
   * @example
   * // 命令行执行：
   * node dist/fee.js Parse:Monitor "2024-01-01 10:00" "2024-01-01 10:05"
   * 
   * // 对应参数：
   * args = ['2024-01-01 10:00', '2024-01-01 10:05']
   * options = {}
   */
  async handle(args, options) {
    // 记录命令开始
    this.log('command start')

    // 执行具体的业务逻辑（由子类实现的 execute() 方法）
    // 使用 .catch() 捕获所有异常，避免进程崩溃
    await this.execute(args, options).catch(e => {
      // 发生异常时的处理流程

      // 1. 发送报警消息到默认接收人列表
      // e.stack 是完整的错误堆栈信息
      Alert.sendMessage(WatchIdList.WATCH_UCID_LIST_DEFAULT, e.stack)

      // 2. 记录错误日志
      this.log('catch error')
      this.log(e.stack)
    })

    // 记录命令结束（无论成功还是失败都会执行到这里）
    this.log('command finish')
  }

  /**
   * ========================================================================
   * 抽象方法：execute() - 子类必须覆盖的核心方法
   * ========================================================================
   * 
   * 作用：
   * 1. 这是每个命令真正执行业务逻辑的地方
   * 2. 子类必须覆盖此方法，否则什么都不做
   * 3. 所有的业务代码都应该写在这里面
   * 
   * @param {Array} args      - 位置参数数组
   * @param {Object} options  - 选项参数对象
   * @returns {Promise<any>}  - 可以返回任意值（通常不需要返回值）
   * 
   * @example
   * // 子类实现示例：
   * class ParseMonitor extends Base {
   *   static get signature() {
   *     return `
   *      Parse:Monitor
   *      {startAtYmdHi:开始时间}
   *      {endAtYmdHi:结束时间}
   *     `
   *   }
   * 
   *   async execute(args, options) {
   *     const { startAtYmdHi, endAtYmdHi } = args
   *     // 具体的解析逻辑...
   *   }
   * }
   */
  async execute(args, options) {
    // 空实现，等待子类覆盖
    // 如果子类没有覆盖此方法，则什么都不做
  }

  /**
   * ========================================================================
   * 工具方法：log() - 标准日志输出
   * ========================================================================
   * 
   * 作用：
   * 1. 封装 console.log，添加时间戳和类名前缀
   * 2. 同时输出到控制台和日志文件
   * 3. 支持多个参数，自动拼接为字符串
   * 
   * 输出格式：
   * [YYYY-MM-DD HH:mm:ss.SSS]-[ClassName] message1message2...
   * 
   * @param {...any} arguments - 可变参数（可以是任意类型）
   * @returns {null}
   * 
   * @example
   * // 用法示例：
   * this.log('命令开始执行')
   * this.log('项目 ID:', projectId, '项目名称:', projectName)
   * this.log({ data: [1, 2, 3] })  // 对象会自动 JSON.stringify
   * 
   * // 输出示例：
   * [2024-01-01 12:05:30.123]-[ParseMonitor] 命令开始执行
   * [2024-01-01 12:05:31.456]-[ParseMonitor] 项目 ID: 1 项目名称：platform-test
   */
  async log() {
    // 初始化消息字符串
    let message = ''

    // 遍历所有传入的参数
    for (let rawMessage of arguments) {
      // 判断参数类型
      if (_.isString(rawMessage) === false) {
        // 如果不是字符串，转为 JSON 字符串（方便打印对象/数组）
        message = message + JSON.stringify(rawMessage)
      } else {
        // 如果是字符串，直接拼接
        message = message + rawMessage
      }
    }

    // 获取当前时间（精确到毫秒）
    let triggerAt = moment().format(DATE_FORMAT.DISPLAY_BY_MILLSECOND)

    // 输出到控制台（带时间戳和类名前缀）
    console.log(`[${triggerAt}]-[${this.constructor.name}] ` + message)

    // 获取当前命令专用的 logger 实例
    // getLogger4Command 会为每个命令类创建一个独立的 logger
    let logger = Logger.getLogger4Command(this.constructor.name)

    // 写入日志文件（info 级别）
    logger.info(message)
  }

  /**
   * ========================================================================
   * 工具方法：warn() - 警告日志输出
   * ========================================================================
   * 
   * 作用：
   * 1. 与 log() 类似，但用于输出警告信息
   * 2. 使用 console.warn 而非 console.log（在控制台中显示为黄色/红色）
   * 3. 写入日志文件时使用 warn 级别
   * 
   * 输出格式：
   * [YYYY-MM-DD HH:mm:ss.SSS]-[ClassName] message1message2...
   * 
   * @param {...any} arguments - 可变参数（可以是任意类型）
   * @returns {null}
   * 
   * @example
   * // 用法示例：
   * this.warn('参数不正确，自动退出')
   * this.warn('检测到残留进程:', pidList)
   * 
   * // 输出示例（控制台会有警告色）：
   * [2024-01-01 12:05:30.123]-[TaskManager] 参数不正确，自动退出
   */
  async warn() {
    // 初始化消息字符串
    let message = ''

    // 遍历所有传入的参数
    for (let rawMessage of arguments) {
      // 判断参数类型
      if (_.isString(rawMessage) === false) {
        // 如果不是字符串，转为 JSON 字符串
        message = message + JSON.stringify(rawMessage)
      } else {
        // 如果是字符串，直接拼接
        message = message + rawMessage
      }
    }

    // 获取当前时间（精确到毫秒）
    let triggerAt = moment().format(DATE_FORMAT.DISPLAY_BY_MILLSECOND)

    // 输出到控制台（使用 console.warn，通常显示为黄色/红色）
    console.warn(`[${triggerAt}]-[${this.constructor.name}] ` + message)

    // 获取当前命令专用的 logger 实例
    let logger = Logger.getLogger4Command(this.constructor.name)

    // 写入日志文件（warn 级别）
    logger.warn(message)
  }
}

// ============================================================================
// 导出模块
// ============================================================================

/**
 * 导出 Base 类作为默认导出
 * 其他文件可以通过 import Base from './base' 引入
 */
export default Base