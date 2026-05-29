import fs from 'fs'
import { readLine } from 'lei-stream'
import moment from 'moment'
import _ from 'lodash'
import commonConfig from '~/src/configs/common'
import SaveLogBase from '~/src/commands/save_log/base'
import LKafka from '~/src/library/kafka'
import path from 'path'

/**
 * NginxParseLog 类
 * 继承自 SaveLogBase，用于定时读取并解析 Nginx 访问日志文件。
 * 主要功能：
 * 1. 智能检测不同环境下的日志文件路径（Windows单文件、Linux按分钟分割等）。
 * 2. 逐行读取日志内容。
 * 3. 解析日志时间，过滤测试数据和非标准格式日志。
 * 4. 根据项目配置的抽样率进行数据过滤。
 * 5. 将合法日志分别写入 Kafka 的原始日志主题和 JSON 格式化日志主题。
 */
class NginxParseLog extends SaveLogBase {
  /**
   * 定义命令行签名
   * 命令名称: SaveLog:Nginx
   */
  static get signature() {
    return `
     SaveLog:Nginx 
     `
  }

  /**
   * 命令描述
   */
  static get description() {
    return '每一分钟读取Nginx日志文件，并解析'
  }

  /**
   * 执行命令的主入口函数
   * @param {Object} args - 命令行参数
   * @param {Object} options - 命令行选项
   */
  async execute(args, options) {
    let that = this
    // 获取项目列表配置，用于后续的项目名称映射和抽样率判断
    let projectMap = await this.getProjectMap()

    let logCounter = 0 // 总日志行数计数器
    let legalLogCounter = 0 // 合法且未因抽样被跳过的日志行数计数器
    let nginxLogFilePath = commonConfig.nginxLogFilePath // 从配置中获取 Nginx 日志根目录

    // 【修改点】智能检测多种日志文件模式，以兼容不同操作系统和部署方式
    let logAbsolutePath = null

    // 模式 1: fee-access.log (Windows 开发环境常见)
    const feeAccessLogFile = path.join(nginxLogFilePath, 'fee-access.log')
    if (fs.existsSync(feeAccessLogFile)) {
      logAbsolutePath = feeAccessLogFile
      that.log(`[兼容模式] 检测到 fee-access.log，使用 Windows 单文件模式`)
    }

    // 模式 2: access.log (标准 Nginx 默认日志文件名)
    if (!logAbsolutePath) {
      const standardAccessLogFile = path.join(nginxLogFilePath, 'access.log')
      if (fs.existsSync(standardAccessLogFile)) {
        logAbsolutePath = standardAccessLogFile
        that.log(`[兼容模式] 检测到 access.log，使用标准单文件模式`)
      }
    }

    // 模式 3: Linux 按分钟分割 (生产环境常见，路径包含 /YYYY/MM/DD/HH/mm.log)
    if (!logAbsolutePath) {
      let timeAt = moment().unix() - 60 // 获取一分钟前的时间戳，因为当前分钟的日志可能尚未完全写入或轮转
      let timeMoment = moment.unix(timeAt)
      let formatStr = timeMoment.format('/YYYY/MM/DD/HH/mm')
      let linuxStyleLogFile = `${nginxLogFilePath}${formatStr}.log`

      if (fs.existsSync(linuxStyleLogFile)) {
        logAbsolutePath = linuxStyleLogFile
        that.log(`[兼容模式] 检测到按分钟分割的日志，使用 Linux 模式`)
      }
    }

    // 如果所有尝试的路径都不存在，则记录日志并退出本次执行
    if (!logAbsolutePath || fs.existsSync(logAbsolutePath) === false) {
      that.log(`[兼容模式] log文件不存在，自动跳过。已尝试的路径:`)
      that.log(`  1. ${feeAccessLogFile}`)
      that.log(`  2. ${path.join(nginxLogFilePath, 'access.log')}`)
      that.log(`  3. ${nginxLogFilePath}YYYY/MM/DD/HH/mm.log`)
      return
    }

    /**
     * 每读取一行日志触发的回调函数
     * @param {Buffer} data - 当前行的数据
     * @param {Function} next - 继续读取下一行的回调
     */
    let onDataIn = async (data, next) => {
      logCounter++
      let content = data.toString()

      // 获取日志时间，没有原始日志时间则直接跳过
      let logCreateAt = this.parseLogCreateAt(content)
      if (_.isFinite(logCreateAt) === false || logCreateAt <= 0) {
        this.log('日志时间不合法，自动跳过')
        next()
        return
      }
      
      // 首先判断是不是测试数据，如果是测试数据，直接保存，跳过后续所有逻辑
      if (this.isTestLog(content)) {
        this.log('收到测试日志，直接保存，并跳过后续所有流程')
        let writeLogClient = this.getWriteStreamClientByType(logCreateAt, LKafka.LOG_TYPE_TEST)
        writeLogClient.write(content)
        this.log('测试日志写入完毕')
        next()
        return
      }
      
      // 检查日志格式，只录入解析后，符合规则的 log
      // parseLog 会将非结构化的 Nginx 日志转换为结构化的 JSON 对象
      let parseResult = await that.parseLog(content, projectMap)
      if (_.isEmpty(parseResult)) {
        that.log('日志格式不规范，自动跳过，原日志内容为 =>', content)
        next()
        return
      }

      // 获取项目名称，并根据项目配置的抽样率决定是否保留该条日志
      let projectName = _.get(parseResult, ['project_name'], 0)
      let projectRate = _.get(projectMap, [projectName, 'rate'], 100) // 默认抽样率 100%
      let checkFlag = _.floor(logCounter % 10000)
      let skipIt = checkFlag > projectRate
      if (skipIt) {
        // 根据项目抽样比率，过滤打点数据，如果没有命中，直接返回
        this.log(` projectName => ${projectName}, logCounter => ${logCounter}, checkFlag => ${checkFlag}, projectRate => ${projectRate}, 未命中抽样比，自动跳过`)
        next()
        return
      }
      legalLogCounter = legalLogCounter + 1

      // 存原始数据到 Kafka 的 RAW 主题
      let rawLogWriteStreamByLogCreateAt = this.getWriteStreamClientByType(logCreateAt, LKafka.LOG_TYPE_RAW)
      rawLogWriteStreamByLogCreateAt.write(content)

      // 存 JSON 数据到 Kafka 的 JSON 主题，便于后续 Parse 任务消费
      let jsonLogWriteStreamByLogCreateAt = this.getWriteStreamClientByType(logCreateAt, LKafka.LOG_TYPE_JSON)
      jsonLogWriteStreamByLogCreateAt.write(JSON.stringify(parseResult))

      // 每处理 100 条合法日志打印一次进度
      if (legalLogCounter % 100 === 0) {
        that.log(`当前共记录 ${legalLogCounter}/${logCounter} 条数据`)
      }

      next()
    }

    // 【修复】返回 Promise，确保等待文件读取完成
    // return new Promise((resolve, reject) => {
    //   readLine(fs.createReadStream(logAbsolutePath)).go(
    //     onDataIn,
    //     async () => {
    //       try {
    //         that.log(`任务执行完毕，共处理 ${logCounter} 条日志，其中合法数据 ${legalLogCounter} 条`)

    //         // 关闭所有写流
    //         await this.autoCloseOldStream(true)

    //         // 解决 Promise，标记成功
    //         resolve()
    //       } catch (error) {
    //         that.log('完成回调中发生错误:', error)
    //         reject(error)
    //       }
    //     }
    //   )
    // })

    // 使用 lei-stream 库逐行读取日志文件
    // 注意：此处未返回 Promise，依赖于流式处理的异步特性，但在某些调度框架中可能需要确保异步完成
    readLine(fs.createReadStream(logAbsolutePath)).go(
      onDataIn,
      async () => {
        // 文件读取完成后的回调
        that.log(`任务执行完毕，共处理 ${logCounter} 条日志，其中合法数据 ${legalLogCounter} 条`)

        // 关闭所有打开的 Kafka 写流，确保数据刷盘
        // await this.closeAllWriteStream()
        await this.autoCloseOldStream(true)
      }
    )
  }
}

export default NginxParseLog