import moment from 'moment'
import _ from 'lodash'
import Logger from '~/src/library/logger'
import Knex from '~/src/library/mysql'
import DATE_FORMAT from '~/src/constants/date_format'
import MMonitorExt from '~/src/model/parse/monitor_ext'

// 监控日志基础表名前缀
const BaseTableName = 't_o_monitor'

// 定义各种错误类型的常量标识
const ERROR_TYPE_HTTP_ERROR = '1'
const ERROR_TYPE_接口结构异常 = '2'
const ERROR_TYPE_页面加载异常 = '3'
const ERROR_TYPE_启动异常 = '4'
const ERROR_TYPE_登录异常 = '5'
const ERROR_TYPE_NODE报错 = '6'
const ERROR_TYPE_JS异常 = '7'
const ERROR_TYPE_自定义异常 = '8'

// 错误类型标识到中文描述的映射关系
const ERROR_TYPE_MAP = {}
ERROR_TYPE_MAP[ERROR_TYPE_HTTP_ERROR] = 'HTTP_ERROR'
ERROR_TYPE_MAP[ERROR_TYPE_接口结构异常] = '接口结构异常'
ERROR_TYPE_MAP[ERROR_TYPE_页面加载异常] = '页面加载异常'
ERROR_TYPE_MAP[ERROR_TYPE_启动异常] = '启动异常'
ERROR_TYPE_MAP[ERROR_TYPE_登录异常] = '登录异常'
ERROR_TYPE_MAP[ERROR_TYPE_NODE报错] = 'NODE报错'
ERROR_TYPE_MAP[ERROR_TYPE_JS异常] = 'JS异常'
ERROR_TYPE_MAP[ERROR_TYPE_自定义异常] = '自定义异常'

// 查询分组粒度常量：按小时
const QUERY_GROUP_BY_HOUR = 'hour'
// 查询分组粒度常量：按分钟
const QUERY_GROUP_BY_MINUTE = 'minute'

// 获取错误名称列表时的最大搜索记录数限制
const MAX_SEARCH_ERROR_NAME = 5000
// 统计分布数据时，最多返回的错误种类数量
const MAX_DISPLAY_ERROR = 10
// 分页查询时，限制查询的最大日志长度（通过ID范围限制），防止全表扫描性能问题
const MAX_ERROR_LOG_LENGTH = 10000

// 数据库表中需要查询或操作的字段列表
const TABLE_COLUMN = [
  `id`,
  `error_type`,
  `error_name`,
  `http_code`,
  `monitor_ext_id`,
  `during_ms`,
  `request_size_b`,
  `response_size_b`,
  `url`,
  `country`,
  `province`,
  `city`,
  `log_at`,
  `md5`,
  `create_time`,
  `update_time`
]

/**
 * 根据项目ID和访问时间戳生成对应的分表表名
 * 表名格式: t_o_monitor_{projectId}_{YYYYMM}
 * @param {number} projectId - 项目ID
 * @param {number} visitAt - Unix时间戳
 * @returns {string} 生成的表名
 */
function getTableName (projectId, visitAt) {
  let visitAtMonth = moment.unix(visitAt).format('YYYYMM')
  return `${BaseTableName}_${projectId}_${visitAtMonth}`
}

/**
 * 统计指定条件下某一列的分组计数
 * 通常用于统计某种错误类型或URL的出现次数，只取前MAX_DISPLAY_ERROR条数据
 * @param {object} params - 查询参数对象
 * @param {string} params.column - 需要分组的列名
 * @param {number} params.startAt - 开始时间戳
 * @param {number} params.endAt - 结束时间戳
 * @param {object} params.whereParams - 其他WHERE条件
 * @param {number} params.projectId - 项目ID
 * @returns {Promise<Array>} 分组统计结果数组
 */
async function groupBy (params) {
  const { column, startAt, endAt, whereParams, projectId } = params
  const table = getTableName(projectId, startAt)
  let res = await Knex(table)
    .select(column)
    .count('* as error_count')
    .groupBy(column)
    .where(whereParams)
    .andWhere('log_at', '>', startAt)
    .andWhere('log_at', '<', endAt)
    .orderBy('error_count', 'desc')
    .limit(MAX_DISPLAY_ERROR)
    .catch(() => { return [] })
  return res
}

