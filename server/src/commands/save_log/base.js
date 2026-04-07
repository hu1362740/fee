import Base from '~/src/commands/base'
import fs from 'fs'
import { writeLine } from 'lei-stream'
import md5 from 'md5'
import moment from 'moment'
import shell from 'shelljs'
import parser from 'ua-parser-js'
import queryString from 'query-string'
import Util from '~/src/library/utils/modules/util'
import _ from 'lodash'
import MProject from '~/src/model/project/project'
import LKafka from '~/src/library/kafka'
import path from 'path'

// 用于缓存不同时间片的 JSON 日志写入流，Key 为文件路径，Value 为 WriteStream 对象
let jsonWriteStreamPool = new Map()
// 用于缓存不同时间片的原始日志写入流，Key 为文件路径，Value 为 WriteStream 对象
let rawLogWriteStreamPool = new Map()
// 测试日志的特殊标识符，用于在解析或处理时识别并可能过滤/特殊处理测试数据
const TEST_LOG_FLAG = 'b47ca710747e96f1c523ebab8022c19e9abaa56b'

class SaveLogBase extends Base {

  /**
   * 获取当前活跃的 JSON 日志写入流数量
   * @returns {number}
   */
  get jsonWriteStreamPoolSize() {
    return jsonWriteStreamPool.size || 0
  }

  /**
   * 获取当前活跃的原始日志写入流数量
   * @returns {number}
   */
  get rawLogWriteStreamPoolSize() {
    return rawLogWriteStreamPool.size || 0
  }

  /**
   * 判断日志内容是否包含测试标识
   * @param {string} content - 日志原始内容
   * @returns {boolean}
   */
  isTestLog(content) {
    return content.includes(TEST_LOG_FLAG)
  }

  /**
   * 根据时间戳和日志类型获取对应的文件写入流
   * 如果该时间片和类型的流已存在则复用，否则创建新的流并加入缓存池
   * 同时确保日志目录存在
   * @param {number} nowAt - 当前 Unix 时间戳
   * @param {string} logType - 日志类型，默认为原始日志 (LKafka.LOG_TYPE_RAW)，可选 JSON 或 TEST
   * @returns {WriteStream} 文件写入流对象
   */
  getWriteStreamClientByType(nowAt, logType = LKafka.LOG_TYPE_RAW) {
    // 确保logType一定是指定类型
    switch (logType) {
      case LKafka.LOG_TYPE_RAW:
        break
      case LKafka.LOG_TYPE_JSON:
        break
      case LKafka.LOG_TYPE_TEST:
        break
      default:
        logType = LKafka.LOG_TYPE_RAW
    }
    // 根据时间戳和类型生成绝对文件路径
    let nowAtLogUri = LKafka.getAbsoluteLogUriByType(nowAt, logType)
    // 创建对应路径，确保目录存在
    let logPath = path.dirname(nowAtLogUri)
    shell.mkdir('-p', logPath)
    let nowAtWriteStream = null
    // 检查缓存池中是否已有该路径的流
    if (jsonWriteStreamPool.has(nowAtLogUri)) {
      nowAtWriteStream = jsonWriteStreamPool.get(nowAtLogUri)
    } else {
      // 创建新的追加模式写入流，并使用 writeLine包装以支持按行写入
      nowAtWriteStream = writeLine(fs.createWriteStream(nowAtLogUri, { flags: 'a' }), {
        // 换行符，默认\n
        newline: '\n',
        encoding: null,
        cacheLines: 0 // 直接落磁盘，不缓存行，保证实时性
      })
      // 将新创建的流加入缓存池
      jsonWriteStreamPool.set(nowAtLogUri, nowAtWriteStream)
    }
    return nowAtWriteStream
  }

  /**
   * 自动关闭过期的文件写入流
   * 保留最近 10 分钟内的流，关闭更早的流以释放文件句资源
   * @param {boolean} isCloseAll - 是否关闭所有流（用于服务停止等场景），默认为 false
   * @returns {boolean}
   */
  autoCloseOldStream(isCloseAll = false) {
    let nowAt = moment().unix()
    // 定义存活时间窗口：最近 10 分钟
    let startAt = nowAt - 60 * 10
    let finishAt = nowAt
    let survivalSet = new Set()
    // 构建需要保留的文件路径集合
    for (let survivalAt = startAt; survivalAt < finishAt; survivalAt = survivalAt + 1) {
      let survivalAtLogUri = LKafka.getAbsoluteLogUriByType(survivalAt, LKafka.LOG_TYPE_JSON)
      let survivalAtRawLogUri = LKafka.getAbsoluteLogUriByType(survivalAt, LKafka.LOG_TYPE_RAW)
      if (isCloseAll === false) {
        survivalSet.add(survivalAtLogUri)
        survivalSet.add(survivalAtRawLogUri)
      }
    }

    let needCloseLogUriSet = new Set()
    // 遍历 JSON 流缓存池，找出不在存活集合中的过期流
    for (let testLogFileUri of jsonWriteStreamPool.keys()) {
      if (survivalSet.has(testLogFileUri) === false) {
        needCloseLogUriSet.add(testLogFileUri)
      }
    }
    // 依次关闭过期的 JSON 流并从缓存中移除
    for (let closeLogUri of needCloseLogUriSet) {
      let needCloseStream = jsonWriteStreamPool.get(closeLogUri)
      jsonWriteStreamPool.delete(closeLogUri)
      needCloseStream.end()
    }

    // 重复一次，处理原始日志流
    needCloseLogUriSet.clear()
    for (let testLogFileUri of rawLogWriteStreamPool.keys()) {
      if (survivalSet.has(testLogFileUri) === false) {
        needCloseLogUriSet.add(testLogFileUri)
      }
    }
    for (let closeLogUri of needCloseLogUriSet) {
      let needCloseStream = rawLogWriteStreamPool.get(closeLogUri)
      rawLogWriteStreamPool.delete(closeLogUri)
      needCloseStream.end()
    }

    return true
  }

