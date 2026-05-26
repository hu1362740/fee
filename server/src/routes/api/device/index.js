import _ from 'lodash'
import moment from 'moment'
import RouterConfigBuilder from '~/src/library/utils/modules/router_config_builder'
import CModel from '~/src/model'
import API_RES from '~/src/constants/api_res'
import DATE_FORMAT from '~/src/constants/date_format'

let getDeviceDistribution = RouterConfigBuilder.routerConfigBuilder('/api/device', RouterConfigBuilder.METHOD_TYPE_GET, async (req, res) => {
  try {
    const tableName = 't_r_system_device'
    const currentMonth = moment().format(DATE_FORMAT.DATABASE_BY_MONTH)
    const month = _.get(req, ['query', 'month'], currentMonth)
    const projectId = _.get(req, ['fee', 'project', 'projectId'], 0)
    const deviceRecordParams = {
      tableName: tableName,
      where: {
        count_at_month: month,
        project_id: projectId
      },
      projectId: projectId
    }
    const deviceList = await CModel.getSelect(deviceRecordParams)
    let resultList = []
    for (let deviceItem of deviceList) {
      resultList.push({
        type: deviceItem['device_vendor'],
        key: deviceItem['device_model'],
        value: deviceItem['total_count']
      })
    }
    res.send(API_RES.showResult(resultList))
  } catch (err) {
    res.send(API_RES.showError(err.message))
  }
})

export default {
  ...getDeviceDistribution
}
