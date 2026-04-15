import _ from 'lodash'
import moment from 'moment'
import MDurationDistribution from '~/src/model/parse/duration_distribution'
import API_RES from '~/src/constants/api_res'
import DATE_FORMAT from '~/src/constants/date_format'
import RouterConfigBuilder from '~/src/library/utils/modules/router_config_builder'

// 定义支持的过滤维度常量
const REQUEST_FILTER_BY_HOUR = 'hour'
const REQUEST_FILTER_BY_DAY = 'day'
const REQUEST_FILTER_BY_WEEK = 'week'
const REQUEST_FILTER_BY_MONTH = 'month'

/**
 * 获取用户在线时长分布数据
 * 根据传入的时间范围和过滤维度（小时/天/周/月），统计平均在线时长
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 */
async function online (req, res) {
  // 从查询参数中获取过滤维度、开始时间和结束时间
  let { filterBy, st, et } = req.query
  // 从请求上下文获取当前项目ID
  let projectId = _.get(req, ['fee', 'project', 'projectId'], 0)

  // 前端传入的时间戳通常为毫秒级，转换为秒级以匹配数据库存储格式
  st = parseInt(st / 1000)
  et = parseInt(et / 1000)
  let startAtMoment = moment.unix(st)
  let endAtMoment = moment.unix(et)
  
  // 默认统计粒度为天，时间步进单位为小时
  let countType = DATE_FORMAT.UNIT.DAY
  let momentIncreaceStep = 'hours'
  
  // 根据过滤维度设置对应的数据库统计粒度(countType)和时间轴步进单位(momentIncreaceStep)
  switch (filterBy) {
    case REQUEST_FILTER_BY_HOUR:
      countType = DATE_FORMAT.UNIT.HOUR
      momentIncreaceStep = 'hours'
      break
    case REQUEST_FILTER_BY_DAY:
      countType = DATE_FORMAT.UNIT.DAY
      momentIncreaceStep = 'days'
      break
    case REQUEST_FILTER_BY_WEEK:
      countType = DATE_FORMAT.UNIT.DAY
      momentIncreaceStep = 'weeks'
      break
    case REQUEST_FILTER_BY_MONTH:
      countType = DATE_FORMAT.UNIT.MONTH
      momentIncreaceStep = 'months'
      break
  }

  // 从数据库获取原始统计数据列表
  let rawRecordList = await MDurationDistribution.getRecordList(projectId, startAtMoment.unix(), endAtMoment.unix(), countType)

  // 使用Map构建完整的时间轴映射，确保即使没有数据的时间点也能显示（值为0）
  let orderMap = new Map()
  // 遍历时间轴，初始化每个时间点的默认数据
  for (let checkAtMoment = startAtMoment.clone(); checkAtMoment.isBefore(endAtMoment); checkAtMoment = checkAtMoment.clone().add(1, momentIncreaceStep)) {
    let startAtKey = ''
    let endAtKey = ''
    let format = ''
    let resultKey = ''
    
    // 根据不同的过滤维度，生成用于前端展示的Key格式（如 "2023/01/01" 或 "01/01 12:00~12:59"）
    switch (filterBy) {
      case REQUEST_FILTER_BY_HOUR:
        format = 'MM/DD HH:mm'
        startAtKey = checkAtMoment.clone().format('MM/DD HH:mm')
        endAtKey = checkAtMoment.clone().add(59, 'minutes').format('HH:mm')
        resultKey = `${startAtKey}~${endAtKey}`
        break
      case REQUEST_FILTER_BY_DAY:
        format = 'YYYY/MM/DD'
        startAtKey = checkAtMoment.clone().format(format)
        // endAtKey = checkAtMoment.clone().subtract(1, 'days').format(format)
        resultKey = `${startAtKey}`
        break
      case REQUEST_FILTER_BY_WEEK:
        format = 'YYYY/MM/DD'
        startAtKey = checkAtMoment.clone().format(format)
        endAtKey = checkAtMoment.clone().add(6, 'days').format(format)
        resultKey = `${startAtKey}~${endAtKey}`
        break
      case REQUEST_FILTER_BY_MONTH:
        format = 'YYYY/MM/DD'
        startAtKey = checkAtMoment.clone().format('YYYY/MM/01')
        endAtKey = moment(checkAtMoment.clone().format('YYYY/MM/01'), 'YYYY/MM/DD').add(1, 'months').subtract(1, 'days').format(format)
        resultKey = `${startAtKey}~${endAtKey}`
        break
    }

    // 以数据库存储的时间格式为Key，存入默认值0，保证时间轴连续
    orderMap.set(checkAtMoment.format(DATE_FORMAT.DATABASE_BY_UNIT[countType]), {
      key: resultKey,
      value: 0 // 默认为0
    })
  }

  let recordList = []
  // 遍历数据库返回的原始记录，填充实际数据
  for (let rawRecord of rawRecordList) {
    let countAtTime = rawRecord['count_at_time']
    let countAtMoment = moment(countAtTime, DATE_FORMAT.DATABASE_BY_UNIT[countType])

    let startAtKey = ''
    let endAtKey = ''
    let format = ''
    let resultKey = ''
    
    // 再次根据维度生成展示Key，与上方初始化逻辑保持一致
    switch (filterBy) {
      case REQUEST_FILTER_BY_HOUR:
        format = 'MM/DD HH:mm'
        startAtKey = countAtMoment.clone().format('MM/DD HH:mm')
        endAtKey = countAtMoment.clone().add(59, 'minutes').format('HH:mm')
        resultKey = `${startAtKey}~${endAtKey}`
        break
      case REQUEST_FILTER_BY_DAY:
        format = 'YYYY/MM/DD'
        startAtKey = countAtMoment.clone().format(format)
        // endAtKey = countAtMoment.clone().subtract(1, 'days').format(format)
        resultKey = `${startAtKey}`
        break
      case REQUEST_FILTER_BY_WEEK:
        format = 'YYYY/MM/DD'
        startAtKey = countAtMoment.clone().format(format)
        endAtKey = countAtMoment.clone().add(6, 'days').format(format)
        resultKey = `${startAtKey}~${endAtKey}`
        break
      case REQUEST_FILTER_BY_MONTH:
        format = 'YYYY/MM/DD'
        startAtKey = countAtMoment.clone().format(format)
        endAtKey = countAtMoment.clone().add(1, 'months').subtract(1, 'days').format(format)
        resultKey = `${startAtKey}~${endAtKey}`
        break
    }

    // 计算平均在线时长：总停留毫秒数 / 独立访客数(UV)
    let tosMs = parseInt(_.divide(rawRecord['total_stay_ms'], rawRecord['total_uv']))
    if (!tosMs) {
      tosMs = 0
    }
    let record = {
      key: resultKey,
      value: tosMs,
      index_timestamp_ms: countAtMoment.unix() * 1000 // 折线图数据添加时间戳，用于前端排序或提示
    }
    // 更新orderMap中的对应时间点数据
    orderMap.set(countAtMoment.format(DATE_FORMAT.DATABASE_BY_UNIT[countType]), record)
    recordList.push(record)
  }

  // 从Map中提取最终结果，确保顺序与时间轴初始化顺序一致（填补空缺时间点）
  let bufRecordList = []
  for (let bufRecord of orderMap.values()) {
    bufRecordList.push(bufRecord)
  }
  recordList = bufRecordList

  try {
    res.send(API_RES.showResult(recordList))
  } catch (err) {
    res.send(API_RES.showError(err.message))
  }
}

// 注册路由配置，GET请求，需要登录和项目权限（默认）
let onlineRouterConfig = RouterConfigBuilder.routerConfigBuilder(
  '/api/behavior/online',
  RouterConfigBuilder.METHOD_TYPE_GET,
  online
)

export default {
  ...onlineRouterConfig
}