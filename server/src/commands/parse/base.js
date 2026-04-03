import fs from 'fs'
import Base from '~/src/commands/base'
import { readLine } from 'lei-stream'
import moment from 'moment'
import LKafka from '~/src/library/kafka'
import DATE_FORMAT from '~/src/constants/date_format'

import Alert from '~/src/library/utils/modules/alert'
import AlarmConfig from '~/src/configs/alarm'

/**
 * 提供框架方法，方便编写处理函数
 * 
 * ParseBase 是日志解析命令的抽象基类。
 * 它定义了日志解析的标准流程：
 * 1. 验证时间范围参数
 * 2. 按分钟遍历日志文件
 * 3. 逐行读取并过滤合法记录
 * 4. 将处理后的数据缓存到内存 (projectMap)
 * 5. 批量写入数据库
 * 
 * 子类需要继承此类并实现以下抽象方法：
 * - isLegalRecord(record): 判断记录是否合法
 * - processRecordAndCacheInProjectMap(record): 处理记录并缓存
 * - save2DB(): 将缓存数据存入数据库
 * - getRecordCountInProjectMap(): 统计缓存中的记录总数
 */
class ParseBase extends Base {
  constructor() {
    super()

    // 初始化属性 (目前只能在 constructor 里注册属性)

    // 统一按项目进行统计
    // key: projectId, value: Map<timeKey, dataList>
    this.projectMap = new Map()
    this.startAtMoment = null
    this.endAtMoment = null

    // 定义命令行参数的时间格式 (精确到分钟)
    this.DATE_FORMAT_ARGUMENTS = DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE
    // 定义日志显示的时间格式
    this.DATE_FORMAT_DISPLAY = DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE
  }

  /**
   * 命令执行的入口函数
   * 
   * 流程：
   * 1. 校验参数合法性
   * 2. 解析开始和结束时间
   * 3. 调用 parseLog 解析日志文件
   * 4. 调用 save2DB 将数据入库
   * 5. 输出统计结果
   * 
   * @param {*} args - 命令行位置参数，包含 startAtYmdHi 和 endAtYmdHi
   * @param {*} options - 命令行选项参数
   * @returns {Promise<Boolean>} - 执行成功返回 true，参数错误返回 false
   */
  async execute(args, options) {
    let { startAtYmdHi, endAtYmdHi } = args
    // 检查请求参数是否正确
    if (this.isArgumentsLegal(args, options) === false) {
      this.warn('参数不正确，自动退出')
      // 发送报警通知
      Alert.sendMessage(AlarmConfig.WATCH_UCID_LIST_DEFAULT, `${this.constructor.name}参数不正确，自动退出`)
      return false
    }
    
    // 将字符串时间转换为 Moment 对象
    this.startAtMoment = moment(startAtYmdHi, this.DATE_FORMAT_ARGUMENTS)
    this.endAtMoment = moment(endAtYmdHi, this.DATE_FORMAT_ARGUMENTS)
    
    // 记录开始分析的时间范围日志
    this.log(`开始分析${this.startAtMoment.format(this.DATE_FORMAT_DISPLAY) + ':00'}~${this.endAtMoment.format(this.DATE_FORMAT_DISPLAY) + ':59'}范围内的记录`)
    
    // 转换为 Unix 时间戳 (秒)
    let startAt = this.startAtMoment.unix()
    let endAt = this.endAtMoment.unix()
    
    // 执行日志解析核心逻辑
    await this.parseLog(startAt, endAt)
    
    this.log('全部数据处理完毕，存入数据库中')
    
    // 执行数据入库操作，获取统计信息
    let { totalRecordCount, processRecordCount, successSaveCount } = await this.save2DB()
    
    // 输出最终处理结果统计
    this.log(`${this.startAtMoment.format(this.DATE_FORMAT_DISPLAY) + ':00'}~${this.endAtMoment.format(this.DATE_FORMAT_DISPLAY) + ':59'}范围内日志录入完毕，共记录数据${processRecordCount}/${totalRecordCount}条，入库成功${successSaveCount}条`)
  }