/**
 * 计算同一个月内，指定项目在指定时间范围内的错误总数
 * @param {number} projectId - 项目ID
 * @param {number} startAt - 开始时间戳
 * @param {number} finishAt - 结束时间戳
 * @returns {Promise<number>} 错误总数
 */
async function getErrorCountInRangeBySameMonth (projectId, startAt, finishAt) {
  const tableName = getTableName(projectId, startAt)
  let rawRecordList = await Knex
    .count('* as error_count')
    .from(tableName)
    .where('log_at', '>', startAt)
    .andWhere('log_at', '<', finishAt)
    .catch(e => {
      return []
    })
  let errorCount = _.get(rawRecordList, [0, 'error_count'], 0)
  return errorCount
}

/**
 * 计算同一个月内，指定项目、指定错误类型下的错误名称分布数据
 * 支持按分钟或小时分组，只取前MAX_DISPLAY_ERROR条数据
 * @param {number} projectId - 项目ID
 * @param {number} startAt - 开始时间戳
 * @param {number} finishAt - 结束时间戳
 * @param {string} errorType - 错误类型标识
 * @param {string} url - 可选的URL过滤条件
 * @param {string} groupBy - 分组粒度 ('hour' 或 'minute')
 * @returns {Promise<Array>} 包含错误名称、计数和分组时间的记录列表
 */
async function getErrorNameDistributionInSameMonth (projectId, startAt, finishAt, errorType, url, groupBy = QUERY_GROUP_BY_MINUTE) {
  // 配置格式化模板
  let sqlGroupByFormat = DATE_FORMAT.SQL_GROUP_BY_UNIT[groupBy]
  let jsGroupByFormat = DATE_FORMAT.DISPLAY_BY_UNIT[groupBy]

  let condition = {
    error_type: errorType
  }
  if (url) {
    condition['url'] = url
  }

  const tableName = getTableName(projectId, startAt)
  // 返回值demo =>
  // [{"error_count":8,"error_name":"ERR_ABORTED","group_by":"2018-10-23 16:27:00"},{"error_count":20,"error_name":"ERR_ABORTED","group_by":"2018-10-23 16:28:00"},{"error_count":11,"error_name":"ERR_ABORTED","group_by":"2018-10-23 16:29:00"},{"error_count":1,"error_name":"ERR_BLOCKED_BY_CLIENT","group_by":"2018-10-23 16:27:00"},{"error_count":5,"error_name":"ERR_BLOCKED_BY_CLIENT","group_by":"2018-10-23 16:28:00"},{"error_count":3,"error_name":"ERR_BLOCKED_BY_CLIENT","group_by":"2018-10-23 16:29:00"},{"error_count":1,"error_name":"ERR_CONNECTION_TIMED_OUT","group_by":"2018-10-23 16:28:00"},{"error_count":2,"error_name":"ERR_CONNECTION_TIMED_OUT","group_by":"2018-10-23 16:29:00"},{"error_count":1,"error_name":"ERR_EMPTY_RESPONSE","group_by":"2018-10-23 16:27:00"},{"error_count":2,"error_name":"ERR_EMPTY_RESPONSE","group_by":"2018-10-23 16:28:00"}]
  let rawRecordList = await Knex
    .count('* as error_count')
    .select('error_name', Knex.raw(`FROM_UNIXTIME(\`log_at\`, '${sqlGroupByFormat}') as group_by`))
    .from(tableName)
    .where('log_at', '>', startAt)
    .andWhere('log_at', '<', finishAt)
    .andWhere(condition)
    .groupBy('error_name', 'group_by')
    .orderBy('error_count', 'desc')
    .limit(MAX_DISPLAY_ERROR)
    .catch((e) => {
      return []
    })
  // 将group_by转换成时间戳
  let recordList = []
  for (let rawRecord of rawRecordList) {
    let record = {}
    record['error_type'] = errorType
    record['error_name'] = rawRecord['error_name']
    record['error_count'] = rawRecord['error_count']
    let groupByAt = moment(rawRecord['group_by'], jsGroupByFormat).unix()
    record['group_by_at'] = groupByAt
    recordList.push(record)
  }
  return recordList
}

