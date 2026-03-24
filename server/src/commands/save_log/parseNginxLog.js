import fs from 'fs'
import { readLine } from 'lei-stream'
import moment from 'moment'
import _ from 'lodash'
import commonConfig from '~/src/configs/common'
import SaveLogBase from '~/src/commands/save_log/base'
import LKafka from '~/src/library/kafka'
import path from 'path'

class NginxParseLog extends SaveLogBase {
  static get signature() {
    return `
     SaveLog:Nginx 
     `
  }

  static get description() {
    return '每一分钟读取Nginx日志文件，并解析'
  }

  async execute(args, options) {
    let that = this
    // 获取项目列表
    let projectMap = await this.getProjectMap()

    let logCounter = 0
    let legalLogCounter = 0
    let nginxLogFilePath = commonConfig.nginxLogFilePath

    // 【修改点】智能检测多种日志文件模式
    let logAbsolutePath = null

    // 模式 1: fee-access.log (Windows)
    const feeAccessLogFile = path.join(nginxLogFilePath, 'fee-access.log')
    if (fs.existsSync(feeAccessLogFile)) {
      logAbsolutePath = feeAccessLogFile
      that.log(`[兼容模式] 检测到 fee-access.log，使用 Windows 单文件模式`)
    }

    // 模式 2: access.log (标准)
    if (!logAbsolutePath) {
      const standardAccessLogFile = path.join(nginxLogFilePath, 'access.log')
      if (fs.existsSync(standardAccessLogFile)) {
        logAbsolutePath = standardAccessLogFile
        that.log(`[兼容模式] 检测到 access.log，使用标准单文件模式`)
      }
    }

    // 模式 3: Linux 按分钟分割 (原逻辑)
    if (!logAbsolutePath) {
      let timeAt = moment().unix() - 60
      let timeMoment = moment.unix(timeAt)
      let formatStr = timeMoment.format('/YYYY/MM/DD/HH/mm')
      let linuxStyleLogFile = `${nginxLogFilePath}${formatStr}.log`

      if (fs.existsSync(linuxStyleLogFile)) {
        logAbsolutePath = linuxStyleLogFile
        that.log(`[兼容模式] 检测到按分钟分割的日志，使用 Linux 模式`)
      }
    }

    // 文件不存在时的处理
    if (!logAbsolutePath || fs.existsSync(logAbsolutePath) === false) {
      that.log(`[兼容模式] log文件不存在，自动跳过。已尝试的路径:`)
      that.log(`  1. ${feeAccessLogFile}`)
      that.log(`  2. ${path.join(nginxLogFilePath, 'access.log')}`)
      that.log(`  3. ${nginxLogFilePath}YYYY/MM/DD/HH/mm.log`)
      return
    }

    let onDataIn = async (data, next) => {
      logCounter++
      let content = data.toString()

      // 获取日志时间，没有原始日志时间则直接跳过
      let logCreateAt = this.parseLogCreateAt(content)
      if (_.isFinite(logCreateAt) === false || logCreateAt <= 0) {
        this.log('日志时间不合法，自动跳过')
        return
      }
      // 首先判断是不是测试数据，如果是测试数据，直接保存，跳过后续所有逻辑
      if (this.isTestLog(content)) {
        this.log('收到测试日志，直接保存，并跳过后续所有流程')
        let writeLogClient = this.getWriteStreamClientByType(logCreateAt, LKafka.LOG_TYPE_TEST)
        writeLogClient.write(content)
        this.log('测试日志写入完毕')
        return
      }
      // 检查日志格式，只录入解析后，符合规则的 log
      let parseResult = await that.parseLog(content, projectMap)
      if (_.isEmpty(parseResult)) {
        that.log('日志格式不规范，自动跳过，原日志内容为 =>', content)
        return
      }

      let projectName = _.get(parseResult, ['project_name'], 0)
      let projectRate = _.get(projectMap, [projectName, 'rate'], 100)
      let checkFlag = _.floor(logCounter % 10000)
      let skipIt = checkFlag > projectRate
      if (skipIt) {
        // 根据项目抽样比率，过滤打点数据，如果没有命中，直接返回
        this.log(` projectName => ${projectName}, logCounter => ${logCounter}, checkFlag => ${checkFlag}, projectRate => ${projectRate}, 未命中抽样比，自动跳过`)
        return
      }
      legalLogCounter = legalLogCounter + 1

      // 存原始数据
      let rawLogWriteStreamByLogCreateAt = this.getWriteStreamClientByType(logCreateAt, LKafka.LOG_TYPE_RAW)
      rawLogWriteStreamByLogCreateAt.write(content)

      // 存 JSON 数据
      let jsonLogWriteStreamByLogCreateAt = this.getWriteStreamClientByType(logCreateAt, LKafka.LOG_TYPE_JSON)
      jsonLogWriteStreamByLogCreateAt.write(JSON.stringify(parseResult))

      if (legalLogCounter % 100 === 0) {
        that.log(`当前共记录 ${legalLogCounter}/${logCounter} 条数据`)
      }

      next()
    }

    readLine(fs.createReadStream(logAbsolutePath)).go(
      onDataIn,
      async () => {
        that.log(`任务执行完毕，共处理 ${logCounter} 条日志，其中合法数据 ${legalLogCounter} 条`)

        // 关闭所有写流
        // await this.closeAllWriteStream()
        await this.autoCloseOldStream(true)
      }
    )
  }
}

export default NginxParseLog