import moment from 'moment'
import _ from 'lodash'
import Knex from '~/src/library/mysql'
import DATE_FORMAT from '~/src/constants/date_format'
import DatabaseUtil from '~/src/library/utils/modules/database'
import Logger from '~/src/library/logger'

import MCityDistribution from '~/src/model/parse/city_distribution'

const BASE_TABLE_NAME = 't_r_performance'

// 定义各种性能指标对应的数据库字段名
const INDICATOR_TYPE_DNS查询耗时 = 'dns_lookup_ms'
const INDICATOR_TYPE_TCP链接耗时 = 'tcp_connect_ms'
const INDICATOR_TYPE_请求响应耗时 = 'response_request_ms'
const INDICATOR_TYPE_内容传输耗时 = 'response_transfer_ms'
const INDICATOR_TYPE_DOM解析耗时 = 'dom_parse_ms'
const INDICATOR_TYPE_资源加载耗时 = 'load_resource_ms'
const INDICATOR_TYPE_SSL连接耗时 = 'ssl_connect_ms'

const INDICATOR_TYPE_首次渲染耗时 = 'first_render_ms'
const INDICATOR_TYPE_首包时间耗时 = 'first_tcp_ms'
const INDICATOR_TYPE_首次可交互耗时 = 'first_response_ms'
const INDICATOR_TYPE_DOM_READY_耗时 = 'dom_ready_ms'
const INDICATOR_TYPE_页面完全加载耗时 = 'load_complete_ms'

// 只能通过中括号形式设置key值
const INDICATOR_TYPE_MAP = {}
INDICATOR_TYPE_MAP[INDICATOR_TYPE_DNS查询耗时] = 'DNS查询耗时'
INDICATOR_TYPE_MAP[INDICATOR_TYPE_TCP链接耗时] = 'TCP链接耗时'
INDICATOR_TYPE_MAP[INDICATOR_TYPE_请求响应耗时] = '请求响应耗时'
INDICATOR_TYPE_MAP[INDICATOR_TYPE_内容传输耗时] = '内容传输耗时'
INDICATOR_TYPE_MAP[INDICATOR_TYPE_DOM解析耗时] = 'DOM解析耗时'
INDICATOR_TYPE_MAP[INDICATOR_TYPE_资源加载耗时] = '资源加载耗时'
INDICATOR_TYPE_MAP[INDICATOR_TYPE_SSL连接耗时] = 'SSL连接耗时'

INDICATOR_TYPE_MAP[INDICATOR_TYPE_首包时间耗时] = '首包时间耗时'
INDICATOR_TYPE_MAP[INDICATOR_TYPE_首次渲染耗时] = '首次渲染耗时'
INDICATOR_TYPE_MAP[INDICATOR_TYPE_首次可交互耗时] = '首次可交互耗时'
INDICATOR_TYPE_MAP[INDICATOR_TYPE_DOM_READY_耗时] = 'DOM_READY_耗时'
INDICATOR_TYPE_MAP[INDICATOR_TYPE_页面完全加载耗时] = '页面完全加载耗时'

// 指标列表
const INDICATOR_TYPE_LIST = Object.keys(INDICATOR_TYPE_MAP)

const TABLE_COLUMN = [
  `id`,
  `sum_indicator_value`, // 指标值总和，用于计算平均值
  `pv`,                  // 页面访问量
  `indicator`,           // 指标类型
  `url`,                 // 页面URL
  `city_distribute_id`,  // 关联的城市分布ID
  `count_at_time`,       // 统计时间点
  `count_type`,          // 统计粒度 (minute/hour/day)
  `create_time`,
  `update_time`
]

/**
 * 获取表名
 * 性能数据表按月分表，格式为: t_r_performance_{projectId}_{YYYYMM}
 * @param {*} projectId
 * @param {number} createAt 创建时间戳，用于确定月份
 */