  /**
   * [可覆盖] 检查请求参数
   * 
   * 默认检查传入的时间范围是否正确：
   * 1. 开始时间格式是否合法
   * 2. 结束时间格式是否合法
   * 3. 结束时间是否晚于开始时间
   * 
   * 如果有自定义需求可以在子类中进行覆盖
   * 
   * @param {*} args - 命令行参数
   * @param {*} options - 命令行选项
   * @return {Boolean} - 参数合法返回 true，否则返回 false
   */
  isArgumentsLegal(args, options) {
    let { startAtYmdHi, endAtYmdHi } = args

    let startAtMoment = moment(startAtYmdHi, DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE)
    let endAtMoment = moment(endAtYmdHi, DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE)
    
    // 校验开始时间
    if (moment.isMoment(startAtMoment) === false || startAtMoment.isValid() === false) {
      let message = `startAtYmdHi 参数不正确 => ${startAtYmdHi}`
      this.warn(message)
      Alert.sendMessage(AlarmConfig.WATCH_UCID_LIST_DEFAULT, message)
      return false
    }
    
    // 校验结束时间
    if (moment.isMoment(endAtMoment) === false || endAtMoment.isValid() === false) {
      let message = `endAtYmdHi 参数不正确 =>${endAtYmdHi}`
      this.warn(message)
      Alert.sendMessage(AlarmConfig.WATCH_UCID_LIST_DEFAULT, message)
      return false
    }
    
    // 校验时间范围逻辑 (结束时间不能小于开始时间)
    if (startAtMoment.unix() > endAtMoment.unix()) {
      let message = `结束时间小于开始时间 :  ${startAtYmdHi} => ${startAtMoment.unix()} endAtYmdHi =>  ${endAtYmdHi} => ${endAtMoment.unix()}`
      this.warn(message)
      Alert.sendMessage(AlarmConfig.WATCH_UCID_LIST_DEFAULT, message)
      return false
    }
    return true
  }

  /**
   * 解析指定时间范围内的日志记录，并录入到数据库中
   * 
   * 核心逻辑：
   * 1. 按分钟粒度遍历时间范围 (startAt -> endAt)
   * 2. 获取对应分钟的 Kafka 日志文件路径
   * 3. 如果文件存在，使用流式读取逐行解析
   * 4. 对每一行数据进行 JSON 解析，并调用 isLegalRecord 过滤
   * 5. 合法数据交给 processRecordAndCacheInProjectMap 处理
   * 
   * @param {*} startAt - 开始时间戳 (秒)
   * @param {*} endAt - 结束时间戳 (秒)
   * @return {Promise<null>}
   */
  async parseLog(startAt, endAt) {
    let that = this
    // 按分钟循环遍历 (每次增加 60 秒)
    for (let currentAt = startAt; currentAt <= endAt; currentAt = currentAt + 60) {
      let currentAtMoment = moment.unix(currentAt)
      // 获取当前分钟对应的日志文件绝对路径
      let absoluteLogUri = LKafka.getAbsoluteLogUriByType(currentAt, LKafka.LOG_TYPE_JSON)
      that.log(`开始处理${currentAtMoment.format(that.DATE_FORMAT_DISPLAY)}的记录，log 文件地址 => ${absoluteLogUri}`)
      
      let logUri = LKafka.getAbsoluteLogUriByType(currentAt, LKafka.LOG_TYPE_JSON)
      
      // 检查文件是否存在，不存在则跳过
      if (fs.existsSync(logUri) === false) {
        that.log(`log 文件不存在，自动跳过 => ${absoluteLogUri}`)
        continue
      }
      
      // 确保按文件顺序逐行读写日志
      // 使用 Promise 封装流式读取过程，确保异步完成后再继续下一分钟的处理
      await new Promise(function (resolve, reject) {
        // 处理每一行数据的回调
        let onDataReceive = async (data, next) => {
          let record = JSON.parse(data)
          // 判断记录是否合法
          if (that.isLegalRecord(record)) {
            // 处理合法记录并缓存
            that.processRecordAndCacheInProjectMap(record)
          }
          // 触发读取下一行
          next()
        }
        
        // 文件读取完成的回调
        let onReadFinish = () => {
          resolve()
        }
        
        // 启动流式读取
        readLine(fs.createReadStream(logUri), {
          // 换行符，默认\n
          newline: '\n',
          // 是否自动读取下一行，默认 false (这里手动控制 next())
          autoNext: false,
          // 编码器，可以为函数或字符串（内置编码器：json，base64），默认 null
          encoding: null
        }).go(onDataReceive, onReadFinish)
      })
      that.log('处理完毕')
    }
  }

