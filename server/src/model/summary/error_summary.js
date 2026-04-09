import Knex from '~/src/library/mysql'
import moment from 'moment'
import _ from 'lodash'
import Logger from '~/src/library/logger'
import redis from '~/src/library/redis'
import MCityDistribution from '~/src/model/parse/city_distribution'
import DATE_FORMAT from '~/src/constants/date_format'
import DatabaseUtil from '~/src/library/utils/modules/database'

// 错误汇总表的标准字段列表
const TABLE_COLUMN = [
  `id`,
  `error_type`,
  `error_name`,
  `url_path`,
  `city_distribution_id`,
  `count_at_time`,
  `count_type`,
  `error_count`,
  `create_time`,
  `update_time`
]

// 错误汇总表的基础表名前缀，实际表名会根据 projectId 和月份动态生成
const BASE_TABLE_NAME = 't_r_error_summary'
const MAX_LIMIT = 100

// Redis 缓存相关常量
const BASE_REDIS_KEY = 'error_summary'
const REDIS_KEY_ERROR_NAME_DISTRIBUTION_CACHE = BASE_REDIS_KEY + '_' + 'error_name_distribution_cache'

/**
 * 根据项目ID和创建时间戳获取对应的分表表名
 * 表名格式: t_r_error_summary_{projectId}_{YYYYMM}
 * @param {number} projectId 项目id
 * @param {number} createTimeAt 创建时间, Unix时间戳
 * @return {String} 完整的表名
 */
function getTableName (projectId, createTimeAt) {
  const DATE_FORMAT = 'YYYYMM'
  let YmDate = moment.unix(createTimeAt).format(DATE_FORMAT)
  return BASE_TABLE_NAME + '_' + projectId + '_' + YmDate
}

/**
 * 插入一条新的错误汇总记录
 * @param {number} projectId 项目ID
 * @param {number} countAt 统计时间点的时间戳
 * @param {string} countType 统计粒度 (minute/hour/day)
 * @param {string} errorType 错误类型
 * @param {string} errorName 错误名称
 * @param {string} urlPath URL路径
 * @param {number} cityDistributionId 城市分布记录的ID
 * @param {number} errorCount 错误次数
 * @return {boolean} 插入是否成功
 */
async function insertErrorSummaryRecord (projectId, countAt, countType, errorType, errorName, urlPath, cityDistributionId, errorCount) {
  const tableName = getTableName(projectId, countAt)
  // 将时间戳转换为数据库存储的特定格式字符串 (如 '2023-10-27 10:00:00')
  const countAtTime = moment.unix(countAt).format(DATE_FORMAT.DATABASE_BY_UNIT[countType])
  const createTime = moment().unix()
  const insertData = {
    error_type: errorType,
    error_name: errorName,
    url_path: urlPath,
    city_distribution_id: cityDistributionId,
    count_at_time: countAtTime,
    count_type: countType,
    error_count: errorCount,
    create_time: createTime,
    update_time: createTime
  }
  const result = await Knex
    .returning('id')
    .insert(insertData)
    .into(tableName)
    .catch((err) => {
      Logger.error(err.message)
      return [0]
    })
  return _.get(result, [0], 0) > 0
}

/**
 * 更新已有的错误汇总记录
 * @param {number} id 记录ID
 * @param {number} projectId 项目ID
 * @param {number} countAt 统计时间点的时间戳
 * @param {string} countType 统计粒度
 * @param {string} errorType 错误类型
 * @param {string} errorName 错误名称
 * @param {string} urlPath URL路径
 * @param {number} errorCount 错误次数
 * @return {boolean} 更新是否成功
 */
async function updateErrorSummaryRecord (id, projectId, countAt, countType, errorType, errorName, urlPath, errorCount) {
  const tableName = getTableName(projectId, countAt)
  const countAtTime = moment.unix(countAt).format(DATE_FORMAT.DATABASE_BY_UNIT[countType])
  const updateTime = moment().unix()
  const updateData = {
    error_type: errorType,
    error_name: errorName,
    url_path: urlPath,
    count_at_time: countAtTime,
    count_type: countType,
    error_count: errorCount,
    update_time: updateTime
  }
  const affecRows = await Knex(tableName)
    .update(updateData)
    .where('id', id)
    .catch((err) => {
      Logger.error(err.message)
      return 0
    })
  return affecRows > 0
}