function getTableName (projectId, createAt) {
  let createAtMoment = moment.unix(createAt)
  let monthStr = createAtMoment.clone().format('YYYYMM')
  return `${BASE_TABLE_NAME}_${projectId}_${monthStr}`
}

/**
 * 获取单条性能指标记录
 * @param {*} projectId
 * @param {*} url
 * @param {*} indicator 指标类型
 * @param {*} countAt 统计时间点
 * @param {*} countType 统计粒度
 */
async function get (projectId, url, indicator, countAt, countType = DATE_FORMAT.UNIT.MINUTE) {
  let tableName = getTableName(projectId, countAt)
  let dateFormat = DATE_FORMAT.DATABASE_BY_UNIT[countType]

  let countAtTime = moment.unix(countAt).format(dateFormat)
  let rawRecord = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where({
      url: url,
      indicator: indicator,
      count_at_time: countAtTime,
      count_type: countType
    })
    .catch((e) => {
      Logger.warn('查询失败, 错误原因 =>', e)
      return []
    })
  let record = _.get(rawRecord, [0], {})
  return record
}

/**
 * 获取性能指标记录列表
 * 支持跨月查询，会自动获取范围内所有涉及的月份表进行联合查询
 * @param {*} projectId
 * @param {*} startAt 开始时间
 * @param {*} finishAt 结束时间
 * @param {*} condition 查询条件，可包含 urlList 和 indicatorList
 * @param {*} countAt
 * @param {*} countType 统计粒度
 */
async function getList (projectId, startAt, finishAt, condition = {}, countType = DATE_FORMAT.UNIT.MINUTE) {
  let startAtMoment = moment.unix(startAt)
  let recordList = []
  // 获取时间范围内所有涉及的表名
  let tableNameList = DatabaseUtil.getTableNameListInRange(projectId, startAt, finishAt, getTableName)

  let countAtTimeList = []
  // 获取所有可能的countAtTime格式化字符串
  for (let countStartAtMoment = startAtMoment.clone(); countStartAtMoment.unix() < finishAt; countStartAtMoment = countStartAtMoment.clone().add(1, countType)) {
    let formatCountAtTime = countStartAtMoment.format(DATE_FORMAT.DATABASE_BY_UNIT[countType])
    countAtTimeList.push(formatCountAtTime)
  }

  // 遍历每个分表进行查询
  for (let tableName of tableNameList) {
    let rawRecordList = await Knex
      .select(TABLE_COLUMN)
      .from(tableName)
      .where('count_type', '=', countType)
      .whereIn('count_at_time', countAtTimeList)
      .andWhere(builder => {
        // url和indicator需要实时判断是否有该条件
        if (_.has(condition, ['urlList'])) {
          builder.whereIn('url', condition['urlList'])
        }
        if (_.has(condition, ['indicatorList'])) {
          builder.whereIn('indicator', condition['indicatorList'])
        }
      })
      .catch((e) => {
        Logger.warn('查询失败, 错误原因 =>', e)
        return []
      })
    recordList = recordList.concat(rawRecordList)
  }
  return recordList
}

/**
 * 获取一段时间内出现过的所有URL列表
 * 用于后续汇总计算，避免全表扫描
 * @param {*} projectId
 * @param {*} indicatorList 关注的指标列表
 * @param {*} startAt
 * @param {*} endAt
 * @param {*} countType
 */
