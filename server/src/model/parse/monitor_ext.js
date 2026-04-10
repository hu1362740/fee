import moment from 'moment'
import Knex from '~/src/library/mysql'
import Logger from '~/src/library/logger'

const BASE_TABLE_NAME = 't_o_monitor_ext'

const TABLE_COLUMN = [
  `id`,
  `ext_json`, // 扩展JSON数据
  `create_time`,
  `update_time`
]

/**
 * 获取监控扩展数据表名
 * 按月分表，格式为: t_o_monitor_ext_{projectId}_{YYYYMM}
 * @param {*} projectId
 * @param {*} visitAt 访问时间戳，用于确定月份
 */
function getTableName (projectId, visitAt) {
  let visitAtMonth = moment.unix(visitAt).format('YYYYMM')
  return `${BASE_TABLE_NAME}_${projectId}_${visitAtMonth}`
}

/**
 * 根据ID列表获取监控扩展记录
 * @param {*} projectId
 * @param {*} createAt 创建时间戳，用于确定表
 * @param {*} idList ID列表
 */
async function getRecordListByIdList (projectId, createAt, idList = []) {
  let tableName = getTableName(projectId, createAt)
  let rawRecordList = Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .whereIn('id', idList)
    .catch(e => {
      Logger.warn('getRecordListByIdList查询失败 => ', e)
      return []
    })
  return rawRecordList
}

export default {
  getTableName,
  getRecordListByIdList
}