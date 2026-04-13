import Knex from '~/src/library/mysql'
import moment from 'moment'
import _ from 'lodash'
import Logger from '~/src/library/logger'
import MProject from '~/src/model/project/project'
import MMonitor from '~/src/model/parse/monitor'
import MCityDistribution from '~/src/model/parse/city_distribution'
import DATE_FORMAT from '~/src/constants/date_format'

/**
 * HTTP 错误分布统计模型 (Http Error Summary)
 * 负责统计指定时间范围内 HTTP 状态码的分布情况（2xx, 3xx, 4xx, 5xx 等），并按城市维度聚合。
 * 数据源来自监控日志表 t_o_monitor_collection_{projectId}_{YYYYMM}，结果存入 t_r_http_error_distribution 表。
 */
const BASE_TABLE_NAME = 't_r_http_error_distribution'
const TABLE_COLUMN = [
  `id`,
  `project_id`,
  `total_count`,
  `http_code_2xx_count`,
  `http_code_3xx_count`,
  `http_code_4xx_count`,
  `http_code_5xx_count`,
  `http_code_other_count`,
  `city_distribute_id`,
  `count_type`,
  `count_at_time`,
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
 * 执行 HTTP 错误统计汇总
 * 逻辑：
 * 1. 遍历所有项目
 * 2. 从监控日志表中查询指定时间段内 http_code > 0 的记录
 * 3. 按 http_code 和地理位置分组计数
 * 4. 将状态码归类为 2xx/3xx/4xx/5xx/other
 * 5. 内存聚合各类错误计数及城市分布
 * 6. 写入汇总表
 * @param {number} visitAt 统计参考时间戳
 * @param {string} countType 统计粒度 (day/month)
 * @param {number} startTimestamp 开始时间戳
 * @param {number} endTimestamp 结束时间戳
 */
async function summaryHttpError (visitAt, countType, startTimestamp, endTimestamp) {
  const visitAtTime = moment.unix(visitAt).format(DATE_FORMAT.DISPLAY_BY_MINUTE)
  const countAtTime = moment.unix(visitAt).format(DATE_FORMAT.DATABASE_BY_UNIT[countType])
  const projectList = await MProject.getList()
  for (let rawProject of projectList) {
    const projectId = _.get(rawProject, 'id', '')
    const projectName = _.get(rawProject, 'project_name', '')
    const systemTableName = MMonitor.getTableName(projectId, visitAt)
    Logger.info(`开始处理项目${projectId}(${projectName})的数据`)
    Logger.info(`[${projectId}(${projectName})] 统计时间:${visitAtTime}`)
    const sumRes = await Knex.count('* as total_count').select([`http_code`, `country`, `province`, `city`])
      .from(systemTableName)
      .where('http_code', '>', 0)
      .andWhere('log_at', '>', startTimestamp)
      .andWhere('log_at', '<', endTimestamp)
      .groupBy('http_code')
      .groupBy('country')
      .groupBy('province')
      .groupBy('city')
      .catch((err) => {
        Logger.error(err)
        return []
      })
    if (sumRes.length === 0) {
      return
    }

    let distribution = {}
    let totalCount = 0
    let recodeInfo = {}
    for (let countItem of sumRes) {
      const { country, province, city, total_count: count } = countItem
      let distributionPath = [country, province, city]
      // 获取状态码对应的分类字段名 (如 http_code_4xx_count)
      let errorTypeName = getHttpCodeType(countItem['http_code'])
      if (_.has(recodeInfo, errorTypeName)) {
        recodeInfo[errorTypeName] += count
      } else {
        recodeInfo[errorTypeName] = 1
      }
      countItem['http_code_type'] = errorTypeName
      totalCount = totalCount + count
      _.set(distribution, distributionPath, count)
    }
    recodeInfo.totalCount = totalCount
    await replaceAndAutoIncreaseHttpErrorRecord(projectId, countType, countAtTime, recodeInfo, distribution)
    Logger.info(`项目${projectId}(${projectName})处理完毕`)
  }
}

/**
 * 根据 HTTP 状态码获取对应的统计字段名
 * @param {number} httpCode
 * @return {string} 如 'http_code_4xx_count'
 */
function getHttpCodeType (httpCode) {
  let codeType
  if (_.isNumber(httpCode) && httpCode > 99 && httpCode < 1000) {
    const type = _.floor(httpCode / 100)
    switch (type) {
      case 2:
        codeType = 'http_code_2xx_count'
        break
      case 3:
        codeType = 'http_code_3xx_count'
        break
      case 4:
        codeType = 'http_code_4xx_count'
        break
      case 5:
        codeType = 'http_code_5xx_count'
        break
      default:
        codeType = 'http_code_other_count'
    }
  }
  return codeType
}

/**
 * 自动创建或更新 HTTP 错误分布记录
 * 逻辑：
 * 1. 检查是否存在对应 projectId, count_at_time 的记录（注意：此处查询条件未包含 count_type，可能存在潜在逻辑依赖，需确保调用方保证时间粒度唯一性或表结构约束）
 * 2. 若存在：更新各类状态码计数、总数及城市分布
 * 3. 若不存在：插入新记录
 * @param {number} projectId
 * @param {string} countType
 * @param {number} countAtTime
 * @param {object} recordInfo 包含 totalCount 及各状态码计数
 * @param {object} cityDistribute
 * @return {boolean}
 */
async function replaceAndAutoIncreaseHttpErrorRecord (projectId, countType, countAtTime, recordInfo, cityDistribute) {
  const {
    totalCount,
    http_code_2xx_count: httpCode2xx,
    http_code_3xx_count: httpCode3xx,
    http_code_4xx_count: httpCode4xx,
    http_code_5xx_count: httpCode5xx,
    http_code_other_count: httpCodeOther
  } = recordInfo

  if (!httpCode2xx && !httpCode3xx && !httpCode4xx && !httpCode5xx && !httpCodeOther) {
    return false
  }
  let tableName = getTableName()
  let updateAt = moment().unix()
  // 返回值是一个列表
  let oldRecordList = await Knex
    .select([`total_count`, `city_distribute_id`, `create_time`, `id`])
    .from(tableName)
    .where('project_id', '=', projectId)
    .andWhere('count_at_time', '=', countAtTime)
    .catch((err) => {
      Logger.error(err)
      return []
    })
  // 利用get方法, 不存在直接返回0, 没毛病
  let id = _.get(oldRecordList, [0, 'id'], 0)
  let cityDistributeIdInDb = _.get(oldRecordList, [0, 'city_distribute_id'], 0)
  let createTimeInDb = _.get(oldRecordList, [0, 'create_time'], 0)
  // let cityDistributeJsonInDb = '{}'
  // if (cityDistributeIdInDb > 0) {
  //   cityDistributeJsonInDb = await getCityDistributionRecord(cityDistributeIdInDb, projectId, createTimeInDb)
  // }
  // let cityDistributeInDb = JSON.parse(cityDistributeJsonInDb)

  let data = {
    project_id: projectId,
    http_code_2xx_count: httpCode2xx,
    http_code_3xx_count: httpCode3xx,
    http_code_4xx_count: httpCode4xx,
    http_code_5xx_count: httpCode5xx,
    http_code_other_count: httpCodeOther,
    count_at_time: countAtTime,
    total_count: totalCount,
    count_type: countType,
    update_time: updateAt
  }
  let isSuccess = false
  if (id > 0) {
    // 更新城市分布数据
    // cityDistribute = mergeDistributionData(cityDistributeInDb, cityDistribute, (newCityRecord, oldCityRecord) => { return newCityRecord + oldCityRecord })
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
 * 获取记录
 */
async function getRecord (projectId, countAtMonth) {
  let tableName = getTableName()
  let recordList = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('project_id', '=', projectId)
    .andWhere('count_at_time', '=', countAtMonth)
    .catch((err) => {
      Logger.error(err)
      return []
    })
  return _.get(recordList, [0], {})
}

export default {
  getRecord,
  getHttpCodeType,
  summaryHttpError
}