/**
 * 在当前月份表里查询一条报警配置对应的错误数量
 * @param {number} projectId - 要查询的项目id
 * @param {string} errName - 查询的错误名字，如果是 '*' 则不限制错误名
 * @param {number} startAt - 查询的开始时间
 * @param {number} endAt - 查询的结束时间
 * @returns {Promise<number>} 错误数量
 */
async function getErrorCountForAlarm (projectId, errName, startAt, endAt) {
  const tableName = getTableName(projectId, startAt)
  const whereParams = {}
  if (errName !== '*') {
    whereParams['error_name'] = errName
  }
  const rawRecordList = await Knex
    .count('id as error_count')
    .from(tableName)
    .where(whereParams)
    .andWhere('log_at', '>=', startAt)
    .andWhere('log_at', '<=', endAt)
    .catch(err => {
      Logger.log(err.message, '=========>查询报警配置对应的错误数')
      return []
    })
  return _.get(rawRecordList, ['0', 'error_count'], 0)
}

/**
 * 获取项目最近7天内的错误名称列表（去重）
 * 用于前端下拉框选择等场景，限制最大搜索数量为 MAX_SEARCH_ERROR_NAME
 * @param {number} projectId - 项目ID
 * @param {string} errorType - 错误类型
 * @returns {Promise<Array<string>>} 错误名称列表
 */
async function getErrorNameList (projectId, errorType) {
  const nowAt = moment().unix()
  const sevenDayAgoAt = moment().subtract(7, DATE_FORMAT.UNIT.DAY).unix()
  const tableName = getTableName(projectId, nowAt)
  const rawRecordList = await Knex
    .select()
    .distinct('error_name')
    .from(function () {
      this.select(['id', 'error_name'])
        .from(tableName)
        .where('error_type', errorType)
        .orderBy('id', 'desc')
        .where('log_at', '>', sevenDayAgoAt)
        .andWhere('log_at', '<', nowAt)
        .limit(MAX_SEARCH_ERROR_NAME)
        .as('t1')
    })
    .catch(err => {
      Logger.error(err.message, '=========>获取项目的error name 列表')
      return []
    })
  const errorNameList = []
  for (let rawRecord of rawRecordList) {
    errorNameList.push(rawRecord['error_name'])
  }
  return errorNameList
}

/**
 * 获取指定时间范围内的原始监控记录列表
 * 注意：目前使用 endAt 计算表名，可能存在跨月查询问题，待优化
 * @param {number} projectId - 项目ID
 * @param {number} startAt - 开始时间戳
 * @param {number} endAt - 结束时间戳
 * @returns {Promise<Array>} 原始记录列表
 */
async function getRecordListInRange (projectId, startAt, endAt) {
  // @todo(hanqingxin) 应统一使用startAt计算表名
  const tableName = getTableName(projectId, endAt)
  const rawRecordList = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('log_at', '>', startAt)
    .andWhere('log_at', '<', endAt)
    .catch(err => {
      Logger.warn(err.message)
      return []
    })
  return rawRecordList
}

/**
 * 获取满足条件的分页总数
 * 支持按错误名称列表和URL模糊匹配进行过滤
 * @param {number} projectId - 项目ID
 * @param {number} startAt - 开始时间戳
 * @param {number} endAt - 结束时间戳
 * @param {number} offset - 偏移量（此函数中未直接使用，但作为参数保留以保持一致性）
 * @param {number} max - 每页最大数量（此函数中未直接使用，但作为参数保留以保持一致性）
 * @param {Array<string>} errorNameList - 错误名称列表
 * @param {string} url - URL过滤条件
 * @returns {Promise<number>} 满足条件的总记录数
 */
async function getTotalCountByConditionInSameMonth (projectId, startAt, endAt, offset = 0, max = 10, errorNameList = [], url = '') {
  let tableName = getTableName(projectId, startAt)

  let rawRecordList = await Knex
    .count('* as total_count')
    .from(tableName)
    .where('log_at', '>', startAt)
    .andWhere('log_at', '<', endAt)
    .whereIn('error_name', errorNameList)
    .andWhere((builder) => {
      // 外部传入的url可能是去除get参数后的结果, 所以需要进行模糊匹配
      // @todo(yaozeyuan) 添加字段, 记录 页面真实地址, 以和url进行区分
      if (url.length > 0) {
        builder.where('url', 'like', `%${url}%`)
      }
    })
    .catch(e => {
      Logger.warn(e)
      return []
    })

  let totalCount = _.get(rawRecordList, [0, 'total_count'], 0)
  return totalCount
}

