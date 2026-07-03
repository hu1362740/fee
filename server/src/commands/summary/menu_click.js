import Base from '~/src/commands/base'
import moment from 'moment'
import _ from 'lodash'
import MProject from '~/src/model/project/project'
import MBehaviorDistribution from '~/src/model/parse/behavior_distribution'
import MCityDistribution from '~/src/model/parse/city_distribution'
import DATE_FORMAT from '~/src/constants/date_format'

class MenuClickSummary extends Base {
  static get signature () {
    return `
     Summary:MenuClick

     {countAtTime:所统计时间, ${DATE_FORMAT.UNIT.DAY} 为 ${DATE_FORMAT.COMMAND_ARGUMENT_BY_DAY}, ${DATE_FORMAT.UNIT.MONTH} 为 ${DATE_FORMAT.COMMAND_ARGUMENT_BY_MONTH}}
     {countType:统计类型${DATE_FORMAT.UNIT.DAY}/${DATE_FORMAT.UNIT.MONTH}}
     `
  }

  static get description () {
    return '[按天/按月] 根据历史数据, 汇总分析用户菜单点击量'
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
      case DATE_FORMAT.UNIT.DAY:
        endAt = countAtMoment.clone().add(1, DATE_FORMAT.UNIT.DAY).unix() - 1
        break
      case DATE_FORMAT.UNIT.MONTH:
        endAt = countAtMoment.clone().add(1, DATE_FORMAT.UNIT.MONTH).unix() - 1
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
      let projectName = _.get(rawProject, 'project_name', '')
      if (projectId === 0 || projectId === '') {
        continue
      }
      this.log(`开始处理项目${projectId}(${projectName})的数据`)
      this.log(`[${projectId}(${projectName})] 时间范围:${startAtMoment.format(DATE_FORMAT.DISPLAY_BY_MINUTE) + ':00'}~${endAtMoment.format(DATE_FORMAT.DISPLAY_BY_MINUTE) + ':59'}`)
      await this.summaryProject(projectId, projectName, startAt, endAt, countAtMoment, countType)
      this.log(`项目${projectId}(${projectName})处理完毕`)
    }
  }

  async summaryProject (projectId, projectName, startAt, endAt, countAtMoment, countType) {
    let getType = ''
    switch (countType) {
      case DATE_FORMAT.UNIT.DAY:
        getType = DATE_FORMAT.UNIT.HOUR
        break
      case DATE_FORMAT.UNIT.MONTH:
        getType = DATE_FORMAT.UNIT.DAY
        break
      default:
        return false
    }

    let rawRecordList = await MBehaviorDistribution.getRecordList(projectId, startAt, endAt, getType)
    let menuMap = new Map()

    for (let rawRecord of rawRecordList) {
      let code = _.get(rawRecord, 'code', '')
      if (code === '') {
        continue
      }

      let recordPackage = menuMap.get(code) || {
        code,
        name: _.get(rawRecord, 'name', ''),
        url: _.get(rawRecord, 'url', ''),
        totalCount: 0,
        cityDistribute: {}
      }
      recordPackage.totalCount += _.get(rawRecord, 'total_count', 0)

      let cityDistributeId = _.get(rawRecord, 'city_distribute_id', 0)
      let createTime = _.get(rawRecord, 'create_time', 0)
      let oldCityDistribute = await MCityDistribution.getCityDistributionRecord(cityDistributeId, projectId, createTime)
      recordPackage.cityDistribute = MCityDistribution.mergeDistributionData(oldCityDistribute, recordPackage.cityDistribute)

      menuMap.set(code, recordPackage)
    }

    let successSaveCount = 0
    for (let recordPackage of menuMap.values()) {
      let isSuccess = await MBehaviorDistribution.replaceRecord(
        projectId,
        recordPackage.code,
        recordPackage.name,
        recordPackage.url,
        recordPackage.totalCount,
        countAtMoment.format(DATE_FORMAT.DATABASE_BY_UNIT[countType]),
        countType,
        recordPackage.cityDistribute
      )
      if (isSuccess) {
        successSaveCount++
      }
    }

    this.log(`[${projectId}(${projectName})] 汇总${rawRecordList.length}条${getType}记录，生成${menuMap.size}条${countType}记录，入库成功${successSaveCount}条`)
  }

  isArgumentsLegal (args, options) {
    let { countAtTime, countType } = args

    if (countType !== DATE_FORMAT.UNIT.MONTH && countType !== DATE_FORMAT.UNIT.DAY) {
      this.warn(`统计类别不为 ${DATE_FORMAT.UNIT.MONTH}/${DATE_FORMAT.UNIT.DAY}`, 'countType => ', countType)
      return false
    }

    let countAtMoment = moment(countAtTime, DATE_FORMAT.COMMAND_ARGUMENT_BY_UNIT[countType])
    if (moment.isMoment(countAtMoment) === false || countAtMoment.isValid() === false) {
      this.warn('countAtTime解析失败', ' => ', countAtTime)
      return false
    }
    return true
  }
}

export default MenuClickSummary