  /**
   * [必须覆盖] 判断该条记录是不是需要解析的记录
   * 
   * 标准结构示例：
   * {"type":"product","code":10001,"detail":{"duration_ms":35544},"extra":{},"common":{...},"msg":"","project_id":1,"time":1537426981,...}
   * 
   * 子类需要根据具体的业务类型 (type)、错误码 (code) 等字段进行过滤。
   * 默认实现直接抛出异常提示未覆盖，并返回 true (实际不会执行到返回)。
   * 
   * @param {Object} record - 原始日志记录对象
   * @return {Boolean} - 是合法记录返回 true，否则返回 false
   */
  isLegalRecord(record) {
    this.mustBeOverride()
    // 以下为示例代码，展示常见的过滤逻辑 (已被注释)
    // let recordType = get(record, ['type'], '')
    // let code = get(record, ['code'], '')
    // let projectId = get(record, ['project_id'], '')
    // let durationMs = get(record, ['detail', 'duration_ms'], '')
    // code = parseInt(code)
    // durationMs = parseInt(durationMs)
    // projectId = parseInt(projectId)
    // if (recordType !== LegalRecordType) {
    //   return false
    // }
    // if (isNumber(code) === false) {
    //   return false
    // }
    // if (code !== LegalRecordCode) {
    //   return false
    // }
    // if (isNumber(projectId) === false) {
    //   return false
    // }
    // if (projectId < 0) {
    //   return false
    // }
    // if (isNumber(durationMs) === false) {
    //   return false
    // }
    // if (durationMs > MaxAllowRecordDuringMs) {
    //   return false
    // }
    // if (durationMs < MinAllowRecordDuringMs) {
    //   return false
    // }
    return true
  }

  /**
   * [必须覆盖] 处理记录，并将结果缓存在 this.projectMap 中
   * 
   * 该方法负责从原始 record 中提取需要的字段，进行数据清洗、转换，
   * 然后按照 projectId 和时间维度存储到内存 Map 中，等待批量入库。
   * 
   * 示例数据结构：
   * {"type":"product","code":10001,"detail":{"duration_ms":30807},"extra":{},"common":{...},"msg":""}
   * 
   * @param {Object} record - 经过 isLegalRecord 过滤后的合法记录对象
   * @returns {Promise<Boolean>}
   */
  async processRecordAndCacheInProjectMap(record) {
    this.mustBeOverride()
    // 以下为示例代码，展示如何提取字段并缓存 (已被注释)
    // let projectId = get(record, ['project_id'], 0)
    // let durationMs = get(record, ['detail', 'duration_ms'], 0)
    // let country = get(record, ['country'], '')
    // let province = get(record, ['province'], '')
    // let city = get(record, ['city'], '')
    // let recordAt = get(record, ['time'], 0)

    // let countAtTime = moment.unix(recordAt).format(COUNT_BY_HOUR_DATE_FORMAT)
    // let distributionPath = [country, province, city]

    // let countAtMap = new Map()
    // let distribution = {}
    // if (this.projectMap.has(projectId)) {
    //   countAtMap = this.projectMap.get(projectId)
    //   if (countAtMap.has(countAtTime)) {
    //     distribution = countAtMap.get(countAtTime)
    //     if (has(distribution, distributionPath)) {
    //       let oldDurationMs = get(distribution, distribution, 0)
    //       durationMs = durationMs + oldDurationMs
    //     }
    //   }
    // }
    // set(distribution, distributionPath, durationMs)
    // countAtMap.set(countAtTime, distribution)
    // this.projectMap.set(projectId, countAtMap)
    return true
  }