/**
 * 获取满足条件的分页数据列表
 * 为了性能优化，通过限制ID范围（maxId - MAX_ERROR_LOG_LENGTH）来避免深分页问题
 * 同时关联查询扩展表信息（ext_json）并合并到结果中
 * @param {number} projectId - 项目ID
 * @param {number} startAt - 开始时间戳
 * @param {number} endAt - 结束时间戳
 * @param {number} offset - 分页偏移量
 * @param {number} max - 每页最大数量
 * @param {Array<string>} errorNameList - 错误名称列表
 * @param {string} url - URL过滤条件
 * @returns {Promise<Array>} 包含扩展信息的记录列表
 */
async function getListByConditionInSameMonth (projectId, startAt, endAt, offset = 0, max = 10, errorNameList = [], url = '') {
  let tableName = getTableName(projectId, startAt)

  // 获取最大id
  let rawResult = await Knex
    .max('id as maxId')
    .from(tableName)
    .catch(err => {
      Logger.error('monitor.js => getListByConditionInSameMonth获取最大id出错', err.message)
      return [{ maxId: 0 }]
    })
  let maxId = _.get(rawResult, [0, 'maxId'], 0)
  if (maxId === null || maxId === 0) return []
  let rawRecordList = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('log_at', '>', startAt)
    .andWhere('id', '>', maxId - MAX_ERROR_LOG_LENGTH)
    .andWhere('log_at', '<', endAt)
    .whereIn('error_name', errorNameList)
    .andWhere((builder) => {
      // 外部传入的url可能是去除get参数后的结果, 所以需要进行模糊匹配
      // @todo(yaozeyuan) 添加字段, 记录 页面真实地址, 以和url进行区分
      if (url.length > 0) {
        builder.where('url', 'like', `%${url}%`)
      }
    })
    .orderBy('log_at', 'desc')
    .offset(offset)
    .limit(max)
    .catch(e => {
      Logger.warn(e)
      return []
    })

  let extendLogIdList = []
  let createAt = 0
  if (rawRecordList.length === 0) return []
  for (let rawRecord of rawRecordList) {
    let extendRecordId = _.get(rawRecord, ['monitor_ext_id'], 0)
    // 所有记录一定在同一张扩展表里
    createAt = _.get(rawRecord, ['create_time'], 0)
    extendLogIdList.push(extendRecordId)
  }
  // 补全扩展信息
  let extendRecordList = await MMonitorExt.getRecordListByIdList(projectId, createAt, extendLogIdList)
  let extendRecordMap = {}
  for (let extendRecord of extendRecordList) {
    let extJson = _.get(extendRecord, ['ext_json'], '{}')
    let extId = _.get(extendRecord, ['id'], '{}')
    let ext = {}
    try {
      ext = JSON.parse(extJson)
    } catch (e) {
      ext = {}
    }
    extendRecordMap[extId] = ext
  }

  // 填充到数据里
  let recordList = []
  for (let rawRecord of rawRecordList) {
    let extendRecordId = _.get(rawRecord, ['monitor_ext_id'], 0)
    let extendRecord = _.get(extendRecordMap, [extendRecordId], {})
    rawRecord['ext'] = extendRecord
    let record = {
      ...rawRecord
    }
    recordList.push(record)
  }

  return recordList
}

export default {
  getTableName,
  groupBy,
  getErrorCountInRangeBySameMonth,
  getErrorCountForAlarm,
  getRecordListInRange,

  // 新error接口
  getTotalCountByConditionInSameMonth,
  getListByConditionInSameMonth,

  // 错误类型
  ERROR_TYPE_HTTP_ERROR,
  ERROR_TYPE_接口结构异常,
  ERROR_TYPE_页面加载异常,
  ERROR_TYPE_启动异常,
  ERROR_TYPE_登录异常,
  ERROR_TYPE_NODE报错,
  ERROR_TYPE_JS异常,
  ERROR_TYPE_自定义异常,
  ERROR_TYPE_MAP,

  // 分组格式
  QUERY_GROUP_BY_HOUR,
  QUERY_GROUP_BY_MINUTE
}