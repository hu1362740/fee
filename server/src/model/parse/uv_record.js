import Knex from '~/src/library/mysql'
import moment from 'moment'
import _ from 'lodash'
import DATE_FORMAT from '~/src/constants/date_format'

const TableNameDateFormat = 'YYYYMM'
const VisitAtHourDateFormat = DATE_FORMAT.DATABASE_BY_HOUR
const BASE_TABLE_NAME = 't_o_uv_record'
const TABLE_COLUMN = [
  `id`,
  `uuid`,
  `country`,
  `province`,
  `city`,
  `visit_at_hour`,
  `pv_count`,
  `create_time`,
  `update_time`
]

/**
 * 获取表名
 * UV记录表按月分表，格式为: t_o_uv_record_{projectId}_{YYYYMM}
 * @param {number} projectId 项目id
 * @param {number} createTimeAt 创建时间, 时间戳，用于确定月份
 * @return {String}
 */
function getTableName(projectId, createTimeAt) {
  let dateYm = moment.unix(createTimeAt).format(TableNameDateFormat)
  return `${BASE_TABLE_NAME}_${projectId}_${dateYm}`
}

/**
 * 自动创建或更新UV记录
 * 逻辑：
 * 1. 根据 uuid 和 visit_at_hour (访问小时) 判断记录是否存在
 * 2. 若存在，更新地理位置信息和更新时间 (PV计数在此场景中固定为0或无意义，故不累加)
 * 3. 若不存在，插入新记录
 * @param {number} projectId
 * @param {string} uuid 用户唯一标识
 * @param {number} visitAt 访问时间戳
 * @param {string} country
 * @param {string} province
 * @param {string} city
 * @return {boolean} 操作是否成功
 */
async function replaceUvRecord(projectId, uuid, visitAt, country, province, city) {
  // pv数无意义, 不再计算
  let pvCount = 0

  let visitAtHour = moment.unix(visitAt).format(VisitAtHourDateFormat)
  let tableName = getTableName(projectId, visitAt)
  let updateAt = moment().unix()
  // 返回值是一个列表
  let oldRecordList = await Knex
    .select([`id`])
    .from(tableName)
    .where('uuid', '=', uuid)
    .andWhere('visit_at_hour', '=', visitAtHour)
    .catch(() => {
      return []
    })
  // 利用get方法, 不存在直接返回0, 没毛病
  let id = _.get(oldRecordList, [0, 'id'], 0)
  let data = {
    uuid,
    visit_at_hour: visitAtHour,
    pv_count: pvCount,
    country,
    province,
    city,
    update_time: updateAt
  }
  let isSuccess = false
  if (id > 0) {
    let affectRows = await Knex(tableName)
      .update(data)
      .where(`id`, '=', id)
    isSuccess = affectRows > 0
  } else {
    data['create_time'] = updateAt
    let insertResult = await Knex
      .returning('id')
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
 * 获取指定小时内已存在的UUID集合
 * 用于在入库前进行去重判断，避免重复插入同一小时内的同一用户
 * @param {*} projectId
 * @param {*} visitAt 访问时间戳，用于确定表和小时
 * @return {Set<String>} 已存在的UUID集合
 */
async function getExistUuidSetInHour(projectId, visitAt) {
  let visitAtHour = moment.unix(visitAt).format(VisitAtHourDateFormat)
  let tableName = getTableName(projectId, visitAt)
  let rawRecordList = await Knex
    .select('uuid')
    .from(tableName)
    .where('visit_at_hour', '=', visitAtHour)
    .catch(e => {
      return []
    })
  let uuidSet = new Set()
  for (let rawRecord of rawRecordList) {
    let uuid = _.get(rawRecord, ['uuid'], '')
    uuidSet.add(uuid)
  }
  return uuidSet
}

/**
 * 获取一段时间范围内的按城市分布的UV数
 * 注意：由于UV表按月分表，需要遍历每个月份表进行聚合统计
 * @param {*} projectId
 * @param {*} startAt 开始时间戳
 * @param {*} finishAt 结束时间戳
 * @returns {Object} 城市分布对象，结构如 { 'China': { 'Beijing': { 'Beijing': count } } }
 */
async function getCityDistributeInRange(projectId, startAt, finishAt) {
  let startAtMoment = moment.unix(startAt)
  let finishAtMoment = moment.unix(finishAt)
  let cityDistribute = {}
  // uv记录表按月分表, 因此需要分月计算总uv
  for (let currentAtMoment = startAtMoment; currentAtMoment.isBefore(finishAtMoment); currentAtMoment = currentAtMoment.clone().add(1, 'months')) {
    // let tableName = getTableName(projectId, startAt) // ❌ 始终使用 startAt 的月份，导致跨月查询时表名不正确
    // 正确代码
    // let tableName = getTableName(projectId, currentAtMoment.unix())  // ✅ 使用当前循环的月份
    //     groupBy：将数据切分成不同的地理块。SQL 返回的结果类似于：
    // { country: 'China', province: 'Guangdong', city: 'Shenzhen', uv_count: 50 }
    // { country: 'China', province: 'Beijing', city: 'Beijing', uv_count: 30 }
    let tableName = getTableName(projectId, currentAtMoment.unix())
    let startVisitAtHour = startAtMoment.format(VisitAtHourDateFormat)
    let endVisitAtHour = finishAtMoment.format(VisitAtHourDateFormat)
    let rawRecordList = await Knex
      .countDistinct('uuid as uv_count')
      .select([`country`, `province`, `city`])
      .from(tableName)
      // .where('create_time', '>', startAt)
      // .andWhere('create_time', '<', finishAt)
      .where('visit_at_hour', '>=', startVisitAtHour)
      .andWhere('visit_at_hour', '<=', endVisitAtHour)
      .groupBy([`country`, `province`, `city`])
      .catch(() => { return [] })

    for (let rawRecord of rawRecordList) {
      let country = _.get(rawRecord, ['country'], '')
      let province = _.get(rawRecord, ['province'], '')
      let city = _.get(rawRecord, ['city'], '')
      let uvCount = _.get(rawRecord, ['uv_count'], '')

      let locationPath = [country, province, city]
      if (_.has(cityDistribute, locationPath)) {
        uvCount = uvCount + _.get(cityDistribute, locationPath, 0)
      }
      _.set(cityDistribute, locationPath, uvCount)
    }
  }
  return cityDistribute
}

export default {
  replaceUvRecord,
  getExistUuidSetInHour,
  getCityDistributeInRange,
  getTableName
}