import Knex from '~/src/library/mysql'
import moment from 'moment'
import _ from 'lodash'
import MCityDistribution from '~/src/model/parse/city_distribution'
import DATE_FORMAT from '~/src/constants/date_format'
import DatabaseUtil from '~/src/library/utils/modules/database'
import Logger from '~/src/library/logger'

/**
 * PV汇总模型 (Page View Summary)
 * 负责管理和操作 t_r_page_view 表，该表存储了按不同时间粒度（小时/天/月）聚合后的页面浏览量(PV)及城市分布数据。
 * 数据来源通常由 Summary:PV 命令任务生成。
 */
const BASE_TABLE_NAME = 't_r_page_view'
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

function getTableName () {
  return BASE_TABLE_NAME
}

/**
 * 自动创建或替换 PV 汇总记录
 * @param {number} projectId 项目ID
 * @param {number} totalCount 该时间窗口内的总PV数
 * @param {string} countAtTime 统计时间点格式化字符串
 * @param {string} countType 统计粒度 (hour/day/month)
 * @param {object} cityDistribute 城市分布对象
 * @return {boolean} 操作是否成功
 */
async function replacePvRecord (projectId, totalCount, countAtTime, countType, cityDistribute) {
  let tableName = getTableName()
  let updateAt = moment().unix()
  let oldRecordList = await Knex
    .select([`city_distribute_id`, `create_time`, `id`])
    .from(tableName)
    .where('project_id', '=', projectId)
    .andWhere('count_at_time', '=', countAtTime)
    .andWhere('count_type', '=', countType)
    .catch(() => {
      return []
    })
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
    let isUpdateSuccess = MCityDistribution.updateCityDistributionRecord(cityDistributeIdInDb, projectId, createTimeInDb, JSON.stringify(cityDistribute))
    if (isUpdateSuccess === false) {
      return false
    }
    let affectRows = await Knex(tableName)
      .update(data)
      .where(`id`, '=', id)
    isSuccess = affectRows > 0
  } else {
    let cityDistributeId = await MCityDistribution.insertCityDistributionRecord(JSON.stringify(cityDistribute), projectId, updateAt)
    if (cityDistributeId === 0) {
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
 * 获取一段时间范围内的 PV 总和
 * @param {number} projectId
 * @param {number} startAt 开始时间戳
 * @param {number} finishAt 结束时间戳
 * @returns {Number} 累计 PV 数
 */
async function getPVInRange (projectId, startAt, finishAt) {
  let startAtMoment = moment.unix(startAt).format(DATE_FORMAT.DATABASE_BY_HOUR)
  let finishAtMoment = moment.unix(finishAt).format(DATE_FORMAT.DATABASE_BY_HOUR)
  let tableName = getTableName()
  let rawRecord = await Knex
    .from(tableName)
    .sum('total_count as total')
    .where('project_id', '=', projectId)
    .where('count_type', '=', DATE_FORMAT.UNIT.HOUR)
    .where('count_at_time', '>=', startAtMoment)
    .andWhere('count_at_time', '<=', finishAtMoment)
    .catch(e => {
      return []
    })
  let totalPV = _.get(rawRecord, [0, 'total'], 0)
  return totalPV || 0
}

/**
 * 获取指定时间范围内、指定粒度的原始记录列表
 * @param {number} projectId
 * @param {number} startAt
 * @param {number} endAt
 * @param {string} countType 期望获取的记录粒度
 * @return {Array}
 */
async function getRawRecordListInRange (projectId, startAt, endAt, countType) {
  let timeList = DatabaseUtil.getDatabaseTimeList(startAt, endAt, countType)
  let tableName = getTableName()
  let rawRecordList = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('project_id', projectId)
    .andWhere('count_type', countType)
    .whereIn('count_at_time', timeList)
    .catch(err => {
      Logger.error('page_view => getRawRecordListInRange', err.message)
      return []
    })
  return rawRecordList
}

export default {
  replacePvRecord,
  getPVInRange,
  getRawRecordListInRange,
  getTableName
}