async function getDistinctUrlListInRange (projectId, indicatorList, startAt, endAt, countType = DATE_FORMAT.UNIT.MINUTE) {
  let startAtMoment = moment.unix(startAt).startOf(countType)
  let urlList = []
  let tableNameList = DatabaseUtil.getTableNameListInRange(projectId, startAt, endAt, getTableName)

  let countAtTimeList = []
  // 获取所有可能的countAtTime
  for (let countStartAtMoment = startAtMoment.clone(); countStartAtMoment.unix() < endAt; countStartAtMoment = countStartAtMoment.clone().add(1, countType)) {
    let formatCountAtTime = countStartAtMoment.format(DATE_FORMAT.DATABASE_BY_UNIT[countType])
    countAtTimeList.push(formatCountAtTime)
  }
  // 循环查询数据库
  for (let tableName of tableNameList) {
    let rawRecordList = await Knex
      .distinct(['url'])
      .from(tableName)
      .where({
        count_type: countType
      })
      .whereIn('indicator', indicatorList)
      .whereIn('count_at_time', countAtTimeList)
      .catch((e) => {
        Logger.warn('查询失败, 错误原因 =>', e)
        return []
      })
    for (let rawRecord of rawRecordList) {
      if (_.has(rawRecord, ['url'])) {
        let url = _.get(rawRecord, ['url'])
        urlList.push(url)
      }
    }
  }
  // 去重
  let distinctUrlList = _.union(urlList)
  return distinctUrlList
}

/**
 * 获取同一月份内指定URL列表的性能概览
 * 计算每个指标的平均值 (sum_indicator_value / pv)
 * @param {*} projectId
 * @param {*} urlList
 * @param {*} startAt
 * @param {*} endAt
 * @param {*} countType
 */
async function getUrlOverviewInSameMonth (projectId, urlList, startAt, endAt, countType) {
  let startAtMoment = moment.unix(startAt).startOf(countType)
  let overview = {}
  let tableName = getTableName(projectId, startAt)

  let countAtTimeList = []
  // 获取所有可能的countAtTime
  for (let countStartAtMoment = startAtMoment.clone(); countStartAtMoment.unix() < endAt; countStartAtMoment = countStartAtMoment.clone().add(1, countType)) {
    let formatCountAtTime = countStartAtMoment.format(DATE_FORMAT.DATABASE_BY_UNIT[countType])
    countAtTimeList.push(formatCountAtTime)
  }

  // 查询数据库，按URL、类型、指标分组求和
  let rawRecordList = await Knex
    .select(['url', 'count_type', 'indicator'])
    .sum('sum_indicator_value as total_sum_indicator_value')
    .sum('pv as total_pv')
    .from(tableName)
    .where({
      count_type: countType
    })
    .whereIn('url', urlList)
    .whereIn('count_at_time', countAtTimeList)
    .groupBy([
      'url', 'count_type', 'indicator'
    ])
    .catch((e) => {
      Logger.warn('查询失败, 错误原因 =>', e)
      return []
    })
  let rawOverview = {}
  // 聚合数据
  for (let rawRecord of rawRecordList) {
    let indicator = _.get(rawRecord, ['indicator'], '')
    let totalSumIndicatorValue = _.get(rawRecord, ['total_sum_indicator_value'], 0)
    let totalPv = _.get(rawRecord, ['total_pv'], 0)
    if (_.has(rawOverview, [indicator])) {
      let oldTotalSumIndicatorValue = _.get(rawOverview, [indicator, 'total_sum_indicator_value'], 0)
      let oldTotalPv = _.get(rawOverview, [indicator, 'total_pv'], 0)
      _.set(rawOverview, [indicator, 'total_sum_indicator_value'], oldTotalSumIndicatorValue + totalSumIndicatorValue)
      _.set(rawOverview, [indicator, 'total_pv'], oldTotalPv + totalPv)
    } else {
      _.set(rawOverview, [indicator, 'total_sum_indicator_value'], totalSumIndicatorValue)
      _.set(rawOverview, [indicator, 'total_pv'], totalPv)
    }
  }

  // 计算每个指标的平均值
  for (let indicator of INDICATOR_TYPE_LIST) {
    if (_.has(rawOverview, [indicator])) {
      let sum = _.get(rawOverview, [indicator, 'total_sum_indicator_value'], 0)
      let pv = _.get(rawOverview, [indicator, 'total_pv'], 0)
      overview[indicator] = parseInt(DatabaseUtil.computePercent(sum, pv, false))
    } else {
      overview[indicator] = 0
    }
  }

  return overview
}