/**
 * 替换（插入或更新）错误汇总记录及关联的城市分布数据
 * 如果记录不存在，则先插入城市分布数据获取ID，再插入汇总记录；
 * 如果记录存在，则更新城市分布数据和汇总记录。
 * @param {number} projectId 项目ID
 * @param {number} countAt 统计时间点的时间戳
 * @param {string} countType 统计粒度
 * @param {string} errorType 错误类型
 * @param {string} errorName 错误名称
 * @param {string} urlPath URL路径
 * @param {number} errorCount 错误次数
 * @param {string} cityDistrubutionJsonString 城市分布数据的JSON字符串
 * @return {boolean} 操作是否成功
 */
async function replaceSummaryRecord (projectId, countAt, countType, errorType, errorName, urlPath, errorCount, cityDistrubutionJsonString) {
  // 查询是否存在相同的汇总记录
  const rawRecord = await get(projectId, countAt, countType, errorType, errorName, urlPath)

  if (_.isEmpty(rawRecord)) {
    // 如果不存在对应的记录
    // 先插城市分布数据获取id
    const cityDistributionId = await MCityDistribution.insertCityDistributionRecord(cityDistrubutionJsonString, projectId, countAt)

    // 再插errorSummary数据
    const isSuccess = await insertErrorSummaryRecord(projectId, countAt, countType, errorType, errorName, urlPath, cityDistributionId, errorCount)
    return isSuccess
  } else {
    // 如果存在对应的记录
    const { id: errorSummaryId, city_distribution_id: cityDistributionId } = rawRecord

    // 更新城市分布记录
    await MCityDistribution.updateCityDistributionRecord(cityDistributionId, projectId, countAt, cityDistrubutionJsonString)

    // 更新errorSummary记录
    const isSuccess = await updateErrorSummaryRecord(errorSummaryId, projectId, countAt, countType, errorType, errorName, urlPath, errorCount)
    return isSuccess
  }
}

/**
 * 获取指定条件下的单条错误汇总记录
 * 
 * 作用：
 * 从分月汇总表 (t_r_error_summary_{projectId}_{YYYYMM}) 中查询特定时间点、特定粒度、特定错误维度的聚合数据。
 * 通常用于前端查看某个具体错误的详细统计信息（如该分钟内的总报错数、城市分布等）。
 * 
 * @param {number} projectId - 项目ID，用于确定查询哪张分表
 * @param {number} countAt - Unix时间戳，统计的时间点
 * @param {string} countType - 统计粒度 ('minute', 'hour', 'day')，决定时间格式化模板和查询条件
 * @param {string} errorType - 错误类型标识 (如 '7' 代表 JS异常)
 * @param {string} errorName - 具体的错误名称 (如 'TypeError: Cannot read property...')
 * @param {string} urlPath - 发生错误的页面路径或接口路径
 * @returns {Promise<Object>} 匹配到的第一条汇总记录对象，若未找到则返回空对象 {}
 */
async function get (projectId, countAt, countType, errorType, errorName, urlPath) {
  // 根据项目ID和时间戳生成对应的分表表名 (例如: t_r_error_summary_2_202604)
  const tableName = getTableName(projectId, countAt)
  
  // 将Unix时间戳转换为数据库存储的字符串格式 (例如: '2026-04-02 11:35' 或 '2026-04-02 11')
  const countAtTime = moment.unix(countAt).format(DATE_FORMAT.DATABASE_BY_UNIT[countType])

  // 构建 WHERE 查询条件
  const wherePrams = {
    count_at_time: countAtTime, // 匹配特定的时间片
    count_type: countType,      // 匹配特定的统计粒度
    error_name: errorName,      // 匹配特定的错误名
    url_path: urlPath           // 匹配特定的URL路径
    // 注意：此处未包含 errorType 过滤，可能是因为在该业务场景下 errorName + urlPath 已具备唯一性，
    // 或者调用方已在上一层做了筛选。
  }
  
  // 执行 Knex 查询
  const result = await Knex
    .select(TABLE_COLUMN) // 选择预定义的字段列表
    .from(tableName)
    .where(wherePrams)
    .catch((err) => {
      Logger.error(err.message)
      return []
    })
  
  // 返回结果集中的第一条记录，如果结果为空则返回空对象，防止前端解构报错
  return _.get(result, [0], {})
}

/**
 * 获取指定时间范围内，指定错误名称列表或URL下的错误名称分布统计
 * @param {number} projectId 项目ID
 * @param {number} startAt 开始时间戳
 * @param {number} endAt 结束时间戳
 * @param {string} countType 统计粒度
 * @param {Array<string>} errorNameList 错误名称列表，为空则不限制
 * @param {string} url URL过滤条件
 * @return {Array<Object>} 包含 error_name 和 error_count 的对象数组
 */
