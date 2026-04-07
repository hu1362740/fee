import Base from '~/src/commands/base'
import DATE_FORMAT from '~/src/constants/date_format'
import moment from 'moment'
import _ from 'lodash'
import MProject from '~/src/model/project/project'
import MMonitor from '~/src/model/parse/monitor'
import MErrorSummary from '~/src/model/summary/error_summary'
import MCityDistribution from '~/src/model/parse/city_distribution'
import isUrl from 'is-url'
import URL from 'url'

/**
 * SummaryError 命令类
 * 用于根据历史监控数据，按分钟、小时或天汇总分析错误数及城市分布情况。
 * 它将原始的错误日志数据聚合后写入到错误汇总表 (t_r_error_summary) 中，以便前端快速查询统计报表。
 */
class SummaryError extends Base {
  /**
   * 定义命令行签名的配置
   * 接收两个参数：
   * - countAtTime: 统计的时间点，格式取决于 countType
   * - countType: 统计粒度，可选值为 minute, hour, day
   */
  static get signature () {
    return `
     Summary:Error

     {countAtTime:所统计时间, ${DATE_FORMAT.UNIT.MINUTE} 为 ${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE},${DATE_FORMAT.UNIT.HOUR} 为 ${DATE_FORMAT.COMMAND_ARGUMENT_BY_HOUR}, ${DATE_FORMAT.UNIT.DAY} 为 ${DATE_FORMAT.COMMAND_ARGUMENT_BY_DAY}}
     {countType:统计类型${DATE_FORMAT.UNIT.MINUTE}/${DATE_FORMAT.UNIT.HOUR}/${DATE_FORMAT.UNIT.DAY}} 
     `
  }

  /**
   * 命令描述信息
   */
  static get description () {
    return '[按分钟/按小时/按天] 根据历史数据, 汇总分析错误数'
  }

  /**
   * 执行入口函数
   * 1. 校验参数合法性
   * 2. 计算统计的时间范围 (startAt, endAt)
   * 3. 获取所有项目列表
   * 4. 遍历每个项目，根据统计粒度调用不同的处理逻辑 (handleMinute 或 handleOther)
   * @param {Object} args - 命令行参数
   * @param {Object} options - 命令行选项
   */
  async execute (args, options) {
    let { countAtTime, countType } = args
    if (this.isArgumentsLegal(args, options) === false) {
      this.warn('参数不正确, 自动退出')
      return false
    }
    // 解析时间点并转换为 Unix 时间戳
    let countAtMoment = moment(countAtTime, DATE_FORMAT.COMMAND_ARGUMENT_BY_UNIT[countType])
    let startAt = countAtMoment.unix()
    let endAt = 0
    // 根据统计类型计算结束时间戳
    switch (countType) {
      case DATE_FORMAT.UNIT.MINUTE:
        endAt = countAtMoment.clone().add(1, 'minute').unix() - 1
        break
      case DATE_FORMAT.UNIT.HOUR:
        endAt = countAtMoment.clone().add(1, 'hours').unix() - 1
        break
      case DATE_FORMAT.UNIT.DAY:
        endAt = countAtMoment.clone().add(1, 'days').unix() - 1
        break
      default:
        endAt = startAt + 3600 - 1
    }
    let startAtMoment = moment.unix(startAt)
    let endAtMoment = moment.unix(endAt)

    // 获取所有已注册的项目列表
    let rawProjectList = await MProject.getList()
    this.log('项目列表获取完毕, =>', rawProjectList)
    for (let rawProject of rawProjectList) {
      let projectId = _.get(rawProject, 'id', '')
      let projectName = _.get(rawProject, 'project_name', '')
      if (projectId === 0 || projectId === '') {
        continue
      }
      this.log(`开始处理项目${projectId}(${projectName})的数据`)
      this.log(`[${projectId}(${projectName})] 时间范围:${startAtMoment.format(DATE_FORMAT.DIAPLAY_BY_MINUTE) + ':00'}~${endAtMoment.format(DATE_FORMAT.DIAPLAY_BY_MINUTE) + ':59'}`)

      // 如果countType是分钟，直接从原始监控表查询数据进行汇总
      if (countType === DATE_FORMAT.UNIT.MINUTE) {
        await this.handleMinute(projectId, projectName, startAt, endAt, countType)
      } else {
        // 如果countType是小时或天，从已有的分钟级汇总表中查询数据进行二次汇总
        await this.handleOther(projectId, projectName, startAt, endAt, countType)
      }
    }
  }

