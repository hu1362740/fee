import Knex from '~/src/library/mysql'
import moment from 'moment'
import _ from 'lodash'

const BASE_TABLE_NAME = 't_o_user_first_login_at'
const TABLE_COLUMN = [
  `id`,
  `ucid`,
  `first_visit_at`,
  `country`,
  `province`,
  `city`,
  `create_time`,
  `update_time`
]

/**
 * 获取表名
 * 用户首次登录表按项目ID分表，格式为: t_o_user_first_login_at_{projectId}
 * @param {number} projectId 项目id
 * @return {String}
 */
function getTableName (projectId) {
  return `${BASE_TABLE_NAME}_${projectId}`
}

/**
 * 获取指定时间范围内的用户首次登录记录列表
 * @param {number} projectId
 * @param {number} startAt 开始时间戳
 * @param {number} endAt 结束时间戳
 * @return {Array}
 */
async function getList (projectId, startAt, endAt) {
  let tableName = getTableName(projectId)
  let recordList = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('first_visit_at', '>=', startAt)
    .andWhere('first_visit_at', '<=', endAt)
    .catch(e => {
      return []
    })
  return recordList
}

/**
 * 替换或插入用户首次登录记录
 * 核心逻辑：
 * 1. 如果用户已存在，且数据库中的 first_visit_at 晚于传入的 firstVisitAt，则更新为更早的时间
 * 2. 如果用户已存在，但数据库中的时间更早或相等，则不操作（保持最早记录）
 * 3. 如果用户不存在，则插入新记录
 * @param {number} projectId
 * @param {string} ucid 用户ID
 * @param {number} firstVisitAt 首次访问时间戳
 * @param {string} country
 * @param {string} province
 * @param {string} city
 * @return {boolean} 操作是否成功
 */
async function replaceInto (projectId, ucid, firstVisitAt, country, province, city) {
  let tableName = getTableName(projectId)
  let updateAt = moment().unix()
  // 返回值是一个列表
  let oldRecordList = await Knex
    .select([`id`, `first_visit_at`])
    .from(tableName)
    .where('ucid', '=', ucid)
    .catch(() => {
      return []
    })
  // 利用get方法, 不存在直接返回0, 没毛病
  let id = _.get(oldRecordList, [0, 'id'], 0)
  let oldFirstVisitAt = _.get(oldRecordList, [0, 'first_visit_at'], 0)
  let data = {
    ucid,
    first_visit_at: firstVisitAt,
    country,
    province,
    city,
    update_time: updateAt
  }
  let isSuccess = false
  if (id > 0) {
    if (oldFirstVisitAt > 0 && oldFirstVisitAt > firstVisitAt) {
      // 有更新的数据时更新一下（即发现更早的登录时间）
      let affectRows = await Knex(tableName)
        .update(data)
        .where(`id`, '=', id)
      isSuccess = affectRows > 0
    } else {
      // 数据库中记录的时间更早或相等，无需更新
      return true
    }
  } else {
    data['create_time'] = updateAt
    let insertResult = await Knex.returning('id')
      .insert(data)
      .into(tableName)
      .catch(e => {
        return []
      })
    let insertId = _.get(insertResult, [0], 0)
    isSuccess = insertId > 0
  }
  return isSuccess
}

/**
 * 过滤出数据库中已存在的UCID集合
 * 用于批量处理时快速判断哪些用户需要插入，哪些已存在
 * @param {*} projectId
 * @param {*} allUcidList 待检查的UCID列表
 * @returns {Set<String>} 已存在的UCID集合
 */
async function filterExistUcidSetInDb (projectId, allUcidList) {
  let tableName = getTableName(projectId)
  let rawRecordList = await Knex
    .select('ucid')
    .from(tableName)
    .whereIn('ucid', allUcidList)
  let existUcidSet = new Set()
  for (let rawRecord of rawRecordList) {
    let ucid = _.get(rawRecord, ['ucid'], '')
    existUcidSet.add(ucid)
  }
  return existUcidSet
}

export default {
  getTableName,

  getList,
  filterExistUcidSetInDb,
  replaceInto
}