/**
 * 生成同一月内的指标折线图数据
 * 返回按时间排序的指标值数组，缺失时间点补0
 * @param {*} projectId
 * @param {*} url
 * @param {*} indicator
 * @param {*} startAt
 * @param {*} endAt
 * @param {*} countType
 */
async function getIndicatorLineChartDataInSameMonth (projectId, url, indicator, startAt, endAt, countType) {
  let startAtMoment = moment.unix(startAt).startOf(countType)
  let lineChartDataList = []
  let lineChartDataMap = {}
  let tableName = getTableName(projectId, startAt)
  let unixKeyList = []

  let countAtTimeList = []
  // 获取所有可能的countAtTime，并生成对应的时间戳Key列表
  for (let countStartAtMoment = startAtMoment.clone(); countStartAtMoment.unix() < endAt; countStartAtMoment = countStartAtMoment.clone().add(1, countType)) {
    let formatCountAtTime = countStartAtMoment.format(DATE_FORMAT.DATABASE_BY_UNIT[countType])
    countAtTimeList.push(formatCountAtTime)
    // 将来会以时间戳为key, 对数据进行排序
    unixKeyList.push(countStartAtMoment.unix())
  }
  // 查询数据库
  let rawRecordList = await Knex
    .select(['sum_indicator_value', 'pv', 'count_at_time'])
    .from(tableName)
    .where({
      count_type: countType
    })
    .where('url', url)
    .where('indicator', indicator)
    .whereIn('count_at_time', countAtTimeList)
    .catch((e) => {
      Logger.warn('查询失败, 错误原因 =>', e)
      return []
    })
  // 将查询结果映射到时间戳Key
  for (let rawRecord of rawRecordList) {
    let countAtTime = _.get(rawRecord, ['count_at_time'], 0)
    let sumIndicatorValue = _.get(rawRecord, ['sum_indicator_value'], 0)
    let pv = _.get(rawRecord, ['pv'], 0)
    let recordAt = moment(countAtTime, DATE_FORMAT.DATABASE_BY_UNIT[countType]).unix()
    lineChartDataMap[recordAt] = parseInt(DatabaseUtil.computePercent(sumIndicatorValue, pv, false))
  }
  // 按时间顺序生成最终列表，缺失值补0
  for (let unixKey of unixKeyList) {
    let result = _.get(lineChartDataMap, [unixKey], 0)
    lineChartDataList.push({
      indicator: indicator,
      index: moment.unix(unixKey).format(DATE_FORMAT.DISPLAY_BY_UNIT[countType]),
      index_timestamp_ms: unixKey * 1000,
      value: result
    })
  }
  return lineChartDataList
}

/**
 * 获取指定时间范围内的按城市分布的性能指标
 * 合并多个记录的城市分布数据
 * @param {*} projectId
 * @param {*} urlList
 * @param {*} indicatorList
 * @param {*} startAt
 * @param {*} endAt
 * @param {*} countType
 * @returns {Object}
 */
async function getCityDistributeInRange (projectId, urlList, indicatorList, startAt, endAt, countType = DATE_FORMAT.UNIT.MINUTE) {
  let cityDistributeTotal = {}
  // uv记录表按月分表, 因此需要分月计算总uv
  let rawRecordList = await getList(projectId, startAt, endAt, { urlList, indicatorList }, countType)
  for (let rawRecord of rawRecordList) {
    let cityDistributeId = _.get(rawRecord, ['city_distribute_id'], 0)
    let recordCreateAt = _.get(rawRecord, ['create_time'], 0)
    if (_.isEmpty(rawRecord) || cityDistributeId === 0) {
      continue
    }
    // 获取单个记录的城市分布详情
    let cityDistributeItem = await MCityDistribution.getCityDistributionRecord(cityDistributeId, projectId, recordCreateAt)
    // 合并到总分布中
    cityDistributeTotal = MCityDistribution.mergeDistributionData(
      cityDistributeItem,
      cityDistributeTotal,
      (cityDataItem, cityDataTotal) => {
        let result = {}
        for (let key of Object.keys(cityDataItem)) {
          result[key] = cityDataItem[key] + cityDataTotal[key]
        }
        return result
      })
  }
  return cityDistributeTotal
}

