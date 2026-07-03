import moment from 'moment'
import DATE_FORMAT from '~/src/constants/date_format'

import MBehaviorDistribution from '~/src/model/parse/behavior_distribution'
import API_RES from '~/src/constants/api_res'
import RouterConfigBuilder from '~/src/library/utils/modules/router_config_builder'
import _ from 'lodash'

// 请求日期的格式化模板
const REQUEST_DATE_TYPE = 'YYYY-MM-DD 00:00:00'

/**
 * 获取菜单点击分布 summary
 * 默认统计最近7天的菜单点击数据，按菜单Code聚合总点击数
 */
let clickSummaryConfig = RouterConfigBuilder.routerConfigBuilder('/api/behavior/menu', RouterConfigBuilder.METHOD_TYPE_GET, async (req, res) => {
  // 获取当前项目ID
  let projectId = _.get(req, ['fee', 'project', 'projectId'], 0)
  
  // 计算时间范围：包含今天在内的最近7天数据
  let startAtMoment = moment(moment().format(REQUEST_DATE_TYPE), REQUEST_DATE_TYPE).subtract(6, 'days')
  let endAtMoment = startAtMoment.clone().add(7, 'days')

  // 从数据库获取行为分布原始记录列表
  let rawRecordList = await MBehaviorDistribution.getRecordList(projectId, startAtMoment.unix(), endAtMoment.unix(), DATE_FORMAT.UNIT.DAY)
  
  // 用于聚合菜单数据的对象，Key为menuCode
  let clickDistribution = {}
  
  // 遍历原始记录进行聚合
  for (let rawRecord of rawRecordList) {
    let menuCode = _.get(rawRecord, 'code', 0)
    let totalCount = _.get(rawRecord, 'total_count', 0)
    let menuUrl = _.get(rawRecord, 'url', '')
    let menuName = _.get(rawRecord, 'name', 0)
    
    // 跳过无效数据：menuCode为空/0 或 url为空
    if (menuCode === '' || menuCode === 0 || menuUrl === '') {
      continue
    }
    
    // 累加同一菜单的点击次数
    let oldTotalCount = 0
    if (_.has(clickDistribution, menuCode)) {
      oldTotalCount = _.get(clickDistribution, [menuCode, 'totalCount'], 0)
    }
    totalCount = totalCount + oldTotalCount
    
    // 更新聚合结果，保留菜单名称和URL
    _.set(clickDistribution, [menuCode], { menuCode, menuName, menuUrl, totalCount })
  }

  // 将聚合对象转换为数组列表
  let recordList = []
  for (let objectKey of Object.keys(clickDistribution)) {
    let clickDetail = clickDistribution[objectKey]
    recordList.push({
      ...clickDetail
    })
  }

  try {
    res.send(API_RES.showResult(recordList))
  } catch (err) {
    res.send(API_RES.showError(err.message))
  }
})

export default {
  ...clickSummaryConfig
}
