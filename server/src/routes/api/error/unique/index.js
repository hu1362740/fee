import moment from 'moment'
import _ from 'lodash'
import MMonitor from '~/src/model/parse/monitor'
import DATE_FORMAT from '~/src/constants/date_format'
import API_RES from '~/src/constants/api_res'
import RouterConfigBuilder from '~/src/library/utils/modules/router_config_builder'
import MErrorSummary from '~/src/model/summary/error_summary'
// import Viser from '~/src/routes/api/error/viser'
import PROVINCE_LIST from '~/src/constants/province'

// 分页大小
const PAGE_SIZE = 10
// URL分布最大显示数量
const MAX_URL = 10

/**
 * 集中解析请求参数
 * 提取项目ID、时间范围、URL、页码、错误名称列表等
 * @param {Object} request - Express请求对象
 * @returns {Object} 解析后的参数对象
 */
function parseQueryParam (request) {
  let projectId = _.get(request, ['fee', 'project', 'projectId'], 0)
  let startAt = _.get(request, ['query', 'start_at'], 0)
  let endAt = _.get(request, ['query', 'end_at'], 0)
  let url = _.get(request, ['query', 'url'], '')
  let currentPage = _.get(request, ['query', 'current_page'], 1)
  let errorNameListJson = _.get(request, ['query', 'error_name_list_json'], '[]')
  let errorNameList = []
  
  // 尝试解析JSON格式的错误名称列表
  try {
    errorNameList = JSON.parse(errorNameListJson)
  } catch (error) {
    errorNameList = []
  }

  // 如果时间参数无效，提供默认值：当天开始到当天结束
  if (startAt <= 0) {
    startAt = moment().startOf(DATE_FORMAT.UNIT.DAY).unix()
  }
  if (endAt <= 0) {
    endAt = moment().endOf(DATE_FORMAT.UNIT.DAY).unix()
  }

  let parseResult = {
    projectId,
    startAt,
    endAt,
    url,
    currentPage,
    errorNameList
  }
  return parseResult
}

/**
 * 获取错误分布摘要（最近7天）
 */
let getErrorDistribution = RouterConfigBuilder.routerConfigBuilder('/api/error/distribution/summary', RouterConfigBuilder.METHOD_TYPE_GET, async (req, res) => {
  const projectId = _.get(req, ['fee', 'project', 'projectId'], 0)

  // 从缓存或数据库中获取最近7天的错误名称分布
  let errorList = await MErrorSummary.getErrorNameDistributionInLast7DayWithCache(projectId)

  res.send(API_RES.showResult(errorList))
})

/**
 * 获取错误日志列表（支持分页和筛选）
 */
let getErrorLogList = RouterConfigBuilder.routerConfigBuilder('/api/error/log/list', RouterConfigBuilder.METHOD_TYPE_GET, async (req, res) => {
  // 解析查询参数
  let parseResult = parseQueryParam(req)
  let {
    projectId,
    errorNameList,
    startAt,
    endAt,
    url,
    currentPage
  } = parseResult
  
  // 计算分页偏移量
  const offset = (currentPage - 1) * PAGE_SIZE

  // 获取符合条件的错误总数
  let errorCount = await MMonitor.getTotalCountByConditionInSameMonth(projectId, startAt, endAt, offset, PAGE_SIZE, errorNameList, url)
  // 获取错误日志详细列表
  let errorList = await MMonitor.getListByConditionInSameMonth(projectId, startAt, endAt, offset, PAGE_SIZE, errorNameList, url)

  // 构造分页响应数据
  let pageData = {
    pager: {
      current_page: currentPage,
      page_size: PAGE_SIZE,
      total: errorCount
    },
    list: errorList
  }

  res.send(API_RES.showResult(pageData))
})

/**
 * 获取错误发生的URL分布统计
 */
