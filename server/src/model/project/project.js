import Knex from '~/src/library/mysql'
import moment from 'moment'
import _ from 'lodash'
import Logger from '~/src/library/logger'

// 项目基础表名
const BASE_TABLE_NAME = 't_o_project'
// 数据库表中所有字段列表，用于全量查询
const TABLE_COLUMN = [
  `id`,
  `project_name`,
  `display_name`,
  `rate`,
  `c_desc`,
  `create_time`,
  `create_ucid`,
  `update_time`,
  `update_ucid`,
  `is_delete`
]
// 展示用字段列表，排除敏感或内部字段如 is_delete
const DISPLAY_TABLE_COLUMN = [
  `id`,
  `project_name`,
  `display_name`,
  `rate`,
  `c_desc`,
  `create_time`,
  `create_ucid`,
  `update_time`,
  `update_ucid`
]

/**
 * 获取项目表名
 * @returns {string} 项目表名
 */
function getTableName () {
  return BASE_TABLE_NAME
}

/**
 * 格式化记录，仅保留展示所需的字段
 * 用于对外接口返回数据时过滤掉内部字段（如 is_delete）
 * @param {*} rawRecord - 原始数据库记录对象
 * @returns {object} 格式化后的记录对象
 */
function formatRecord (rawRecord) {
  let record = {}
  for (let column of DISPLAY_TABLE_COLUMN) {
    if (_.has(rawRecord, [column])) {
      record[column] = rawRecord[column]
    }
  }
  return record
}

/**
 * 添加新项目
 * 自动填充创建时间、更新时间及删除标记
 * @param {object} data - 包含 project_name, display_name, c_desc, create_ucid, update_ucid 等字段的数据对象
 * @returns {boolean} 添加成功返回 true，失败返回 false
 */
async function add (data) {
  let tableName = getTableName()
  let createTime = moment().unix()
  let updateTime = createTime

  let insertData = {}
  // 提取允许插入的字段
  for (let column of [
    `project_name`,
    `display_name`,
    `c_desc`,
    `create_ucid`,
    `update_ucid`
  ]) {
    if (_.has(data, [column])) {
      insertData[column] = data[column]
    }
  }
  // 补充系统自动生成的字段
  insertData = {
    ...insertData,
    create_time: createTime,
    update_time: updateTime,
    is_delete: 0 // 默认未删除
  }
  let insertResult = await Knex
    .returning('id') // 返回新插入记录的 ID
    .insert(insertData)
    .into(tableName)
    .catch(err => {
      Logger.log(err.message, 'project_item    add   出错')
      return []
    })
  let id = _.get(insertResult, [0], 0)

  return id > 0
}

/**
 * 根据 ID 获取单个项目信息
 * @param {number} id - 项目 ID
 * @returns {object} 项目信息对象，若不存在则返回空对象
 */
async function get (id) {
  let tableName = getTableName()
  let result = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('id', '=', id)
    .catch(err => {
      Logger.log(err.message, 'project_item    get   出错')
      return []
    })
  let project = _.get(result, ['0'], {})
  return project
}

/**
 * 获取所有未删除的项目列表
 * @returns {Array} 项目列表数组
 */
async function getList () {
  let tableName = getTableName()
  let result = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('is_delete', 0) // 仅查询未删除的项目
    .catch(err => {
      Logger.log(err.message, 'project_item    getlist   出错')
      return []
    })
  return result
}

/**
 * 更新项目信息
 * 自动更新 update_time 字段
 * @param {number} id - 项目 ID
 * @param {object} updateData - 需要更新的字段数据，支持 project_name, display_name, c_desc, is_delete, update_ucid
 * @returns {boolean} 更新成功返回 true，失败返回 false
 */
async function update (id, updateData) {
  let nowAt = moment().unix()

  let newRecord = {}
  // 提取允许更新的字段
  for (let column of [
    'project_name',
    'display_name',
    'c_desc',
    'is_delete',
    'update_ucid'
  ]) {
    if (_.has(updateData, [column])) {
      newRecord[column] = updateData[column]
    }
  }
  // 强制更新更新时间
  newRecord = {
    ...newRecord,
    update_time: nowAt
  }
  let tableName = getTableName()
  let result = await Knex(tableName)
    .update(newRecord)
    .where('id', id)
    .catch(err => {
      Logger.log(err.message, 'project_item    update   出错')
      return []
    })
  return result === 1 // Knex update 返回受影响的行数，1 表示成功
}

/**
 * 根据 ID 列表批量获取项目信息
 * 仅返回未删除的项目
 * @param {Array<number>} idList - 项目 ID 数组
 * @returns {Array} 匹配到的项目列表
 */
async function getProjectListById (idList) {
  let tableName = getTableName()

  let result = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .whereIn('id', idList)
    .andWhere('is_delete', 0) // 过滤已删除项目
    .catch(err => {
      Logger.log(err.message, 'project_item   getProjectListById   出错')
      return []
    })
  return result
}

export default {
  get,
  getList,
  update,
  getTableName,
  add,

  // 限制导出数据字段
  formatRecord,

  // 根据 ID 列表获取项目
  getProjectListById
}