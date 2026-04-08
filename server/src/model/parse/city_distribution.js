import Knex from '~/src/library/mysql'
import moment from 'moment'
import _ from 'lodash'
import Logger from '~/src/library/logger'

// 定义日期格式常量，用于生成分表后缀 (YYYYMM)
const DateFormat = 'YYYYMM'

// 城市分布基础表名
const BaseTableName = 't_r_city_distribution'
// 数据库表中需要查询或操作的字段列表
const TABLE_COLUMN = [
  `id`,
  `city_distribute_json`, // 存储城市分布数据的 JSON 字符串
  `create_time`,
  `update_time`
]

/**
 * 根据项目ID和创建时间戳生成对应的分表表名
 * 表名格式: t_r_city_distribution_{projectId}_{YYYYMM}
 * @param {number} projectId - 项目ID
 * @param {number} createTimeAt - Unix时间戳，用于确定月份
 * @return {String} 生成的完整表名
 */
function getTableName (projectId, createTimeAt) {
  let YmDate = moment.unix(createTimeAt).format(DateFormat)
  return BaseTableName + '_' + projectId + '_' + YmDate
}

/**
 * 获取指定ID的城市分布记录，并解析JSON数据
 * 如果解析失败或记录不存在，返回空对象 {}
 * @param {number} id - 城市分布记录的主键ID
 * @param {number} projectId - 项目ID
 * @param {number} createTimeAt - 创建时间戳，用于定位分表
 * @return {object} 解析后的城市分布对象，结构通常为 { country: { province: { city: count } } }
 */
async function getCityDistributionRecord (id, projectId, createTimeAt) {
  let tableName = getTableName(projectId, createTimeAt)
  let recordList = await Knex
    .select(TABLE_COLUMN)
    .from(tableName)
    .where('id', '=', id)
    .catch(e => {
      return []
    })
  // 安全地获取第一条记录的 city_distribute_json 字段，默认为空JSON字符串
  let resultJson = _.get(recordList, [0, 'city_distribute_json'], '{}')
  let result = {}
  try {
    // 尝试解析 JSON 字符串
    result = JSON.parse(resultJson)
    return result
  } catch (e) {
    // 解析异常时返回空对象，防止上层调用崩溃
    return {}
  }
}

/**
 * 更新指定的城市分布记录
 * 主要更新 city_distribute_json 内容和 update_time
 * @param {number} id - 城市分布记录的主键ID
 * @param {number} projectId - 项目ID
 * @param {number} createTimeAt - 创建时间戳，用于定位分表
 * @param {string} cityDistributeJson - 序列化后的城市分布JSON字符串
 * @return {boolean} 更新是否成功（受影响行数 > 0）
 */
async function updateCityDistributionRecord (id, projectId, createTimeAt, cityDistributeJson) {
  let tableName = getTableName(projectId, createTimeAt)
  let updateAt = moment().unix()
  let data = {
    city_distribute_json: cityDistributeJson,
    update_time: updateAt
  }
  let affectRows = await Knex(tableName)
    .update(data)
    .where('id', '=', id)
    .catch(e => {
      Logger.warn('城市数据更新失败, 错误原因 =>', e)
      return 0
    })
  return affectRows > 0
}

/**
 * 插入一条新的城市分布记录
 * 自动填充 create_time 和 update_time
 * @param {string} cityDistributeJson - 序列化后的城市分布JSON字符串
 * @param {number} projectId - 项目ID
 * @param {number} createTimeAt - 创建时间戳，用于定位分表
 * @return {number} 新插入记录的ID，若失败则返回 0
 */
async function insertCityDistributionRecord (cityDistributeJson, projectId, createTimeAt) {
  let tableName = getTableName(projectId, createTimeAt)
  let updateAt = moment().unix()
  let data = {
    city_distribute_json: cityDistributeJson,
    create_time: updateAt,
    update_time: updateAt
  }
  let insertResult = await Knex
    .returning('id') // 请求返回新插入行的 ID
    .insert(data)
    .into(tableName)
    .catch(e => {
      Logger.warn('城市数据插入失败, 错误原因 =>', e)
      return []
    })
  // 安全地获取插入ID，若数组为空则默认返回 0
  let insertId = _.get(insertResult, [0], 0)

  return insertId
}

