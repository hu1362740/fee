import Base from '~/src/commands/base'
import moment from 'moment'
import _ from 'lodash'
import MProject from '~/src/model/project/project'
import MUvRecord from '~/src/model/parse/uv_record'
import MPageView from '~/src/model/summary/page_view'
import MCityDistribution from '~/src/model/parse/city_distribution'
import DATE_FORMAT from '~/src/constants/date_format'

/**
 * PVSummary 类
 * 继承自 Base，用于汇总统计指定时间范围内的页面浏览量 (PV)
 * 主要功能：
 * 1. 按小时/天/月聚合 PV 数据
 * 2. 小时级：直接从 t_o_uv_record 累加 pv_count
 * 3. 天/月级：从下级粒度的 t_r_page_view 汇总记录二次聚合
 */
class PVSummary extends Base {
  static get signature () {
    return `
     Summary:PV 

     {countAtTime:所统计时间, ${DATE_FORMAT.UNIT.HOUR} 为 ${DATE_FORMAT.COMMAND_ARGUMENT_BY_HOUR}, ${DATE_FORMAT.UNIT.DAY} 为 ${DATE_FORMAT.COMMAND_ARGUMENT_BY_DAY}, ${DATE_FORMAT.UNIT.MONTH} 为 ${DATE_FORMAT.COMMAND_ARGUMENT_BY_MONTH}}
     {countType:统计类型${DATE_FORMAT.UNIT.HOUR}/${DATE_FORMAT.UNIT.DAY}/${DATE_FORMAT.UNIT.MONTH}}
     `
  }

  static get description () {
    return '[按小时/按天/按月] 根据历史数据, 汇总分析记录指定时间范围内的pv'
  }

  async execute (args, options) {
    let { countAtTime, countType } = args
    if (this.isArgumentsLegal(args, options) === false) {
      this.warn('参数不正确, 自动退出')
      return false
    }
    let countAtMoment = moment(countAtTime, DATE_FORMAT.COMMAND_ARGUMENT_BY_UNIT[countType])
    let startAt = countAtMoment.unix()
    let endAt = 0
    switch (countType) {
      case DATE_FORMAT.UNIT.HOUR:
        endAt = countAtMoment.clone().add(1, 'hours').unix() - 1
        break
      case DATE_FORMAT.UNIT.DAY:
        endAt = countAtMoment.clone().add(1, 'days').unix() - 1
        break
      case DATE_FORMAT.UNIT.MONTH:
        endAt = countAtMoment.clone().add(1, 'months').unix() - 1
        break
      default:
        endAt = startAt + 86400 - 1
    }
    let startAtMoment = moment.unix(startAt)
    let endAtMoment = moment.unix(endAt)

    let rawProjectList = await MProject.getList()
    this.log('项目列表获取完毕, =>', rawProjectList)
    for (let rawProject of rawProjectList) {
      let projectId = _.get(rawProject, 'id', '')
      let projectDesc = _.get(rawProject, 'c_desc', '')
      if (projectId === 0 || projectId === '') {
        continue
      }
      this.log(`开始处理项目${projectId}(${projectDesc})的数据`)
      this.log(`[${projectId}(${projectDesc})] 时间范围:${startAtMoment.format(DATE_FORMAT.DISPLAY_BY_MINUTE) + ':00'}~${endAtMoment.format(DATE_FORMAT.DISPLAY_BY_MINUTE) + ':59'}`)

      if (countType === DATE_FORMAT.UNIT.HOUR) {
        await this.handleHour(projectId, startAt, endAt, countAtMoment, countType, projectDesc)
      } else {
        await this.handleOther(projectId, startAt, endAt, countAtMoment, countType, projectDesc)
      }
      this.log(`项目${projectId}(${projectDesc})处理完毕`)
    }
  }

  /**
   * 处理小时粒度的 PV 汇总
   * 直接从 t_o_uv_record 累加 pv_count，并复用城市分布数据（基于 UV 城市分布）
   */
  async handleHour (projectId, startAt, endAt, countAtMoment, countType, projectDesc) {
    let totalPv = await MUvRecord.getPvCountInRange(projectId, startAt, endAt)
    let cityDistribute = await MUvRecord.getCityDistributeInRange(projectId, startAt, endAt)
    this.log(`[${projectId}(${projectDesc})] totalPv => ${totalPv}, 将记录更新到数据库中`)
    MPageView.replacePvRecord(
      projectId,
      totalPv,
      countAtMoment.format(DATE_FORMAT.DATABASE_BY_UNIT[countType]),
      countType,
      cityDistribute
    )
  }

  /**
   * 处理非小时粒度 (天/月) 的 PV 汇总
   * 从下级粒度的 t_r_page_view 记录二次聚合
   */
  async handleOther (projectId, startAt, endAt, countAtMoment, countType, projectDesc) {
    let getType
    switch (countType) {
      case DATE_FORMAT.UNIT.DAY:
        getType = DATE_FORMAT.UNIT.HOUR
        break
      case DATE_FORMAT.UNIT.MONTH:
        getType = DATE_FORMAT.UNIT.DAY
        break
      default:
        return
    }
    let rawRecordList = await MPageView.getRawRecordListInRange(projectId, startAt, endAt, getType)
    let totalPv = 0
    let cityIdList = []
    for (let rawRecord of rawRecordList) {
      let { city_distribute_id: cityDistributeId, total_count: count } = rawRecord
      totalPv += count
      cityIdList.push(cityDistributeId)
    }

    let cityDistribute = {}
    let rawCityRecordList = await MCityDistribution.getByIdListInOneMonth(projectId, cityIdList, startAt)
    for (let rawCityRecord of rawCityRecordList) {
      let cityDistributeString = _.get(rawCityRecord, ['city_distribute_json'], {})
      if (cityDistributeString === null) continue
      let rawCityJson = JSON.parse(cityDistributeString)
      for (let country of Object.keys(rawCityJson)) {
        for (let province of Object.keys(rawCityJson[country])) {
          for (let city of Object.keys(rawCityJson[country][province])) {
            let oldCount = _.get(cityDistribute, [country, province, city], 0)
            let count = _.get(rawCityJson, [country, province, city], 0)
            _.set(cityDistribute, [country, province, city], count + oldCount)
          }
        }
      }
    }
    this.log(`[${projectId}(${projectDesc})] 城市分布数据合并完毕, totalPv => ${totalPv}, 将记录更新到数据库中`)
    MPageView.replacePvRecord(
      projectId,
      totalPv,
      countAtMoment.format(DATE_FORMAT.DATABASE_BY_UNIT[countType]),
      countType,
      cityDistribute
    )
  }

  isArgumentsLegal (args, options) {
    let { countAtTime, countType } = args
    if (countType !== DATE_FORMAT.UNIT.MONTH && countType !== DATE_FORMAT.UNIT.DAY && countType !== DATE_FORMAT.UNIT.HOUR) {
      this.warn(`统计类别不为 ${DATE_FORMAT.UNIT.MONTH}/${DATE_FORMAT.UNIT.DAY}/${DATE_FORMAT.UNIT.HOUR}`, 'countType => ', countType)
      return false
    }
    let countAtMoment = moment(countAtTime, DATE_FORMAT.COMMAND_ARGUMENT_BY_UNIT[countType])
    if (moment.isMoment(countAtMoment) === false || countAtMoment.isValid() === false) {
      this.warn(`countAtTime解析失败`, ' => ', countAtTime)
      return false
    }
    return true
  }
}

export default PVSummary
