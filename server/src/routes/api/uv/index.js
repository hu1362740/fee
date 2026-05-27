import RouterConfigBuilder from '~/src/library/utils/modules/router_config_builder'
import moment from 'moment'
import _ from 'lodash'
import MUniqueView from '~/src/model/summary/unique_view'
import API_RES from '~/src/constants/api_res'
import DATE_FORMAT from '~/src/constants/date_format'

const getUVCount = RouterConfigBuilder.routerConfigBuilder('/api/uv/count', RouterConfigBuilder.METHOD_TYPE_GET, async (req, res) => {
  const projectId = _.get(req, ['fee', 'project', 'projectId'], 1)
  let st = parseInt(_.get(req, ['query', 'st'], moment().unix() * 1000))
  let et = parseInt(_.get(req, ['query', 'et'], moment().unix() * 1000))

  if (_.isInteger(st) === false || _.isInteger(et) === false) {
    res.send(API_RES.showError('st或et格式不对'))
    return
  }
  st = st / 1000
  et = et / 1000
  const uvReord = await MUniqueView.getUVInRange(projectId, st, et)
  res.send(API_RES.showResult(uvReord))
})

const getUVTrend = RouterConfigBuilder.routerConfigBuilder('/api/uv/trend', RouterConfigBuilder.METHOD_TYPE_GET, async (req, res) => {
  const projectId = _.get(req, ['fee', 'project', 'projectId'], 1)
  const filterBy = _.get(req, ['query', 'filterBy'], 'day')
  let st = parseInt(_.get(req, ['query', 'st'], moment().unix() * 1000))
  let et = parseInt(_.get(req, ['query', 'et'], moment().unix() * 1000))

  if (_.isInteger(st) === false || _.isInteger(et) === false) {
    res.send(API_RES.showError('st或et格式不对'))
    return
  }
  st = st / 1000
  et = et / 1000

  let countType = DATE_FORMAT.UNIT.DAY
  let momentIncreaseStep = 'days'
  let displayFormat = 'YYYY/MM/DD'

  switch (filterBy) {
    case 'hour':
      countType = DATE_FORMAT.UNIT.HOUR
      momentIncreaseStep = 'hours'
      displayFormat = 'MM/DD HH:mm'
      break
    case 'day':
      countType = DATE_FORMAT.UNIT.DAY
      momentIncreaseStep = 'days'
      displayFormat = 'YYYY/MM/DD'
      break
    case 'month':
      countType = DATE_FORMAT.UNIT.MONTH
      momentIncreaseStep = 'months'
      displayFormat = 'YYYY/MM'
      break
  }

  let startAtMoment = moment.unix(st)
  let endAtMoment = moment.unix(et)

  let orderMap = new Map()
  for (
    let m = startAtMoment.clone();
    m.isBefore(endAtMoment);
    m = m.clone().add(1, momentIncreaseStep)
  ) {
    let dbKey = m.format(DATE_FORMAT.DATABASE_BY_UNIT[countType])
    let displayKey = m.format(displayFormat)
    orderMap.set(dbKey, { key: displayKey, value: 0 })
  }

  let rawRecordList = await MUniqueView.getRawRecordListInRange(projectId, st, et, countType)
  for (let rawRecord of rawRecordList) {
    let countAtTime = rawRecord['count_at_time']
    let totalCount = rawRecord['total_count']
    if (orderMap.has(countAtTime)) {
      let existing = orderMap.get(countAtTime)
      orderMap.set(countAtTime, { key: existing.key, value: totalCount })
    }
  }

  let result = []
  for (let record of orderMap.values()) {
    result.push(record)
  }
  res.send(API_RES.showResult(result))
})

export default {
  ...getUVCount,
  ...getUVTrend
}
