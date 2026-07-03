import ParseBase from '~/src/commands/parse/base'
import _ from 'lodash'
import MUserFirstLoginAt from '~/src/model/parse/user_first_login_at'
import DATE_FORMAT from '~/src/constants/date_format'

/**
 * UserFirstLoginAt 类
 * 继承自 ParseBase，用于解析 Kafka 日志并记录用户的首次登录时间
 * 主要功能：
 * 1. 过滤包含有效 ucid (用户ID) 的记录
 * 2. 在内存中比较并保留最早的 first_visit_at
 * 3. 仅当数据库中不存在该 ucid 时才插入记录，确保“首次”的准确性
 */
class UserFirstLoginAt extends ParseBase {
  static get signature () {
    return `
     Parse:UserFirstLoginAt 
     {startAtYmdHi:日志扫描范围上限${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE}格式}
     {endAtYmdHi:日志扫描范围下限${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE}格式}
     `
  }

  static get description () {
    return '[按天] 解析kafka日志, 记录用户首次登陆时间'
  }

  /**
   * 判断该条记录是不是需要解析的记录
   * 校验规则：
   * 1. ucid 存在且长度在 1-20 之间
   * @param {Object} record
   * @return {Boolean}
   */
  isLegalRecord (record) {
    let ucid = _.get(record, ['common', 'ucid'], '')
    ucid = `${ucid}`
    let isLegal = ucid.length > 0 && ucid.length <= 64
    return isLegal
  }

  /**
   * 处理单条记录并缓存到内存 Map 中
   * 逻辑：
   * 1. 提取 ucid, projectId, 地理位置, 访问时间
   * 2. 构建 Map<projectId, Map<ucid, dbRecord>>
   * 3. 如果内存中已存在该 ucid，比较 first_visit_at，保留时间更早（更小）的那条记录
   * @param {Object} record
   */
  async processRecordAndCacheInProjectMap (record) {
    let ucid = _.get(record, ['common', 'ucid'], '')
    let projectId = _.get(record, ['project_id'], '')

    let country = _.get(record, ['country'], '')
    let province = _.get(record, ['province'], '')
    let city = _.get(record, ['city'], '')

    let firstVisitAt = _.get(record, ['time'], 0)

    let dbRecordMap = new Map()
    let dbRecord = {
      ucid,
      project_id: projectId,
      country,
      province,
      city,
      first_visit_at: firstVisitAt
    }
    if (this.projectMap.has(projectId)) {
      dbRecordMap = this.projectMap.get(projectId)
      if (dbRecordMap.has(ucid)) {
        let existRecord = dbRecordMap.get(ucid)
        // 只有当前记录的时间更早时，才更新内存中的记录
        if (existRecord['first_visit_at'] > dbRecord['first_visit_at']) {
          dbRecordMap.set(ucid, dbRecord)
        }
      } else {
        dbRecordMap.set(ucid, dbRecord)
      }
    }
    this.projectMap.set(projectId, dbRecordMap)
    return true
  }

  /**
   * 将内存中缓存的首次登录数据同步保存到数据库
   * 逻辑：
   * 1. 遍历 projectMap
   * 2. 批量查询数据库中已存在的 ucid 集合 (filterExistUcidSetInDb)
   * 3. 仅对数据库中不存在的 ucid 执行插入操作 (replaceInto)
   * 4. 这保证了每个用户只记录一次最早的时间
   * @return {Object} 统计结果
   */
  async save2DB () {
    let totalRecordCount = this.getRecordCountInProjectMap()
    let processRecordCount = 0
    let successSaveCount = 0
    for (let [projectId, dbRecordMap] of this.projectMap) {
      let ucidList = []
      for (let ucid of dbRecordMap.keys()) {
        ucidList.push(ucid)
      }
      let existUcidSet = await MUserFirstLoginAt.filterExistUcidSetInDb(projectId, ucidList)

      for (let [ucid, dbRecord] of dbRecordMap) {
        let {
          project_id: projectId,
          country,
          province,
          city,
          first_visit_at: firstVisitAt
        } = dbRecord

        let isSuccess = false
        ucid = `${ucid}` // 专门转成string
        if (existUcidSet.has(ucid) === false) {
          // 只有ucid不存在的时候, 才需要插入
          isSuccess = await MUserFirstLoginAt.replaceInto(projectId, ucid, firstVisitAt, country, province, city)
        }
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
    for (let [projectId, dbRecordMap] of this.projectMap) {
      for (let [ucid, dbRecord] of dbRecordMap) {
        totalCount = totalCount + 1
      }
    }
    return totalCount
  }
}

export default UserFirstLoginAt