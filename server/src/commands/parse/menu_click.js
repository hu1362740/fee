import ParseBase from '~/src/commands/parse/base'
import moment from 'moment'
import _ from 'lodash'
import MBehaviorDistribution from '~/src/model/parse/behavior_distribution'
import MCityDistribution from '~/src/model/parse/city_distribution'
import DATE_FORMAT from '~/src/constants/date_format'

// 合法记录类型标识
const LegalRecordType = 'product'
// 合法记录代码标识 (10002 代表菜单点击)
const LegalRecordCode = 10002

const COUNT_TYPE_HOUR = DATE_FORMAT.UNIT.HOUR
const COUNT_BY_HOUR_DATE_FORMAT = DATE_FORMAT.DATABASE_BY_HOUR

/**
 * MenuClick 类
 * 继承自 ParseBase，用于解析 Kafka 日志中的用户菜单点击行为
 * 主要功能：
 * 1. 过滤 type='product' 且 code=10002 的记录
 * 2. 按小时、菜单Code聚合点击次数
 * 3. 统计点击行为的地理位置分布
 * 4. 写入行为分布表
 */
class MenuClick extends ParseBase {
  static get signature () {
    return `
     Parse:MenuClick 
     {startAtYmdHi:日志扫描范围上限${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE}格式}
     {endAtYmdHi:日志扫描范围下限${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE}格式}
     `
  }

  static get description () {
    return '[按天] 解析kafka日志, 用户点击情况'
  }

  /**
   * 判断该条记录是不是需要解析的菜单点击记录
   * 校验规则：
   * 1. type 必须为 'product'
   * 2. code 必须为 10002
   * 3. projectId 必须为正整数
   * 4. detail.code (菜单代码) 不能为空
   * @param {Object} record
   * @return {Boolean}
   */
  isLegalRecord (record) {
    let recordType = _.get(record, ['type'], '')
    let code = _.get(record, ['code'], '')
    let projectId = _.get(record, ['project_id'], '')
    let menuName = _.get(record, ['detail', 'name'], '')
    let menuCode = _.get(record, ['detail', 'code'], '')
    let menuUrl = _.get(record, ['detail', 'url'], '')
    code = parseInt(code)
    menuCode = menuCode + '' // 转成字符串
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
    if (menuCode === '') {
      return false
    }
    return true
  }

  /**
   * 处理单条记录并缓存到内存 Map 中
   * 逻辑：
   * 1. 提取菜单名称、Code、URL（限制长度200）
   * 2. 按小时格式化时间
   * 3. 构建嵌套 Map 结构: Map<projectId, Map<countAtTime, Map<code, recordPackage>>>
   * 4. recordPackage 包含 distribution (城市分布计数) 和基础信息
   * @param {Object} record
   */
  async processRecordAndCacheInProjectMap (record) {
    let projectId = _.get(record, ['project_id'], '')
    let name = _.get(record, ['detail', 'name'], '')
    let code = _.get(record, ['detail', 'code'], '')
    let url = _.get(record, ['detail', 'url'], '')
    url = url + '' // 强制转换为字符串
    if (url.length > 200) {
      // url最长是200个字符
      url = url.slice(0, 200)
    }

    let country = _.get(record, ['country'], '')
    let province = _.get(record, ['province'], '')
    let city = _.get(record, ['city'], '')
    let recordAt = _.get(record, ['time'], 0)

    let countAtTime = moment.unix(recordAt).format(COUNT_BY_HOUR_DATE_FORMAT)
    let distributionPath = [country, province, city]

    let distributeCountCount = 1
    let countAtMap = new Map()
    let codeMap = new Map()
    let distribution = {}
    if (this.projectMap.has(projectId)) {
      countAtMap = this.projectMap.get(projectId)
      if (countAtMap.has(countAtTime)) {
        codeMap = countAtMap.get(countAtTime)
        if (codeMap.has(code)) {
          let recordPackage = codeMap.get(code)
          distribution = _.get(recordPackage, ['distribution'], {})
          if (_.has(distribution, distributionPath)) {
            let oldDistributeCount = _.get(distribution, distributionPath, 0)
            distributeCountCount = distributeCountCount + oldDistributeCount
          }
        }
      }
    }
    _.set(distribution, distributionPath, distributeCountCount)
    let recordPackage = {
      code,
      distribution,
      name,
      url
    }
    codeMap.set(code, recordPackage)
    countAtMap.set(countAtTime, codeMap)
    this.projectMap.set(projectId, countAtMap)
    return true
  }

  /**
   * 将内存中缓存的行为数据同步保存到数据库
   * 逻辑：
   * 1. 遍历 projectMap
   * 2. 对每个菜单 Code，计算总点击数 (totalCount)
   * 3. 调用 MBehaviorDistribution.replaceRecord 写入或更新汇总表
   * @return {Object} 统计结果
   */
  async save2DB () {
    let totalRecordCount = this.getRecordCountInProjectMap()
    let processRecordCount = 0
    let successSaveCount = 0
    for (let [projectId, countAtMap] of this.projectMap) {
      for (let [countAtTime, codeMap] of countAtMap) {
        for (let [code, recordPackage] of codeMap) {
          let { distribution, name, url } = recordPackage
          let recordList = MCityDistribution.getFlattenCityRecordListInDistribution(distribution)
          let totalCount = 0
          for (let record of recordList) {
            totalCount = totalCount + record
          }

          let isSuccess = await MBehaviorDistribution.replaceRecord(projectId, code, name, url, totalCount, countAtTime, COUNT_TYPE_HOUR, distribution)
          processRecordCount = processRecordCount + 1
          if (isSuccess) {
            successSaveCount = successSaveCount + 1
          }
          this.reportProcess(processRecordCount, successSaveCount, totalRecordCount)
        }
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
      for (let [countAtTime, codeMap] of countAtMap) {
        for (let [code, recordPackage] of codeMap) {
          totalCount = totalCount + 1
        }
      }
    }
    return totalCount
  }
}

export default MenuClick