/**
 * 自动创建或更新页面性能数据记录
 * 同时处理关联的城市分布数据
 * @param {*} projectId
 * @param {*} url
 * @param {*} indicator
 * @param {*} countAt
 * @param {*} countType
 * @param {*} sumIndicatorValue 指标值总和
 * @param {*} pv 页面访问量
 * @param {*} cityDistribute 城市分布对象
 */
async function replaceInto (projectId, url, indicator, countAt, countType = DATE_FORMAT.UNIT.MINUTE, sumIndicatorValue = 0, pv = 0, cityDistribute = {}) {
  let tableName = getTableName(projectId, countAt)
  let dateFormat = DATE_FORMAT.DATABASE_BY_UNIT[countType]

  let countAtTime = moment.unix(countAt).format(dateFormat)

  let updateAt = moment().unix()

  // 查找是否已存在记录
  let oldRecordList = await Knex
    .select([`id`, `create_time`, `city_distribute_id`])
    .from(tableName)
    .where({
      url: url,
      indicator: indicator,
      count_at_time: countAtTime,
      count_type: countType
    })
    .catch((e) => {
      Logger.warn('查询失败, 错误原因 =>', e)

      return []
    })
  // 利用get方法, 不存在直接返回0, 没毛病
  let id = _.get(oldRecordList, [0, 'id'], 0)
  let createTimeInDb = _.get(oldRecordList, [0, 'create_time'], 0)
  let cityDistributeIdInDb = _.get(oldRecordList, [0, 'city_distribute_id'], 0)
  let data = {
    url,
    indicator,
    pv,
    count_at_time: countAtTime,
    count_type: countType,
    sum_indicator_value: sumIndicatorValue,
    update_time: updateAt
  }
  let isSuccess = false
  if (id > 0) {
    // 更新城市分布数据
    let isUpdateSuccess = MCityDistribution.updateCityDistributionRecord(cityDistributeIdInDb, projectId, createTimeInDb, JSON.stringify(cityDistribute))
    if (isUpdateSuccess === false) {
      Logger.log('城市数据更新失败')
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
      Logger.log('城市数据插入失败')
      return false
    }
    data['city_distribute_id'] = cityDistributeId
    data['create_time'] = updateAt
    let insertResult = await Knex
      .returning('id')
      .insert(data)
      .into(tableName)
      .catch((e) => {
        Logger.warn('插入失败, 原记录 =>', data, '错误原因 =>', e)
        return []
      })
    let insertId = _.get(insertResult, [0], 0)
    isSuccess = insertId > 0
  }
  return isSuccess
}

export default {
  getTableName,

  get,
  getList,
  replaceInto,
  getCityDistributeInRange,
  getDistinctUrlListInRange,

  getUrlOverviewInSameMonth,
  getIndicatorLineChartDataInSameMonth,

  // 常量列表
  // 区间段耗时
  INDICATOR_TYPE_DNS查询耗时,
  INDICATOR_TYPE_TCP链接耗时,
  INDICATOR_TYPE_请求响应耗时,
  INDICATOR_TYPE_DOM解析耗时,
  INDICATOR_TYPE_内容传输耗时,
  INDICATOR_TYPE_资源加载耗时,
  INDICATOR_TYPE_SSL连接耗时,

  // 关键性能指标
  INDICATOR_TYPE_首包时间耗时,
  INDICATOR_TYPE_首次渲染耗时,
  INDICATOR_TYPE_首次可交互耗时,
  INDICATOR_TYPE_DOM_READY_耗时,
  INDICATOR_TYPE_页面完全加载耗时,

  INDICATOR_TYPE_MAP,
  INDICATOR_TYPE_LIST
}