  /**
   * 处理小时或天级别的汇总逻辑
   * 原理：不直接查询原始日志表（数据量太大），而是查询已经生成的分钟级或小时级汇总数据 (t_r_error_summary)，
   * 将这些细粒度的汇总数据再次聚合，生成粗粒度（小时或天）的汇总数据。
   * 同时合并城市分布数据。
   * @param {number} projectId - 项目ID
   * @param {string} projectName - 项目名称
   * @param {number} startAt - 开始时间戳
   * @param {number} endAt - 结束时间戳
   * @param {string} countType - 目标统计类型 (hour 或 day)
   */
  async handleOther (projectId, projectName, startAt, endAt, countType) {
    // 确定数据来源的粒度：如果要统计小时，则读取分钟级的汇总数据；如果要统计天，则读取小时级的汇总数据
    let getType
    switch (countType) {
      case DATE_FORMAT.UNIT.HOUR:
        getType = DATE_FORMAT.UNIT.MINUTE
        break
      case DATE_FORMAT.UNIT.DAY:
        getType = DATE_FORMAT.UNIT.HOUR
        break
      default:
        this.log(`指令Summary:Error下countType不是day、hour、minute之一，自动退出！`)
        return
    }
    // 从汇总表中获取指定时间范围内的细粒度汇总记录
    let rawResultList = await MErrorSummary.getErrorSummaryByCountType(projectId, startAt, endAt, getType)
    let resultMap = {}
    let cityIdSet = new Set()
    // 遍历细粒度汇总记录，在内存中按 errorName + url 进行聚合
    for (let rawResult of rawResultList) {
      const {
        error_name: errorName,
        error_count: errorCount,
        url_path: url,
        city_distribution_id: cityDistrubutionId
      } = rawResult
      // 累加错误总数
      let oldTotalCount = _.get(resultMap, [errorName, url, 'totalCount'], 0)
      _.set(resultMap, [errorName, url, 'totalCount'], oldTotalCount + errorCount)
      // 收集涉及的城市分布ID，用于后续查询详细的城市分布JSON
      cityIdSet.add(cityDistrubutionId)
      if (_.has(resultMap, [errorName, url, 'idList'])) {
        resultMap[errorName][url]['idList'].push(cityDistrubutionId)
      } else {
        resultMap[errorName][url]['idList'] = [cityDistrubutionId]
      }
    }
    
    // 批量获取城市分布详情
    // 由于城市分布数据存储在另一张表且可能较大，采用分批查询策略避免SQL过长
    let allCityIdList = [...cityIdSet]
    let cityIdLen = allCityIdList.length
    let step = 10000
    let recordList = []
    for (let current = 0; current < cityIdLen; current += step) {
      let sliceIdList = allCityIdList.slice(current, current + step)
      let rawResultList = await MCityDistribution.getByIdListInOneMonth(projectId, sliceIdList, startAt)
      recordList = recordList.concat(rawResultList)
    }
    // 将查询到的城市分布JSON解析并存入 Map，方便后续快速查找
    let cityMap = {}
    for (let rawRecord of recordList) {
      let id = _.get(rawRecord, ['id'], 0)
      let rawJson = JSON.parse(_.get(rawRecord, ['city_distribute_json'], '{}'))
      _.set(cityMap, [id], rawJson)
    }

    let updateCount = 0
    let errorNameList = Object.keys(resultMap)
    // 遍历聚合后的结果，写入最终的汇总表
    for (let errorName of errorNameList) {
      let urlList = Object.keys(resultMap[errorName])
      for (let url of urlList) {
        let totalCount = _.get(resultMap, [errorName, url, 'totalCount'], 0)
        let idList = _.get(resultMap, [errorName, url, 'idList'], [])

        // 合并城市分布数据
        // 将该错误在该时间段内涉及的所有细粒度城市分布JSON合并为一个总的JSON
        let cityDistributionJson = {}
        for (let cityId of idList) {
          let rawCityDistributionJson = _.get(cityMap, [cityId], {})
          for (let country of Object.keys(rawCityDistributionJson)) {
            for (let province of Object.keys(rawCityDistributionJson[country])) {
              for (let city of Object.keys(rawCityDistributionJson[country][province])) {
                let count = _.get(rawCityDistributionJson, [country, province, city], 0)
                let oldCount = _.get(cityDistributionJson, [country, province, city], 0)
                _.set(cityDistributionJson, [country, province, city], count + oldCount)
              }
            }
          }
        }
        let cityDistributionJsonString = JSON.stringify(cityDistributionJson)
        // 使用 replace 模式写入汇总表，如果存在则更新，不存在则插入
        // 注意：这里的 errorType 硬编码为 8 (自定义异常/汇总类型)，具体含义需参考 MMonitor 常量定义
        let isSuccess = await MErrorSummary.replaceSummaryRecord(projectId, startAt, countType, 8, errorName, url, totalCount, cityDistributionJsonString)
        if (isSuccess) {
          updateCount++
        }
      }
    }
    this.log(`项目${projectId}(${projectName})处理完毕, 共插入数据${updateCount}条。`)
  }