async function getErrorNameDistributionListInSameMonth (projectId, startAt, endAt, countType, errorNameList = [], url = {}) {
  const tableName = getTableName(projectId, startAt)
  // 生成数据库中对应时间粒度的时间字符串列表
  let countAtTimeList = DatabaseUtil.getDatabaseTimeList(startAt, endAt, countType)
  let extendCondition = {}
  if (url.length > 0) {
    extendCondition['url_path'] = url
  }
  let rawRecordList = await Knex
    .select('error_name')
    .sum('error_count as sum_error_count')
    .from(tableName)
    .where('count_type', countType)
    .whereIn('count_at_time', countAtTimeList)
    .whereIn('error_name', errorNameList)
    .andWhere(extendCondition)
    .groupBy('error_name')
    .orderBy('sum_error_count', 'desc')
    .catch(err => {
      Logger.error(err.message)
      return []
    })

  let recordList = []
  for (let rawRecord of rawRecordList) {
    let { sum_error_count: errorCount, error_name: errorName } = rawRecord
    let record = {
      error_count: errorCount,
      error_name: errorName
    }
    recordList.push(record)
  }

  return recordList
}

/**
 * 获取项目最近几天内出现过的所有错误名称列表（去重）
 * @param {number} projectId 项目ID
 * @param {string} errorType 错误类型
 * @return {Array<string>} 错误名称列表
 */
async function getErrorNameList (projectId, errorType) {
  const nowMoment = moment().endOf('YYYY-MM-DD')
  const sevenDaysAgoMoment = nowMoment.clone().subtract(3, DATE_FORMAT.UNIT.DAY).startOf('YYYY-MM-DD')
  const tableName = getTableName(projectId, nowMoment.unix())

  // 构建最近几天的时间字符串列表用于查询
  let timeList = []
  for (let timeAt = sevenDaysAgoMoment.unix(); timeAt < nowMoment.unix(); timeAt += 86400) {
    const time = moment.unix(timeAt).format(DATE_FORMAT.DATABASE_BY_DAY)
    timeList.push(time)
  }
  const rawRecordList = await Knex
    .select()
    .distinct('error_name')
    .from(tableName)
    .where('count_type', DATE_FORMAT.UNIT.DAY)
    .where('error_type', errorType)
    .whereIn('count_at_time', timeList)
    .catch(err => {
      Logger.error(err.message)
      return []
    })
  const errorNameList = []
  for (let rawRecord of rawRecordList) {
    errorNameList.push(rawRecord['error_name'])
  }
  return errorNameList
}

/**
 * 根据错误名称列表，获取这些错误对应的URL路径分布统计（按错误总数降序排列）
 * @param {number} projectId 项目ID
 * @param {number} startAt 开始时间戳
 * @param {number} endAt 结束时间戳
 * @param {Array<string>} errorNameList 错误名称列表
 * @param {string} countType 统计粒度
 * @param {number} max 返回的最大记录数
 * @return {Array<Object>} 包含 url_path 和 error_count 的对象数组
 */
async function getUrlPathDistributionListByErrorNameList (projectId, startAt, endAt, errorNameList, countType, max = 10) {
  const tableName = getTableName(projectId, startAt)
  let countAtTimeList = DatabaseUtil.getDatabaseTimeList(startAt, endAt, countType)
  let rawRecordList = await Knex
    .select('url_path')
    .sum('error_count as total_count')
    .from(tableName)
    .where('count_type', countType)
    .whereIn('error_name', errorNameList)
    .whereIn('count_at_time', countAtTimeList)
    .groupBy('url_path')
    .orderBy('total_count', 'desc')
    .limit(max)
    .catch(err => {
      Logger.error(err.message)
      return []
    })
  let recordList = []
  for (let rawRecord of rawRecordList) {
    let urlPath = _.get(rawRecord, ['url_path'], '')
    let errorCount = _.get(rawRecord, ['total_count'], 0)
    let record = {
      url_path: urlPath,
      error_count: errorCount
    }
    recordList.push(record)
  }
  return recordList
}

/**
 * 获取用于绘制堆叠面积图的错误分布数据
 * 返回每个时间点各错误类型的错误数
 * @param {number} projectId 项目ID
 * @param {number} startAt 开始时间戳
 * @param {number} endAt 结束时间戳
 * @param {string} countType 统计粒度
 * @param {Array<string>} errorNameList 错误名称列表
 * @param {string} url URL过滤条件
 * @return {Array<Object>} 包含 error_name, count_at_time, error_count 的对象数组
 */
