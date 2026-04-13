import Knex from '~/src/library/mysql'
import moment from 'moment'
import _ from 'lodash'
import MCityDistribution from '~/src/model/parse/city_distribution'
import DATE_FORMAT from '~/src/constants/date_format'
import DatabaseUtil from '~/src/library/utils/modules/database'
import Logger from '~/src/library/logger'
// 统计类别

/**
 * UV汇总模型 (Unique View Summary)
 * 负责管理和操作 t_r_unique_view 表，该表存储了按不同时间粒度（小时/天/月）聚合后的独立访客数(UV)及城市分布数据。
 * 数据来源通常由 Summary:UV 命令任务生成。
 */
const BASE_TABLE_NAME = 't_r_unique_view'
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
 * @param {number} projectId 项目id
 * @param {number} createTimeAt 创建时间, 时间戳
 * @return {String}
 */
function getTableName () {
  return BASE_TABLE_NAME
}

/**
 * 自动创建或替换 UV 汇总记录
 * 逻辑：
 * 1. 根据 projectId, count_at_time, count_type 查找是否存在记录
 * 2. 若存在：更新总UV数(total_count)，并更新关联的城市分布详情(city_distribute_id指向的数据)
 * 3. 若不存在：先插入城市分布JSON到 t_r_city_distribution 表，获取ID后，再插入主记录
 * @param {number} projectId 项目ID
 * @param {number} totalCount 该时间窗口内的去重UV总数
 * @param {number} countAtTime 统计时间点格式化字符串 (如 '2023-10-27')
 * @param {string} countType 统计粒度 (hour/day/month)
 * @param {object} cityDistribute 城市分布对象 { country: { province: { city: count } } }
 * @return {boolean} 操作是否成功
 */
async function replaceUvRecord (projectId, totalCount, countAtTime, countType, cityDistribute) {
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
    data['total_count'] = totalCount
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
 * 获取单条 UV 汇总记录
 * @param {number} projectId
 * @param {string} countAtTime
 * @param {string} countType
 * @return {object}
 */
async function getRecord (projectId, countAtTime, countType) {
  let tableName = getTableName()
  let recordList = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('project_id', '=', projectId)
    .andWhere('count_at_time', '=', countAtTime)
    .andWhere('count_type', '=', countType)
    .catch(e => {
      return []
    })
  return _.get(recordList, [0], {})
}

/**
 * 获取指定时间粒度的总 UV 数，若记录不存在则返回 0
 * @param {number} projectId
 * @param {string} countAtTime
 * @param {string} countType
 * @return {number}
 */
async function getTotalUv (projectId, countAtTime, countType) {
  let record = await getRecord(projectId, countAtTime, countType)
  return _.get(record, ['total_count'], 0)
}

/**
 * 获取一段时间范围内的 UV 总和
 * 注意：此方法目前硬编码查询 count_type 为 HOUR 的记录进行累加，适用于从小时数据聚合到天/月的场景
 * @param {number} projectId
 * @param {number} startAt 开始时间戳
 * @param {number} finishAt 结束时间戳
 * @returns {Number} 累计 UV 数
 */
async function getUVInRange (projectId, startAt, finishAt) {
  let startAtMoment = moment.unix(startAt).format(DATE_FORMAT.DATABASE_BY_HOUR)
  let finishAtMoment = moment.unix(finishAt).format(DATE_FORMAT.DATABASE_BY_HOUR)
  let tableName = getTableName(projectId, startAt)
  let rawRecord = await Knex
    .from(tableName)
    .sum('total_count as total')
    .where('count_type', '=', DATE_FORMAT.UNIT.HOUR)
    .where('count_at_time', '>', startAtMoment)
    .andWhere('count_at_time', '<', finishAtMoment)
    .catch(e => {
      return 0
    })
  let totalUV = _.get(rawRecord, [0, 'total'], 0)
  return totalUV
}

/**
 * 获取指定时间范围内、指定粒度的原始记录列表
 * 用于二次聚合计算（例如：从天聚合到月时，先获取所有天的记录）
 * @param {number} projectId
 * @param {number} startAt
 * @param {number} endAt
 * @param {string} countType 期望获取的记录粒度
 * @return {Array}
 */
async function getRawRecordListInRange (projectId, startAt, endAt, countType) {
  let timeList = DatabaseUtil.getDatabaseTimeList(startAt, endAt, countType)
  let tableName = getTableName(projectId, startAt)
  let rawRecordList = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('project_id', projectId)
    .andWhere('count_type', countType)
    .whereIn('count_at_time', timeList)
    .catch(err => {
      Logger.error('unique_view => getRawRecordListInRange', err.message)
      return []
    })
  return rawRecordList
}
export default {
  replaceUvRecord,
  getRecord,
  getTotalUv,
  getTableName,
  getUVInRange,
  getRawRecordListInRange
}
