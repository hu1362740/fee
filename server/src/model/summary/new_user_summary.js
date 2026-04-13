import Knex from '~/src/library/mysql'
import moment from 'moment'
import _ from 'lodash'
import MCityDistribution from '~/src/model/parse/city_distribution'
import Logger from '~/src/library/logger'

/**
 * 新增用户统计模型 (New User Summary)
 * 负责统计指定时间粒度（小时/天/月）内的新增用户数及其城市分布。
 * 数据通常由 Summary:NewUser 命令从 t_o_user_first_login_at 表聚合而来，存入 t_r_new_user_summary 表。
 */
const BASE_TABLE_NAME = 't_r_new_user_summary'
const TABLE_COLUMN = [
  `id`,
  `project_id`,
  `total_count`,
  `count_at_time`,
  `count_type`,
  `city_distribute_id`,
  `create_time`,
  `update_time`
]

/**
 * 获取表名
 * @return {String}
 */
function getTableName () {
  return `${BASE_TABLE_NAME}`
}

/**
 * 替换或插入新增用户汇总记录
 * 逻辑：
 * 1. 检查是否存在对应 projectId, count_at_time, count_type 的记录
 * 2. 若存在：更新总人数(total_count)和城市分布
 * 3. 若不存在：插入新的城市分布记录，然后插入主记录
 * @param {number} projectId
 * @param {number} totalCount 新增用户总数
 * @param {number} countAtTime 统计时间点
 * @param {string} countType 统计粒度
 * @param {object} cityDistribute 城市分布数据
 * @return {boolean}
 */
async function replaceInto (projectId, totalCount, countAtTime, countType, cityDistribute) {
  let tableName = getTableName()
  let updateAt = moment().unix()
  // 返回值是一个列表
  let oldRecordList = await Knex
    .select([`city_distribute_id`, `create_time`, `id`])
    .from(tableName)
    .where('project_id', '=', projectId)
    .andWhere('count_at_time', '=', countAtTime)
    .andWhere('count_type', '=', countType)
    .catch(() => {
      return []
    })
  // 利用get方法, 不存在直接返回0, 没毛病
  let id = _.get(oldRecordList, [0, 'id'], 0)
  let cityDistributeIdInDb = _.get(oldRecordList, [0, 'city_distribute_id'], 0)
  let createTimeInDb = _.get(oldRecordList, [0, 'create_time'], 0)

  let data = {
    project_id: projectId,
    count_at_time: countAtTime,
    total_count: totalCount,
    count_type: countType,
    update_time: updateAt
  }
  let isSuccess = false
  if (id > 0) {
    // 更新城市分布数据
    let isUpdateSuccess = MCityDistribution.updateCityDistributionRecord(cityDistributeIdInDb, projectId, createTimeInDb, JSON.stringify(cityDistribute))
    if (isUpdateSuccess === false) {
      return false
    }
    // 更新具体数据
    let affectRows = await Knex(tableName)
      .update(data)
      .where(`id`, '=', id)
    isSuccess = affectRows > 0
  } else {
    // 首先插入城市分布数据
    let cityDistributeId = await MCityDistribution.insertCityDistributionRecord(JSON.stringify(cityDistribute), projectId, updateAt)
    if (cityDistributeId === 0) {
      // 城市分布数据插入失败
      return false
    }
    data['city_distribute_id'] = cityDistributeId
    data['create_time'] = updateAt
    let insertResult = await Knex
      .returning('id')
      .insert(data)
      .into(tableName)
      .catch(e => { return [] })
    let insertId = _.get(insertResult, [0], 0)
    isSuccess = insertId > 0
  }
  return isSuccess
}

/**
 * 获取新增用户分布记录列表
 * 用于前端展示趋势图或详细分布
 * @param {number} projectId
 * @param {string} countType
 * @param {Array} timeList 时间列表
 * @return {Array}
 */
async function getNewUserDistribution (projectId, countType, timeList) {
  const tableName = getTableName()
  let rawRecordList = Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('project_id', projectId)
    .andWhere('count_type', countType)
    .whereIn('count_at_time', timeList)
    .catch(err => {
      Logger.error(err.message, '======getNewUserDistribution')
      return []
    })
  return rawRecordList
}
export default {
  getTableName,
  replaceInto,
  getNewUserDistribution
}
