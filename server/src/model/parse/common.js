import moment from 'moment'
import _ from 'lodash'
import Knex from '~/src/library/mysql'

const SPLIT_BY = {
  PROJECT: 'project', // 按项目ID分表
  MONTH: 'month'      // 按月份分表
}

/**
 * 根据分表策略获取表名
 * @param {string} tableName 基础表名
 * @param {string} splitBy 分表策略 ('project' 或 'month')
 * @param {number} projectId 项目ID
 * @return {String}
 */
function getTableName (tableName, splitBy, projectId) {
  const yearMonth = moment().format('YYYYMM')
  if (splitBy === 'project') {
    return `${tableName}_${projectId}`
  } else if (splitBy === 'month') {
    return `${tableName}_${projectId}_${yearMonth}`
  }
  return tableName
}

/**
 * 插入数据
 * @param {object} infos 包含 projectId, tableName, splitBy, datas
 */
async function insertInto (infos) {
  const { projectId, tableName, splitBy, datas } = infos
  let updateAt = moment().unix()
  if (!datas['create_time']) {
    datas['create_time'] = updateAt
  }
  if (!datas['update_time']) {
    datas['update_time'] = updateAt
  }
  const TableName = getTableName(tableName, splitBy, projectId)
  return Knex(TableName)
    .insert(datas)
    .catch(() => { return 0 })
}

/**
 * 查询记录列表
 * @param {object} infos 包含 projectId, tableName, select, where, splitBy
 */
async function getRecordList (infos) {
  const { projectId, tableName, select, where, splitBy } = infos
  const TableName = getTableName(tableName, splitBy, projectId)
  return Knex(TableName)
    .select(select)
    .where(where)
    .catch(() => { return [] })
}

/**
 * 更新数据
 * @param {object} params 包含 projectId, tableName, where, splitBy, datas
 */
async function updateInto (params) {
  const { projectId, tableName, where, splitBy, datas } = params
  let updateAt = moment().unix()
  datas['update_time'] = updateAt
  const TableName = getTableName(tableName, splitBy, projectId)
  return Knex(TableName)
    .where(where)
    .update(datas)
    .catch(() => { return 0 })
}

/**
 * 封装knex，按照指定条件查询，有数据更新，无数据添加 (Replace Into 模式)
 * 注意：这不是原子操作，先查后改/插
 * @param {object} params 包含 tableName, where, datas, splitBy, projectId
 */
async function replaceInto (params) {
  const { tableName, where, datas, splitBy, projectId } = params
  const table = getTableName(tableName, splitBy, projectId)
  // 先查询是否存在
  let res = await Knex.from(table).select('id').where(where)
  let id = _.get(res, [0, 'id'], 0)
  let updateAt = moment().unix()
  let isSuccess = false
  if (id > 0) {
    // 存在则更新
    datas['update_time'] = updateAt
    const affectRows = await Knex(table)
      .where(`id`, '=', id)
      .update(datas)
      .catch(() => { return 0 })
    isSuccess = affectRows > 0
  } else {
    // 不存在则插入
    datas['create_time'] = updateAt
    datas['update_time'] = updateAt
    const insertId = await Knex
      .insert(datas)
      .into(table)
      .catch(() => { return 0 })
    isSuccess = insertId > 0
  }
  return isSuccess
}

export default {
  SPLIT_BY,
  insertInto,
  updateInto,
  replaceInto,
  getTableName,
  getRecordList
}