async function getStackAreaDistribution (projectId, startAt, endAt, countType, errorNameList = [], url = '') {
  const tableName = getTableName(projectId, startAt)
  let timeList = DatabaseUtil.getDatabaseTimeList(startAt, endAt, countType)
  let extendCondition = {}
  if (url.length > 0) {
    extendCondition['url_path'] = url
  }

  let rawRecordList = await Knex
    .sum('error_count as sum_error_count')
    .select(['error_name', 'count_at_time'])
    .from(tableName)
    .where('count_type', countType)
    .andWhere(extendCondition)
    .whereIn('count_at_time', timeList)
    .whereIn('error_name', errorNameList)
    .groupBy(['count_at_time', 'error_name'])
    .catch(err => {
      Logger.error(err.message)
      return []
    })
  let recordList = []
  for (let rawRecord of rawRecordList) {
    let { error_name: errorName, count_at_time: countAtTime, sum_error_count: sumErrorCount } = rawRecord
    let record = {
      error_name: errorName,
      count_at_time: countAtTime,
      error_count: sumErrorCount
    }
    recordList.push(record)
  }
  return recordList
}

/**
 * 获取错误汇总列表，并关联查询城市分布详情
 * @param {number} projectId 项目ID
 * @param {number} startAt 开始时间戳
 * @param {number} endAt 结束时间戳
 * @param {string} countType 统计粒度
 * @param {Array<string>} errorNameList 错误名称列表
 * @param {string} url URL过滤条件
 * @return {Array<Object>} 包含完整信息及 city_distribution 对象的记录列表
 */
async function getList (projectId, startAt, endAt, countType, errorNameList = [], url = '') {
  const tableName = getTableName(projectId, startAt)
  let timeList = DatabaseUtil.getDatabaseTimeList(startAt, endAt, countType)

  let extendCondition = {}
  if (url.length > 0) {
    extendCondition['url_path'] = url
  }

  let rawRecordList = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('count_type', countType)
    .whereIn('count_at_time', timeList)
    .whereIn('error_name', errorNameList)
    .andWhere(extendCondition)
    .orderBy('error_count', 'desc')
    .catch(err => {
      Logger.error(err.message)
      return []
    })
  if (rawRecordList.length === 0) return []
  
  // 收集所有需要查询的城市分布ID
  let cityDistributionIdList = []
  let createAt = 0
  for (let rawRecord of rawRecordList) {
    let cityDistributionId = _.get(rawRecord, ['city_distribution_id'], 0)
    createAt = _.get(rawRecord, ['create_time'], 0)
    cityDistributionIdList.push(cityDistributionId)
  }
  // 批量查询城市分布详情
  let rawCityDistributionReocrdList = await MCityDistribution.getByIdListInOneMonth(projectId, cityDistributionIdList, createAt)

  // 构建城市分布ID到解析后JSON对象的映射
  let cityDistributionMap = {}
  for (let rawRecord of rawCityDistributionReocrdList) {
    let cityDistributionJson = _.get(rawRecord, ['city_distribute_json'], '{}')
    let cityDistributionId = _.get(rawRecord, ['id'], 0)
    let cityDistribution = {}
    try {
      cityDistribution = JSON.parse(cityDistributionJson)
    } catch (e) {
      cityDistribution = {}
    }
    cityDistributionMap[cityDistributionId] = cityDistribution
  }
  
  // 将城市分布数据合并到主记录中
  let recordList = []
  for (let rawRecord of rawRecordList) {
    let cityDistributionId = _.get(rawRecord, ['city_distribution_id'], 0)
    let cityDistribution = _.get(cityDistributionMap, [cityDistributionId], {})
    rawRecord['city_distribution'] = cityDistribution
    recordList.push(rawRecord)
  }
  return recordList
}

/**
 * 获取指定时间范围内，报错数最多的前 max 个错误名称及其总数
 * @param {number} projectId 项目ID
 * @param {number} startAt 开始时间戳
 * @param {number} endAt 结束时间戳
 * @param {number} max 最大返回数量
 * @return {Array<Object>} 包含 error_name 和 error_count 的对象数组
 */
