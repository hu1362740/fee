import ParseBase from '~/src/commands/parse/base'
import moment from 'moment'
import _ from 'lodash'
import MCommon from '~/src/model/parse/common'
import MMonitor from '~/src/model/parse/monitor'
import Util from '~/src/library/utils/modules/util'

import DATE_FORMAT from '~/src/constants/date_format'

// 定义按分钟统计使用的日期格式常量
const COUNT_BY_MINUTE_DATE_FORMAT = DATE_FORMAT.DATABASE_BY_MINUTE

// 定义基础表名
const BaseTableName = 't_o_monitor'

/**
 * ParseMonitor 类
 * 继承自 ParseBase，专门用于解析 Kafka 日志中的 Monitor (监控/错误) 类型数据
 * 主要功能包括：过滤合法记录、内存聚合处理、批量写入数据库
 */
class ParseMonitor extends ParseBase {
  /**
   * 定义命令行的签名
   * 包含两个必需参数：startAtYmdHi (开始时间) 和 endAtYmdHi (结束时间)
   * 时间格式需符合 COMMAND_ARGUMENT_BY_MINUTE 定义 (按分钟)
   */
  static get signature() {
    return `
      Parse:Monitor
      {startAtYmdHi:日志扫描范围上限${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE}格式}
      {endAtYmdHi:日志扫描范围下限${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE}格式}
    `
  }

  /**
   * 定义命令行的描述信息
   * 说明该命令用于按分钟解析 kafka 日志，分析 Monitor 数据
   */
  static get description() {
    return '[按分钟] 解析 kafka 日志，分析 Monitor'
  }

  /**
   * 判断该条记录是不是合法的 monitor 记录
   * 过滤规则：
   * 1. type 必须为 'error'
   * 2. md5 不能为空
   * 3. 对于特定类型的旧打点数据（如页面加载异常、启动异常等），如果缺少 error_no (错误名)，则视为非法记录忽略
   * @param {Object} record - 原始日志记录对象
   * @return {Boolean} - true 表示合法，false 表示非法
   */
  isLegalRecord(record) {
    let type = _.get(record, ['type'], '')
    let md5 = _.get(record, ['md5'], '')

    // 规则 1: 类型检查
    if (type !== 'error') {
      return false
    }
    // 规则 2: MD5 检查
    if (_.isEmpty(md5)) {
      return false
    }
    // 对于旧的打点数据，忽略处理
    let errorType = _.get(record, ['code'], '')
    let errorTypeStr = `${errorType}`
    let errorName = _.get(record, ['detail', 'error_no'], '')
    // 规则 3: 特定错误类型必须有对应的错误名，否则过滤
    if (
      (
        errorTypeStr === MMonitor.ERROR_TYPE_页面加载异常 ||
        errorTypeStr === MMonitor.ERROR_TYPE_启动异常 ||
        errorTypeStr === MMonitor.ERROR_TYPE_登录异常 ||
        errorTypeStr === MMonitor.ERROR_TYPE_NODE报错 ||
        errorTypeStr === MMonitor.ERROR_TYPE_JS异常 ||
        errorTypeStr === MMonitor.ERROR_TYPE_自定义异常
      ) && !errorName
    ) {
      return false
    }
    return true
  }

