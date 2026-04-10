import ParseBase from '~/src/commands/parse/base'
import moment from 'moment'
import _ from 'lodash'
import MCommon from '~/src/model/parse/common'
import DATE_FORMAT from '~/src/constants/date_format'
import DataCleaning from '~/src/commands/utils/data_cleaning'

let datacleaning = new DataCleaning()
const BaseTableName = 't_o_system_collection'

/**
 * ParseDevice 类
 * 继承自 ParseBase，用于解析 Kafka 日志中的设备详细信息（User-Agent, OS, Browser等）
 * 主要功能：
 * 1. 过滤合法的 Device 记录
 * 2. 解析 UA 字符串为结构化数据
 * 3. 数据清洗（处理旧版 SDK 兼容性问题）
 * 4. 按项目ID和月份聚合数据，并写入分表 t_o_system_collection_{projectId}
 */
class ParseDevice extends ParseBase {
  /**
   * 定义命令行签名
   * 接收开始时间和结束时间参数，格式为分钟级字符串
   */
  static get signature () {
    return `
      Parse:Device
      {startAtYmdHi:日志扫描范围上限${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE}格式}
      {endAtYmdHi:日志扫描范围下限${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE}格式}
    `
  }

  /**
   * 命令描述
   */
  static get description () {
    return '[按天] 解析kafka日志, 分析指定时间范围Device'
  }

  /**
   * 判断该条记录是不是合法的 device 记录
   * 校验规则：
   * 1. uuid 不能为空
   * 2. ua (User-Agent) 对象不能为空
   * 3. 过滤旧版打点中错误的 Chrome 版本号（固定为 537.36 或大于 537 的异常值）
   * @param {Object} record - 原始日志记录
   * @return {Boolean}
   */
  isLegalRecord (record) {
    let ua = _.get(record, ['ua'], {})
    let uuid = _.get(record, ['common', 'uuid'], '')
    let browserVersion = _.get(ua, ['browser', 'version'], '')
    if (_.isEmpty(uuid)) {
      return false
    }
    if (_.isEmpty(ua)) {
      return false
    }
    // 旧的打点UA传的有问题, chrome版本号固定写成了537.36
    if (browserVersion && browserVersion > 537) {
      return false
    }
    return true
  }

  /**
   * 处理单条记录并缓存到内存 Map 中
   * 逻辑：
   * 1. 提取设备相关信息（浏览器、引擎、设备厂商、OS等）
   * 2. 调用 DataCleaning 进行数据标准化清洗
   * 3. 将记录存入 projectMap，结构为: Map<projectId, Map<visitAtMonth, Map<uuid, deviceRecord>>>
   * @param {Object} record - 原始日志记录
   */
  async processRecordAndCacheInProjectMap (record) {
    let commonInfo = _.get(record, ['common'], {})
    let ua = _.get(record, ['ua'], {})
    let uuid = _.get(commonInfo, ['uuid'], '')
    let visitAt = _.get(record, ['time'], 0)
    let projectId = _.get(record, ['project_id'], 0)
    let country = _.get(record, ['country'], '')
    let province = _.get(record, ['province'], '')
    let city = _.get(record, ['city'], '')
    let browser = _.get(ua, ['browser', 'name'], '')
    let browserVersion = _.get(ua, ['browser', 'version'], '')
    let engine = _.get(ua, ['engine', 'name'], '')
    let engineVersion = _.get(ua, ['engine', 'version'], '')
    let deviceVendor = _.get(ua, ['device', 'vendor'], '')
    let deviceModel = _.get(ua, ['device', 'model'], '')
    let os = _.get(ua, ['os', 'name'], '')
    let osVersion = _.get(ua, ['os', 'version'], '')
    let runtimeVersion = _.get(commonInfo, ['runtime_version'], '')
    // 格式化时间为月份，用于分表键
    let visitAtMonth = moment.unix(visitAt).format(DATE_FORMAT.DATABASE_BY_MONTH)
    let deviceRecord = {
      projectId,
      visitAt,
      uuid,
      browser,
      browserVersion,
      engine,
      engineVersion,
      deviceVendor,
      deviceModel,
      os,
      osVersion,
      country,
      province,
      city,
      runtimeVersion
    }

    // 数据清洗迭代器
    // '~/src/commands/utils/data_cleaning'
    if (!datacleaning.getData(deviceRecord, 'deviceConfigDevice')) {
      return false
    }

    let visitAtMap = new Map()
    let deviceMap = new Map()
    if (this.projectMap.has(projectId)) {
      visitAtMap = this.projectMap.get(projectId)
      if (visitAtMap.has(visitAtMonth)) {
        deviceMap = visitAtMap.get(visitAtMonth)
      }
    }
    // 以 uuid 为 key 存储设备记录，后续保存时会去重或更新
    deviceMap.set(uuid, deviceRecord)
    visitAtMap.set(visitAtMonth, deviceMap)
    this.projectMap.set(projectId, visitAtMap)
    return true
  }

  /**
   * 将内存中缓存的设备数据同步保存到数据库
   * 逻辑：
   * 1. 遍历 projectMap
   * 2. 根据 projectId 确定目标分表
   * 3. 使用 replaceInto 模式写入数据，确保同一月份同一 uuid 的数据唯一性
   * @return {Object} 统计结果
   */
  async save2DB () {
    let totalRecordCount = this.getRecordCountInProjectMap()
    let processRecordCount = 0
    let successSaveCount = 0
    for (let [projectId, visitAtMap] of this.projectMap) {
      const processTableName = MCommon.getTableName(BaseTableName, MCommon.SPLIT_BY.PROJECT, projectId)
      for (let [visitAtMonth, deviceMap] of visitAtMap) {
        for (let [uuid, deviceRecord] of deviceMap) {
          let {
            visitAt
          } = deviceRecord
          const sqlParams = {
            uuid: uuid,
            browser: deviceRecord.browser,
            browser_version: deviceRecord.browserVersion,
            engine: deviceRecord.engine,
            engine_version: deviceRecord.engineVersion,
            device_vendor: deviceRecord.deviceVendor,
            device_model: deviceRecord.deviceModel,
            os: deviceRecord.os,
            os_version: deviceRecord.osVersion,
            country: deviceRecord.country,
            province: deviceRecord.province,
            city: deviceRecord.city,
            runtime_version: deviceRecord.runtimeVersion,
            visit_at_month: visitAtMonth,
            log_at: visitAt
          }
          let isSuccess = await MCommon.replaceInto({
            tableName: BaseTableName,
            splitBy: MCommon.SPLIT_BY.PROJECT,
            projectId: projectId,
            where: { 'visit_at_month': visitAtMonth, 'uuid': uuid },
            datas: sqlParams
          })
          processRecordCount = processRecordCount + 1
          if (isSuccess) {
            successSaveCount = successSaveCount + 1
          }
          this.reportProcess(processRecordCount, successSaveCount, totalRecordCount, processTableName)
        }
      }
    }
    return { totalRecordCount, processRecordCount, successSaveCount }
  }

  /**
   * 统计 projectMap 中缓存的记录总数
   * @return {Number}
   */
  getRecordCountInProjectMap () {
    let totalCount = 0
    for (let [projectId, visitAtMap] of this.projectMap) {
      for (let [visitAtMonth, deviceMap] of visitAtMap) {
        for (let [uuid, deviceRecord] of deviceMap) {
          totalCount = totalCount + 1
        }
      }
    }
    return totalCount
  }
}

export default ParseDevice