  /**
   * 处理分钟级别的汇总逻辑
   * 原理：直接查询原始监控日志表 (t_o_monitor_*)，按 errorType, errorName, url 进行分组统计，
   * 并计算城市分布。这是最底层的汇总，为小时和天的汇总提供数据源。
   * @param {number} projectId - 项目ID
   * @param {string} projectName - 项目名称
   * @param {number} startAt - 开始时间戳
   * @param {number} endAt - 结束时间戳
   * @param {string} countType - 统计类型 (此处应为 minute)
   */
  async handleMinute (projectId, projectName, startAt, endAt, countType) {
    // 查询指定时间范围内的原始监控记录
    let rawRecordMonitorList = await MMonitor.getRecordListInRange(projectId, startAt, endAt)
    let errorTypeNameUrlMap = {}
    // 在内存中遍历原始记录，构建聚合数据结构
    for (let rawRecord of rawRecordMonitorList) {
      const {
        error_type: errorType,
        error_name: errorName,
        url,
        country,
        province,
        city
      } = rawRecord
      // 处理URL，如果是完整URL则提取 host + pathname，否则直接使用
      let urlPath
      if (isUrl(url) === false) {
        urlPath = url
      } else {
        let urlObj = new URL.URL(url)
        urlPath = urlObj.host + urlObj.pathname
      }
      // 累加城市维度的计数
      let errorCountByCity = _.get(errorTypeNameUrlMap, [errorType, errorName, urlPath, 'cityDistribution', country, province, city], 0)
      _.set(errorTypeNameUrlMap, [errorType, errorName, urlPath, 'cityDistribution', country, province, city], errorCountByCity + 1)
      // 累加总错误计数
      let oldErrorCount = _.get(errorTypeNameUrlMap, [errorType, errorName, urlPath, 'errorCount'], 0)
      _.set(errorTypeNameUrlMap, [errorType, errorName, urlPath, 'errorCount'], oldErrorCount + 1)
    }
    let insertCount = 0
    // 遍历内存中的聚合结果，写入数据库
    for (let errorType of Object.keys(errorTypeNameUrlMap)) {
      for (let errorName of Object.keys(errorTypeNameUrlMap[errorType])) {
        for (let urlPath of Object.keys(errorTypeNameUrlMap[errorType][errorName])) {
          const {
            cityDistribution,
            errorCount
          } = _.get(errorTypeNameUrlMap, [errorType, errorName, urlPath], {})

          // 序列化城市分布JSON
          const cityDistrubutionJson = JSON.stringify(cityDistribution)

          // 写入分钟级汇总表
          const isSuccess = await MErrorSummary.replaceSummaryRecord(projectId, startAt, countType, errorType, errorName, urlPath, errorCount, cityDistrubutionJson)
          if (isSuccess) {
            insertCount++
          }
        }
      }
    }
    this.log(`项目${projectId}(${projectName})处理完毕, 共插入数据${insertCount}条。`)
  }

  /**
   * [可覆盖]检查请求参数
   * 默认检查传入的时间范围是否正确, 如果有自定义需求可以在子类中进行覆盖
   * @param {*} args - 命令行参数
   * @param {*} options - 命令行选项
   * @return {Boolean} - 参数是否合法
   */
  isArgumentsLegal (args, options) {
    let { countAtTime, countType } = args

    // 校验统计类型是否为允许的枚举值
    if (countType !== DATE_FORMAT.UNIT.MINUTE && countType !== DATE_FORMAT.UNIT.DAY && countType !== DATE_FORMAT.UNIT.HOUR) {
      this.warn(`统计类别不为 ${DATE_FORMAT.UNIT.MINUTE}/${DATE_FORMAT.UNIT.DAY}/${DATE_FORMAT.UNIT.HOUR} `, 'countType => ', countType)
      return false
    }
    // 校验时间字符串是否能被正确解析为有效的 Moment 对象
    let countAtMoment = moment(countAtTime, DATE_FORMAT.COMMAND_ARGUMENT_BY_UNIT[countType])
    if (moment.isMoment(countAtMoment) === false || countAtMoment.isValid() === false) {
      this.warn(`countAtTime解析失败`, ' => ', countAtTime)
      return false
    }
    return true
  }
}

export default SummaryError