  /**
   * 处理单条记录并缓存到项目内存 Map 中
   * 主要步骤：
   * 1. 提取关键字段 (项目 ID, 时间，错误信息，性能指标，地理位置等)
   * 2. 数据清洗：URL 和错误名长度截断，数值类型转换及默认值处理
   * 3. 时间格式化：将时间戳转换为按分钟的格式
   * 4. 构建记录对象
   * 5. 存入 this.projectMap 结构：Map<projectId, Map<visitAtTime, List<record>>>
   * @param {Object} record - 原始日志记录
   * @return {Boolean} - 处理结果
   */
  async processRecordAndCacheInProjectMap(record) {
    let projectId = _.get(record, ['project_id'], 0)
    let visitAt = _.get(record, ['time'], 0)
    let errorType = _.get(record, ['code'], '')
    let errorName = _.get(record, ['detail', 'error_no'], '')
    let httpCode = _.get(record, ['detail', 'http_code'], 0)
    let duringMsE = _.get(record, ['detail', 'durning_ms'], 0)
    // 兼容字段名拼写差异，优先取 during_ms，不存在则取 durning_ms
    let duringMs = _.get(record, ['detail', 'during_ms'], duringMsE)
    let requestSizeB = _.get(record, ['detail', 'request_size_b'], 0)
    let responseSizeB = _.get(record, ['detail', 'response_size_b'], 0)
    let url = _.get(record, ['detail', 'url'], '')
    let country = _.get(record, ['country'], '')
    let province = _.get(record, ['province'], '')
    let city = _.get(record, ['city'], '')
    let md5 = _.get(record, ['md5'], '')
    let extraData = _.get(record, ['extra'], {})

    // 数据清洗：URL 强制转字符串并限制最大长度 200
    url = url + '' 
    if (url.length > 200) {
      url = url.slice(0, 200)
    }

    // 数据清洗：错误名强制转字符串并限制最大长度 254
    errorName = errorName + ''
    if (errorName.length > 254) {
      errorName = errorName.slice(0, 254)
    }

    // 数据清洗：数值类型转换，无效则置为 0
    httpCode = parseInt(httpCode)
    if (_.isFinite(httpCode) === false) {
      httpCode = 0
    }

    duringMs = parseInt(duringMs)
    if (_.isFinite(duringMs) === false) {
      duringMs = 0
    }

    requestSizeB = parseInt(requestSizeB)
    if (_.isFinite(requestSizeB) === false) {
      requestSizeB = 0
    }

    responseSizeB = parseInt(responseSizeB)
    if (_.isFinite(responseSizeB) === false) {
      responseSizeB = 0
    }

    // 将时间戳格式化为按分钟的字符串，用于聚合
    let visitAtTime = moment.unix(visitAt).format(COUNT_BY_MINUTE_DATE_FORMAT)

    // 构建标准化的监控记录对象
    let monitorRecord = {
      visitAt,
      errorType,
      errorName,
      httpCode,
      duringMs,
      requestSizeB,
      responseSizeB,
      url,
      country,
      province,
      city,
      md5,
      extraData
    }

    // 获取或初始化项目级别的缓存 Map
    let visitAtMap = new Map()
    let monitorRecordList = []
    if (this.projectMap.has(projectId)) {
      visitAtMap = this.projectMap.get(projectId)
      if (visitAtMap.has(visitAtTime)) {
        monitorRecordList = visitAtMap.get(visitAtTime)
      }
    }
    // 将当前记录加入列表
    monitorRecordList.push(monitorRecord)
    visitAtMap.set(visitAtTime, monitorRecordList)
    this.projectMap.set(projectId, visitAtMap)
    return true
  }