  /**
   * 从数据库获取项目列表并构建映射关系
   * Key: 项目名称 (pid), Value: { id: 项目ID, rate: 采样率 }
   * @returns {object} 项目映射表
   */
  async getProjectMap() {
    let projectList = await MProject.getList()
    let projectMap = {}
    for (let project of projectList) {
      projectMap[project.project_name] = {
        id: project.id,
        rate: project.rate
      }
    }
    this.log('项目列表获取成功 =>', projectMap)
    return projectMap
  }

  /**
   * 从原始日志字符串中解析出日志产生的时间戳
   * 优先使用日志内容中的时间字段，若解析失败或格式不规范，则返回当前服务器时间或0
   * 注意：客户端上报的时间不可信，此处主要依赖日志接入时的服务器时间或日志内部标准时间
   * @param {String} data - 原始日志字符串
   * @return {Number} Unix 时间戳
   */
  parseLogCreateAt(data) {
    let nowAt = moment().unix()
    if (_.isString(data) === false) {
      return nowAt
    }
    // 假设日志格式为 Tab 分隔，第0位通常是时间
    const info = data.split('\t')
    let url = _.get(info, [15], '')

    // 尝试从 URL 参数中解析打点数据，兼容旧版 SDK 字段
    const urlQS = queryString.parseUrl(url)
    let record = _.get(urlQS, ['query', 'd'], '[]')

    try {
      record = JSON.parse(record)
    } catch (err) {
      return nowAt
    }
    if (_.has(record, ['pub'])) {
      // common是新sdk的字段值, pub是旧值, 这里做下兼容
      record.common = record.pub
    }

    // 解析日志第一列的时间字符串
    let logAtMoment = moment(info[0], moment.ISO_8601)
    let logAt = 0
    if (moment.isMoment(logAtMoment) && logAtMoment.isValid()) {
      logAt = logAtMoment.unix()
    } else {
      this.log(`无法解析日志记录时间 => ${info[0]}, 自动跳过`)
    }
    return logAt
  }

  /**
   * 将原始日志字符串解析为标准化的记录对象
   * 包含数据清洗、合法性校验、UA解析、IP地理位置解析等步骤
   * @param {string} data - 原始日志字符串
   * @param {object} projectMap - 项目名称到项目ID及配置的映射表
   * @returns {object|null} 解析后的记录对象，若解析失败或数据非法则返回 null
   */
  async parseLog(data, projectMap) {
    const info = data.split('\t')
    let url = _.get(info, [15], '')

    // 从 URL 参数中提取打点数据 'd'
    const urlQS = queryString.parseUrl(url)
    let record = _.get(urlQS, ['query', 'd'], '[]')

    try {
      record = JSON.parse(record)
    } catch (err) {
      this.log('==== 打点数据异常 ====', err)
      return null
    }

    // 记录日志内容的 MD5，用于后续去重
    record.md5 = md5(data)
    if (_.has(record, ['pub'])) {
      // common是新sdk的字段值, pub是旧值, 这里做下兼容
      record.common = record.pub
    }
    //  过滤不合法的打点数据
    //  记录为空, 没有pid, pid没有注册过, 都是非法数据
    if (_.isEmpty(record)) {
      this.log('record 不规范 =>', record)
      return null
    }
    if (_.has(record, ['common', 'pid']) === false) {
      this.log('pid 不存在 =>', record)
      return null
    }
    if (record.common.pid === '') {
      this.log('记录中没有record.common.pid  =>', record.common.pid)
      return null
    }
    // 校验项目 ID 是否在已注册的项目列表中
    if (_.has(projectMap, [record.common.pid]) === false) {
      this.log('项目尚未注册projectMap[record.common.pid] =>', projectMap, record.common.pid)
      return null
    }
    // 补充项目 ID 和名称到记录中
    record.project_id = projectMap[record.common.pid]['id']
    record.project_name = record.common.pid
    
    let currentAt = moment().unix() // ← 当前服务器时间
    let logCreateAt = this.parseLogCreateAt(data) // ← 日志中的时间
    
    // 时间合法性校验：如果日志时间与当前服务器时间相差超过 10 天，视为异常数据丢弃
    // Kafka 中通常只保留近期数据，过大偏差可能意味着时钟错误或脏数据
    if (Math.abs(logCreateAt - currentAt) > 864000) {
      this.log('入库时间超出阈值, 自动跳过 finialTimeAt=>', logCreateAt)
      return null
    }
    record.time = logCreateAt

    // 新版中info[17] 里有%号, 是非法字符, 需要提前处理，然后解析 User-Agent
    let safeInfo17 = _.replace(info[17], '%', '')
    record.ua = parser(decodeURIComponent(safeInfo17))

    // 兼容处理saas系统打点UA问题, nwjs低版本下获取不到chrome的版本, 解析拿到的为chromium_ver
    let browserVersion = _.get(record.ua, ['browser', 'version'], '')
    if (browserVersion === 'chromium_ver') {
      _.set(record.ua, ['browser', 'version'], '50.0.2661.102')
      _.set(record.ua, ['browser', 'major'], '50')
    }

    // 解析IP地址，映射成城市信息
    record.ip = info[3] || info[4]
    const location = await Util.ip2Locate(record.ip)
    record.country = location.country
    record.province = location.province
    record.city = location.city
    return record
  }
}

export default SaveLogBase