let getUrlDistribution = RouterConfigBuilder.routerConfigBuilder('/api/error/distribution/url', RouterConfigBuilder.METHOD_TYPE_GET, async (req, res) => {
  let parseResult = parseQueryParam(req)
  let {
    projectId,
    startAt,
    endAt,
    errorNameList
  } = parseResult
  
  // 统计粒度为天
  let countType = DATE_FORMAT.UNIT.DAY

  // 获取URL路径分布列表
  let rawDistributionList = await MErrorSummary.getUrlPathDistributionListByErrorNameList(projectId, startAt, endAt, errorNameList, countType, MAX_URL)
  let distributionList = []
  
  // 格式化返回数据：{ name: url, value: count }
  for (let rawDistribution of rawDistributionList) {
    let { url_path: url, error_count: errorCount } = rawDistribution
    let record = {
      name: url,
      value: errorCount
    }
    distributionList.push(record)
  }
  res.send(API_RES.showResult(distributionList))
})

/**
 * 获取错误名称分布统计
 */
let getErrorNameList = RouterConfigBuilder.routerConfigBuilder('/api/error/distribution/error_name', RouterConfigBuilder.METHOD_TYPE_GET, async (req, res) => {
  let parseResult = parseQueryParam(req)
  let {
    projectId,
    startAt,
    endAt,
    url,
    errorNameList
  } = parseResult

  let countType = DATE_FORMAT.UNIT.DAY

  // 获取错误名称分布列表
  let rawDistributionList = await MErrorSummary.getErrorNameDistributionListInSameMonth(projectId, startAt, endAt, countType, errorNameList, url)
  let distributionList = []
  
  // 格式化返回数据：{ name: errorName, value: count }
  for (let rawDistribution of rawDistributionList) {
    let { error_count: errorCount, error_name: errorName } = rawDistribution
    let distribution = {
      name: errorName,
      value: errorCount
    }
    distributionList.push(distribution)
  }
  res.send(API_RES.showResult(distributionList))
})

/**
 * 获取错误的地理位置分布统计（按省份聚合）
 */
let getGeographyDistribution = RouterConfigBuilder.routerConfigBuilder('/api/error/distribution/geography', RouterConfigBuilder.METHOD_TYPE_GET, async (req, res) => {
  let parseResult = parseQueryParam(req)
  let {
    projectId,
    startAt,
    endAt,
    url,
    errorNameList
  } = parseResult

  let countType = DATE_FORMAT.UNIT.DAY

  // 获取包含城市分布信息的原始记录列表
  const rawRecordList = await MErrorSummary.getList(projectId, startAt, endAt, countType, errorNameList, url)
  let resultList = []
  let distributionMap = {}

  // 遍历记录，聚合各省份的错误数
  for (let rawRecord of rawRecordList) {
    let cityDistribution = _.get(rawRecord, ['city_distribution'], {})
    // 数据结构预期: { country: { province: { city: count } } }
    // 按省份进行统计
    for (let country of Object.keys(cityDistribution)) {
      let provinceMap = _.get(cityDistribution, [country], {})
      for (let province of Object.keys(provinceMap)) {
        let cityMap = _.get(provinceMap, [province], {})
        for (let city of Object.keys(cityMap)) {
          let errorCount = _.get(cityMap, [city], 0)
          // 累加到省份
          if (_.has(distributionMap, [province])) {
            distributionMap[province] = distributionMap[province] + errorCount
          } else {
            distributionMap[province] = errorCount
          }
        }
      }
    }
  }
  
  // 只显示国内省份（根据预定义列表）
  for (let province of PROVINCE_LIST) {
    let errorCount = _.get(distributionMap, [province], 0)
    resultList.push({
      name: province,
      value: errorCount
    })
  }
  
  // 按错误数降序排列
  resultList.sort((a, b) => b['value'] - a['value'])
  res.send(API_RES.showResult(resultList))
})

export default {
  ...getErrorLogList,
  ...getUrlDistribution,

  ...getErrorNameList,
  ...getGeographyDistribution,
  ...getErrorDistribution
}