  /**
   * 将内存中缓存的数据批量保存到数据库
   * 核心逻辑：
   * 1. 遍历 projectMap 中的所有项目和时间段
   * 2. 查询数据库中最近 10 分钟到未来 1 分钟范围内的现有记录，构建去重集合 (uniqueSet)
   * 3. 遍历待保存记录，若不在去重集合中则执行插入/更新操作
   * 4. 操作流程：
   *    - 先将额外数据 (extraData) 插入到 t_o_monitor_ext 表，获取 monitor_ext_id
   *    - 将主数据连同 ext_id 通过 replaceInto 写入主表 (t_o_monitor)，实现存在即更新，不存在即插入
   * 5. 实时汇报处理进度
   * @return {Object} - 包含总记录数、处理记录数、成功保存数的统计对象
   */
  async save2DB() {
    let totalRecordCount = this.getRecordCountInProjectMap()
    let processRecordCount = 0
    let successSaveCount = 0
    for (let [projectId, visitAtMap] of this.projectMap) {
      for (let [visitAtTime, monitorMap] of visitAtMap) {
        // 计算当前时间片的 Unix 时间戳
        let visitAt = moment(visitAtTime, DATE_FORMAT.DATABASE_BY_MINUTE).unix()
        // 定义去重查询的时间范围：当前时间前 10 分钟 到 后 1 分钟
        let tenMinutesAgoAt = visitAt - 10 * 60
        let oneMinuteLaterAt = visitAt + 60
        let processTableName = MMonitor.getTableName(projectId, visitAt)
        
        // 获取该时间范围内已存在的数据库记录列表
        let rawMonitorList = await MMonitor.getRecordListInRange(projectId, tenMinutesAgoAt, oneMinuteLaterAt)
        let uniqueSet = new Set()
        // 构建去重键值集合 (log_at + md5)
        for (let rawRecord of rawMonitorList) {
          const { log_at: logAt, md5 } = rawRecord
          const uniqueKey = logAt + '' + md5
          uniqueSet.add(uniqueKey)
        }
        
        // 遍历待处理的内存记录
        for (let monitorRecord of monitorMap) {
          let {
            visitAt,
            extraData,
            md5
          } = monitorRecord
          
          // 准备主表插入/更新的 SQL 参数
          const sqlParams = {
            error_type: monitorRecord.errorType,
            error_name: monitorRecord.errorName,
            http_code: monitorRecord.httpCode,
            during_ms: monitorRecord.duringMs,
            request_size_b: monitorRecord.requestSizeB,
            response_size_b: monitorRecord.responseSizeB,
            url: monitorRecord.url,
            country: monitorRecord.country,
            province: monitorRecord.province,
            city: monitorRecord.city,
            md5: monitorRecord.md5,
            log_at: visitAt
          }
          // 对接收到的参数做进一步校验，因为数据库里面的类型与传过来的类型不一致
          // 比如http_code在一些情况下传来的是空字符串，数据库中存放的是int型
          // 对接收到的参数做进一步校验，处理空字符串与数据库类型不一致的问题 (如 http_code)
          const sqlRecord = Util.handleEmptyData(sqlParams)

          // 构造 monitor 主表查询参数 (用于后续 replaceInto)
          let monitorParams = {
            projectId: projectId,
            tableName: BaseTableName,
            splitBy: MCommon.SPLIT_BY.MONTH,
            select: 'monitor_ext_id',
            where: {
              log_at: visitAt,
              md5: monitorRecord.md5
            }
          }
          
          // 构造 monitor_ext 扩展表插入参数
          let monitorExtParams = {
            projectId: projectId,
            tableName: 't_o_monitor_ext',
            datas: {
              ext_json: JSON.stringify(extraData)
            },
            splitBy: MCommon.SPLIT_BY.MONTH
          }
          
          const key = visitAt + '' + md5
          // 核心去重逻辑：如果数据库中不存在该键值的记录，则执行写入
          if (uniqueSet.has(key) === false) {
            // 1. 插入扩展表数据，获取生成的 ID
            let monitorRes = await MCommon.insertInto(monitorExtParams)
            sqlRecord.monitor_ext_id = monitorRes[0]
            
            // 2. 将完整数据写入主表 (replace 模式)
            monitorParams.datas = sqlRecord
            let isSuccess = await MCommon.replaceInto(monitorParams)
            if (isSuccess) {
              successSaveCount = successSaveCount + 1
            }
          }
          processRecordCount = processRecordCount + 1
          // 汇报进度
          this.reportProcess(processRecordCount, successSaveCount, totalRecordCount, processTableName)
        }
      }
    }
    return { totalRecordCount, processRecordCount, successSaveCount }
  }

  /**
   * 统计 projectMap 中缓存的记录总数
   * 遍历多层 Map 结构累加计数
   * @return {Number} - 总记录数
   */
  getRecordCountInProjectMap() {
    let totalCount = 0
    for (let [projectId, visitAtMap] of this.projectMap) {
      for (let [visitAtTime, monitorMap] of visitAtMap) {
        for (let monitorRecord of monitorMap) {
          totalCount = totalCount + 1
        }
      }
    }
    return totalCount
  }
}

export default ParseMonitor