  /**
   * [必须覆盖] 将数据同步到数据库中
   * 
   * 该方法遍历 projectMap 中的缓存数据，执行批量插入或更新操作。
   * 通常包含去重逻辑、事务处理、进度汇报等。
   * 
   * @returns {Promise<Object>} - 返回统计信息 { totalRecordCount, processRecordCount, successSaveCount }
   */
  async save2DB() {
    this.mustBeOverride()
    let processRecordCount = 0
    let successSaveCount = 0
    // 获取待处理的总记录数
    let totalRecordCount = this.getRecordCountInProjectMap()

    // 处理的时候调一下这个方法，专业打印处理进度
    this.reportProcess(processRecordCount, successSaveCount, totalRecordCount)

    // 以下为示例代码，展示如何遍历 Map 并入库 (已被注释)
    // for (let [projectId, countAtMap] of projectMap) {
    //   for (let [countAtTime, distribution] of countAtMap) {
    //     let recordList = MCityDistribution.getFlattenCityRecordListInDistribution(distribution)
    //     let totalStayMs = 0
    //     for (let record of recordList) {
    //       totalStayMs = totalStayMs + record
    //     }

    //     let totalUv = await MUniqueView.getTotalUv(projectId, countAtTime, COUNT_TYPE_HOUR)

    //     let isSuccess = await replaceAndAutoIncreaseTotalStayMsInUvRecord(projectId, totalStayMs, totalUv, countAtTime, COUNT_TYPE_HOUR, distribution)
    //     processRecordCount = processRecordCount + 1
    //     if (isSuccess) {
    //       successSaveCount = successSaveCount + 1
    //     }
    //     if (processRecordCount % 100 === 0) {
    //       this.log(`当前已处理${processRecordCount}/${totalRecordCount}条记录，其中，入库成功${successSaveCount}条`)
    //     }
    //   }
    // }
    return { totalRecordCount, processRecordCount, successSaveCount }
  }

  /**
   * 汇报进度
   * 
   * 每处理 100 条记录打印一次日志，方便监控长耗时任务。
   * 
   * @param {*} processRecordCount - 已处理的记录数
   * @param {*} successSaveCount - 入库成功的记录数
   * @param {*} totalRecordCount - 总记录数
   * @param {String} tableName - [可选] 当前入库的表名
   */
  reportProcess(processRecordCount, successSaveCount, totalRecordCount, tableName = '') {
    let insertTable = ''
    if (tableName) {
      insertTable = `, 入库${tableName}`
    }
    // 每 100 条打印一次进度
    if (processRecordCount % 100 === 0) {
      this.log(`当前已处理${processRecordCount}/${totalRecordCount}条记录${insertTable}, 已成功${successSaveCount}条`)
    }
  }

  /**
   * [必须覆盖] 统计 projectMap 中的记录总数
   * 
   * 用于计算处理进度百分比。
   * 
   * @returns {Number} - 记录总数
   */
  getRecordCountInProjectMap() {
    this.mustBeOverride()
    let totalCount = 0
    // 以下为示例代码，展示如何遍历 Map 统计总数 (已被注释)
    // for (let [projectId, countAtMap] of projectMap) {
    //   for (let [countAtTime, distribution] of countAtMap) {
    //     totalCount = totalCount + 1
    //   }
    // }
    return totalCount
  }

  /**
   * 辅助方法：提示子类必须覆盖某个方法
   * 
   * 如果子类忘记实现抽象方法，调用此方法会输出警告并强制退出进程，
   * 防止程序在错误状态下继续运行。
   */
  mustBeOverride() {
    this.warn('注意，这里有个方法没有覆盖')
    this.warn('当场退出←_←')
    process.exit(0)
  }
}

export default ParseBase