async function getErrorNameDistributionInSameMonth (projectId, startAt, endAt, max = 500) {
  let tableName = getTableName(projectId, startAt)
  // 注意：此处硬编码使用 DAY 粒度进行统计，可能与传入的时间范围不完全匹配，需确保调用方意图一致
  let timeList = DatabaseUtil.getDatabaseTimeList(startAt, endAt, DATE_FORMAT.UNIT.DAY)
  let rawDistributionList = await Knex
    .sum('error_count as sum_error_count')
    .select('error_name')
    .from(tableName)
    .whereIn('count_at_time', timeList)
    .andWhere('count_type', DATE_FORMAT.UNIT.DAY)
    .groupBy('error_name')
    .orderBy('sum_error_count', 'desc')
    .limit(max)
    .catch((e) => {
      Logger.warn('getErrorNameDistributionInSameMonth查询错误, 错误信息=>', e)
      return []
    })
  let distributionList = []
  for (let rawDistribution of rawDistributionList) {
    let errorName = _.get(rawDistribution, ['error_name'], '')
    let errorCount = _.get(rawDistribution, ['sum_error_count'], '')
    let distribution = {
      error_name: errorName,
      error_count: errorCount
    }
    distributionList.push(distribution)
  }
  return distributionList
}

/**
 * 从 Redis 缓存中获取指定时间范围内的错误名称分布数据
 * 若缓存不存在或强制更新，则重新查询数据库并写入缓存
 * @param {number} projectId 项目ID
 * @param {number} startAt 开始时间戳
 * @param {number} endAt 结束时间戳
 * @param {boolean} forceUpdate 是否强制更新缓存
 * @return {Array<Object>} 聚合后的错误名称分布列表
 */
async function getErrorNameDistributionByTimeWithCache (projectId, startAt, endAt, forceUpdate = false) {
  let distributionList = []
  let distributionMap = {}
  // 按天遍历时间范围
  for (let timeAt = startAt; timeAt <= endAt; timeAt += 86400) {
    let key = getRedisKey(REDIS_KEY_ERROR_NAME_DISTRIBUTION_CACHE, projectId, timeAt)
    let redisDistributionList = await redis.asyncGet(key)

    if (_.isEmpty(redisDistributionList) || forceUpdate) {
      // 查询当天的分布数据并写入缓存，过期时间为 1 天
      redisDistributionList = await getErrorNameDistributionInSameMonth(projectId, moment.unix(timeAt).startOf('day').unix(), moment.unix(timeAt).endOf('day').unix())
      await redis.asyncSetex(key, 86400, redisDistributionList)
    }
    // 累加每天的错误计数到总 Map 中
    for (let redisDistribution of redisDistributionList) {
      let errorName = _.get(redisDistribution, ['error_name'], '')
      let errorCount = _.get(redisDistribution, ['error_count'], 0)
      let oldCount = _.get(distributionMap, [errorName], 0)
      _.set(distributionMap, [errorName], oldCount + errorCount)
    }
  }
  // 将 Map 转换回数组格式
  for (let errorName of Object.keys(distributionMap)) {
    distributionList.push({
      error_name: errorName,
      error_count: _.get(distributionMap, [errorName], 0)
    })
  }
  return distributionList
}

/**
 * 获取指定时间范围和统计粒度下的原始错误汇总记录列表
 * 主要用于上层命令（如 Summary:Error）进行二次聚合处理
 * @param {number} projectId 项目ID
 * @param {number} startAt 开始时间戳
 * @param {number} endAt 结束时间戳
 * @param {string} countType 统计粒度 (minute/hour/day)
 * @return {Array<Object>} 原始记录列表
 */
async function getErrorSummaryByCountType (projectId, startAt, endAt, countType) {
  let tableName = getTableName(projectId, startAt)
  let timeList = DatabaseUtil.getDatabaseTimeList(startAt, endAt, countType)
  let rawResultList = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('count_type', countType)
    .whereIn('count_at_time', timeList)
    .catch(err => {
      Logger.error('getErrorSummary', err.message)
      return []
    })
  return rawResultList
}

/**
 * 生成 Redis 缓存键
 * @param {string} baseKey 基础键名
 * @param {number} projectId 项目ID
 * @param {number} timeAt 时间戳
 * @return {string} 完整的 Redis Key
 */
function getRedisKey (baseKey, projectId, timeAt) {
  return baseKey + '_' + projectId + '_' + moment.unix(timeAt).format('YYYY-MM-DD')
}

export default {
  insertErrorSummaryRecord,
  getTableName,
  get,
  replaceSummaryRecord,
  getErrorNameList,
  getErrorNameDistributionByTimeWithCache,

  getUrlPathDistributionListByErrorNameList,
  getErrorNameDistributionListInSameMonth,
  getList,
  getStackAreaDistribution,
  getErrorSummaryByCountType
}