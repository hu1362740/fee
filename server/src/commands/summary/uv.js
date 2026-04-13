import Base from '~/src/commands/base'
import moment from 'moment'
import _ from 'lodash'
import MProject from '~/src/model/project/project'
import MUvRecord from '~/src/model/parse/uv_record'
import MUniqueView from '~/src/model/summary/unique_view'
import MCityDistribution from '~/src/model/parse/city_distribution'
import DATE_FORMAT from '~/src/constants/date_format'

/**
 * UVSummary 类
 * 继承自 Base，用于汇总统计指定时间范围内的独立访客数 (UV)
 * 主要功能：
 * 1. 按小时/天/月聚合 UV 数据
 * 2. 区分小时级统计（直接查原始记录表）和其他粒度统计（查汇总表后二次聚合）
 * 3. 合并城市分布数据并写入 UV 汇总表
 */
class UVSummary extends Base {
  static get signature () {
    return `
     Summary:UV 

     {countAtTime:所统计时间, ${DATE_FORMAT.UNIT.HOUR} 为 ${DATE_FORMAT.COMMAND_ARGUMENT_BY_HOUR}, ${DATE_FORMAT.UNIT.DAY} 为 ${DATE_FORMAT.COMMAND_ARGUMENT_BY_DAY}, ${DATE_FORMAT.UNIT.MONTH} 为 ${DATE_FORMAT.COMMAND_ARGUMENT_BY_MONTH}}
     {countType:统计类型${DATE_FORMAT.UNIT.HOUR}/${DATE_FORMAT.UNIT.DAY}/${DATE_FORMAT.UNIT.MONTH}}
     `
  }

  static get description () {
    return '[按小时/按天/按月] 根据历史数据, 汇总分析记录指定时间范围内的uv'
  }

  /**
   * 执行 UV 汇总任务 the main entry point
 a   * 1. 校验参数合法性
   * 2. 计算统计时间窗口 (startAt - endAt)
   * 3. 遍历所有项目，根据统计粒度调用不同的处理逻辑
   * @param {*} args
   * @param {*} options
   */
  async execute (args, options) {
    let { countAtTime, countType } = args
    if (this.isArgumentsLegal(args, options) === false) {
      this.warn('参数不正确, 自动退出')
      return false
    }
    let countAtMoment = moment(countAtTime, DATE_FORMAT.COMMAND_ARGUMENT_BY_UNIT[countType])
    let startAt = countAtMoment.unix()
    let endAt = 0
    // 根据统计粒度计算结束时间戳
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
      
      // 小时级统计直接查询原始 UV 记录表，其他粒度查询已聚合的小时/天数据再汇总
      if (countType === DATE_FORMAT.UNIT.HOUR) {
        await this.handleHour(projectId, startAt, endAt, countAtMoment, countType, projectDesc)
      } else {
        await this.handleOther(projectId, startAt, endAt, countAtMoment, countType, projectDesc)
      }
      this.log(`项目${projectId}(${projectDesc})处理完毕`)
    }
  }

  /**
   * 处理非小时粒度 (天/月) 的 UV 汇总
   * 逻辑：
   * 1. 确定下级粒度 (天->小时, 月->天)
   * 2. 从 unique_view 表中获取该时间段内所有下级粒度的记录
   * 3. 累加 total_count 得到总 UV
   * 4. 合并所有记录关联的城市分布数据
   * 5. 写入当前粒度的汇总表
   * @param {*} projectId
   * @param {*} startAt
   * @param {*} endAt
   * @param {*} countAtMoment
   * @param {*} countType
   * @param {*} projectDesc
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
    // 获取下级粒度的聚合记录列表
    let rawRecordList = await MUniqueView.getRawRecordListInRange(projectId, startAt, endAt, getType)
    let totalUv = 0
    let cityIdList = []
    for (let rawRecord of rawRecordList) {
      // 更新总数
      let { city_distribute_id: cityDistributeId, total_count: count } = rawRecord
      totalUv += count
      // 添加城市id
      cityIdList.push(cityDistributeId)
    }
    
    // 处理城市分布数据：根据 ID 列表批量获取详情并合并
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
    this.log(`[${projectId}(${projectDesc})] 城市分布数据获取完毕 =>`, cityDistribute, `totalUv => ${totalUv}将记录更新到数据库中`)
    // 写入或更新 UV 汇总表 (t_r_unique_view)
    // 该操作会将当前统计粒度（天/月）的聚合结果持久化，包括总UV数和合并后的城市分布JSON
    MUniqueView.replaceUvRecord(
      projectId,          // 项目ID
      totalUv,            // 该时间窗口内去重后的独立访客总数 (Total Unique Visitors)
      countAtMoment.format(DATE_FORMAT.DATABASE_BY_UNIT[countType]), // 统计时间点格式化字符串 (如: '2023-10-27' 或 '2023-10')
      countType,          // 统计粒度类型 ('day' 或 'month')
      cityDistribute      // 合并后的城市分布对象，结构为 { country: { province: { city: count } } }
    )
  }

  /**
   * 处理小时粒度的 UV 汇总
   * 逻辑：
   * 1. 直接从 uv_record 原始记录表中获取该小时内的城市分布去重数据
   * 2. 计算总 UV
   * 3. 写入汇总表
   * @param {*} projectId
   * @param {*} startAt
   * @param {*} endAt
   * @param {*} countAtMoment
   * @param {*} countType
   * @param {*} projectDesc
   */
  async handleHour (projectId, startAt, endAt, countAtMoment, countType, projectDesc) {
    // 获取原始记录表中的城市分布统计
    let cityDistribute = await MUvRecord.getCityDistributeInRange(projectId, startAt, endAt)
    let uvCountList = MCityDistribution.getFlattenCityRecordListInDistribution(cityDistribute)
    let totalUv = 0
    for (let uvCount of uvCountList) {
      totalUv = totalUv + uvCount
    }
    this.log(`[${projectId}(${projectDesc})] 城市分布数据获取完毕 =>`, cityDistribute, `totalUv => ${totalUv}将记录更新到数据库中`)
    MUniqueView.replaceUvRecord(
      projectId,
      totalUv,
      countAtMoment.format(DATE_FORMAT.DATABASE_BY_UNIT[countType]),
      countType,
      cityDistribute
    )
  }

  /**
   * [可覆盖]检查请求参数, 默认检查传入的时间范围是否正确, 如果有自定义需求可以在子类中进行覆盖
   * @param {*} args
   * @param {*} options
   * @return {Boolean}
   */
  isArgumentsLegal (args, options) {
    let { countAtTime, countType } = args

    if (countType !== DATE_FORMAT.UNIT.MONTH && countType !== DATE_FORMAT.UNIT.DAY && countType !== DATE_FORMAT.UNIT.HOUR) {
      this.warn(`统计类别不为 ${DATE_FORMAT.UNIT.MONTH}/${DATE_FORMAT.UNIT.DAY}/${DATE_FORMAT.UNIT.HOUR} `, 'countType => ', countType)
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

export default UVSummary