/**
 * 合并两个城市分布数据对象
 * 将 source 中的数据累加到 dist 中。如果 dist 中不存在对应的国家/省份/城市，则直接复制；
 * 如果存在，则通过 processCityData 回调函数处理计数值（默认是直接相加）。
 * 
 * @param {Object} distributionSource - 来源数据对象，结构: { country: { province: { city: count } } }
 * @param {Object} distributionDist - 目标数据对象，将被修改并返回
 * @param {Function} processCityData - 处理相同城市计数的回调函数，参数为 (distCount, sourceCount)，默认返回两者之和
 * @return {Object} 合并后的最终分布数据对象
 */
function mergeDistributionData (distributionSource, distributionDist, processCityData = (cityDataDist, cityDataSource) => { return cityDataDist + cityDataSource }) {
  // 克隆目标对象，避免直接修改原引用
  let finalDistribution = _.clone(distributionDist)
  
  // 遍历来源数据的每一层：国家 -> 省份 -> 城市
  for (let country of Object.keys(distributionSource)) {
    if (_.has(distributionDist, country) === false) {
      // 如果目标中不存在该国家，直接整个拷贝
      _.set(finalDistribution, [country], distributionSource[country])
      continue
    }
    let countryDistributionSource = distributionSource[country]
    let countryDistributionDist = distributionDist[country]
    
    for (let province of Object.keys(countryDistributionSource)) {
      if (_.has(countryDistributionDist, province) === false) {
        // 如果目标中不存在该省份，直接整个拷贝
        _.set(finalDistribution, [country, province], distributionSource[country][province])
        continue
      }
      let provinceDistributionSource = countryDistributionSource[province]
      let provinceDistributionDist = countryDistributionDist[province]
      
      for (let city of Object.keys(provinceDistributionSource)) {
        if (_.has(provinceDistributionDist, city) === false) {
          // 如果目标中不存在该城市，直接赋值
          _.set(finalDistribution, [country, province, city], distributionSource[country][province][city])
          continue
        }
        // 如果城市已存在，使用回调函数合并计数值
        let cityDistributionSource = provinceDistributionSource[city]
        let cityDistributionDist = provinceDistributionDist[city]
        _.set(finalDistribution, [country, province, city], processCityData(cityDistributionDist, cityDistributionSource))
      }
    }
  }
  return finalDistribution
}

/**
 * 批量获取指定ID列表的城市分布原始记录
 * 用于在汇总统计时，一次性拉取多个城市分布ID对应的数据，减少数据库交互次数
 * @param {number} projectId - 项目ID
 * @param {Array<number>} cityDistributionIdList - 城市分布ID数组
 * @param {number} createTimeAt - 创建时间戳，用于定位分表
 * @return {Array} 原始记录列表，包含 id 和 city_distribute_json 等字段
 */
async function getByIdListInOneMonth (projectId, cityDistributionIdList, createTimeAt) {
  const talbeName = getTableName(projectId, createTimeAt)
  const rawRecordList = await Knex
    .select(TABLE_COLUMN)
    .from(talbeName)
    .whereIn('id', cityDistributionIdList)
    .catch(err => {
      Logger.error('citydistribution => getByIdListInOneMonth:', err.message)
      return []
    })
  return rawRecordList
}

/**
 * 将嵌套的城市分布对象拍平为一维数组
 * 遍历所有国家、省份、城市，提取最内层的计数值组成列表
 * 通常用于快速计算总和或进行其他扁平化处理
 * @param {Object} distribution - 嵌套的城市分布对象
 * @return {Array} 包含所有城市计数值的数组
 */
function getFlattenCityRecordListInDistribution (distribution) {
  let recordList = []
  for (let country of Object.keys(distribution)) {
    let countryDistribution = distribution[country]
    for (let province of Object.keys(countryDistribution)) {
      let provinceDistribution = countryDistribution[province]
      for (let city of Object.keys(provinceDistribution)) {
        let cityRecord = provinceDistribution[city]
        recordList.push(cityRecord)
      }
    }
  }
  return recordList
}

export default {
  getCityDistributionRecord,
  insertCityDistributionRecord,
  updateCityDistributionRecord,
  mergeDistributionData,
  getFlattenCityRecordListInDistribution,
  getTableName,
  getByIdListInOneMonth
}