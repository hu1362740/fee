import ParseBase from '~/src/commands/parse/base'
import moment from 'moment'
import _ from 'lodash'
import MDurationDistribution from '~/src/model/parse/duration_distribution'
import MCityDistribution from '~/src/model/parse/city_distribution'
import MUniqueView from '~/src/model/summary/unique_view'
import DATE_FORMAT from '~/src/constants/date_format'

// 合法记录类型标识
const LegalRecordType = 'product'
// 合法记录代码标识 (10001 代表停留时长)
const LegalRecordCode = 10001
// 用户停留时长不能超过两小时(避免作弊或异常数据)
const MaxAllowRecordDuringMs = 7200000 
// 用户停留时长不能小于0
const MinAllowRecordDuringMs = 0 

const COUNT_TYPE_HOUR = 'hour'
const COUNT_BY_HOUR_DATE_FORMAT = DATE_FORMAT.DATABASE_BY_HOUR

/**
 * TimeOnSiteByHour 类
 * 继承自 ParseBase，用于解析 Kafka 日志中的用户页面停留时长
 * 主要功能：
 * 1. 过滤 type='product' 且 code=10001 的记录
 * 2. 校验停留时长合理性 (0 ~ 2小时)
 * 3. 按小时、地理位置聚合停留时长 (ms)
 * 4. 结合 UV 数据，写入停留时长分布表
 * 
 * this.projectMap 数据结构说明:
 * Map<projectId, Map<countAtTime, distribution>>
 * - projectId: 项目ID (Number)
 * - countAtTime: 统计时间点，格式为 'YYYY-MM-DD HH' (String)
 * - distribution: 城市分布对象，结构为 { [country]: { [province]: { [city]: totalDurationMs } } }
 *   例如: { 'China': { 'Guangdong': { 'Shenzhen': 12000 } } }
 */
class TimeOnSiteByHour extends ParseBase {
  static get signature () {
    return `
     Parse:TimeOnSiteByHour 
     {startAtYmdHi:日志扫描范围上限${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE}格式}
     {endAtYmdHi:日志扫描范围下限${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE}格式}
     `
  }

  static get description () {
    return '[按小时] 解析kafka日志, 分析记录指定时间范围内用户停留时长'
  }

  /**
   * 判断该条记录是不是需要解析的停留时长记录
   * 校验规则：
   * 1. type='product', code=10001
   * 2. projectId 为正整数
   * 3. duration_ms 在合法范围内
   * @param {Object} record
   * @return {Boolean}
   */
  isLegalRecord (record) {
    let recordType = _.get(record, ['type'], '')
    let code = _.get(record, ['code'], '')
    let projectId = _.get(record, ['project_id'], '')
    let durationMs = _.get(record, ['detail', 'duration_ms'], '')
    code = parseInt(code)
    durationMs = parseInt(durationMs)
    projectId = parseInt(projectId)
    if (recordType !== LegalRecordType) {
      return false
    }
    if (_.isNumber(code) === false) {
      return false
    }
    if (code !== LegalRecordCode) {
      return false
    }
    if (_.isNumber(projectId) === false) {
      return false
    }
    if (projectId < 0) {
      return false
    }
    if (_.isNumber(durationMs) === false) {
      return false
    }
    if (durationMs > MaxAllowRecordDuringMs) {
      return false
    }
    if (durationMs < MinAllowRecordDuringMs) {
      return false
    }
    return true
  }

  /**
   * 处理单条记录并缓存到内存 Map 中
   * 逻辑：
   * 1. 提取 duration_ms 和地理位置
   * 2. 按小时格式化时间
   * 3. 构建嵌套结构: Map<projectId, Map<countAtTime, distribution>>
   * 4. distribution 是一个以 [country, province, city] 为路径的对象，值为累计的停留时长(ms)
   * @param {Object} record -原始日志记录对象
   * @return {Boolean} - 处理是否成功
   */
  async processRecordAndCacheInProjectMap (record) {
    // 提取项目ID
    let projectId = _.get(record, ['project_id'], 0)
    // 提取停留时长(毫秒)
    let durationMs = _.get(record, ['detail', 'duration_ms'], 0)
    // 提取地理位置信息
    let country = _.get(record, ['country'], '')
    let province = _.get(record, ['province'], '')
    let city = _.get(record, ['city'], '')
    // 提取记录时间戳
    let recordAt = _.get(record, ['time'], 0)

    //将时间戳格式化为数据库存储用的小时字符串 (例如: "2023-10-27 10")
    let countAtTime = moment.unix(recordAt).format(COUNT_BY_HOUR_DATE_FORMAT)
    // 构建地理位置路径数组，用于 lodash set/get 操作
    let distributionPath = [country, province, city]

    let countAtMap = new Map()
    let distribution = {}
    // 检查 projectMap 中是否已存在该 projectId
    if (this.projectMap.has(projectId)) {
      // 获取该项目对应的时间点 Map
      countAtMap = this.projectMap.get(projectId)
      // 检查该时间点 Map 中是否已存在当前小时
      if (countAtMap.has(countAtTime)) {
        // 获取该小时对应的城市分布对象
        distribution = countAtMap.get(countAtTime)
        // 检查该地理位置是否已有累计时长
        if (_.has(distribution, distributionPath)) {
          // 如果存在，获取旧的时长并累加
          let oldDurationMs = _.get(distribution, distributionPath, 0)
          durationMs = durationMs + oldDurationMs
        }
      }
    }
    // 将累加后的时长设置到分布对象中
    _.set(distribution, distributionPath, durationMs)
    // 更新时间点 Map
    countAtMap.set(countAtTime, distribution)
    // 更新项目 Map
    this.projectMap.set(projectId, countAtMap)
    return true
  }

  /**
   * 将内存中缓存的停留时长数据同步保存到数据库
   * 逻辑：
   * 1. 遍历 projectMap
   * 2. 计算该小时该分布下的总停留时长 (totalStayMs)
   * 3. 获取该小时该项目的总 UV (totalUv)
   * 4. 调用 MDurationDistribution.replaceUvRecord 写入数据
   * @return {Object} 统计结果
   */
  async save2DB () {
    let totalRecordCount = this.getRecordCountInProjectMap()
    let processRecordCount = 0
    let successSaveCount = 0
    for (let [projectId, countAtMap] of this.projectMap) {
      for (let [countAtTime, distribution] of countAtMap) {
        let recordList = MCityDistribution.getFlattenCityRecordListInDistribution(distribution)
        let totalStayMs = 0
        for (let record of recordList) {
          totalStayMs = totalStayMs + record
        }
        // 获取总人数
        let totalUv = await MUniqueView.getTotalUv(projectId, countAtTime, COUNT_TYPE_HOUR)
        let isSuccess = await MDurationDistribution.replaceUvRecord(projectId, totalStayMs, totalUv, countAtTime, COUNT_TYPE_HOUR, distribution)
        processRecordCount = processRecordCount + 1
        if (isSuccess) {
          successSaveCount = successSaveCount + 1
        }
        this.reportProcess(processRecordCount, successSaveCount, totalRecordCount)
      }
    }
    return { totalRecordCount, processRecordCount, successSaveCount }
  }

  /**
   * 统计 projectMap 中的记录总数
   * @return {Number}
   */
  getRecordCountInProjectMap () {
    let totalCount = 0
    for (let [projectId, countAtMap] of this.projectMap) {
      for (let [countAtTime, distribution] of countAtMap) {
        totalCount = totalCount + 1
      }
    }
    return totalCount
  }
}

export default TimeOnSiteByHour