import ParseBase from '~/src/commands/parse/base'
import moment from 'moment'
import _ from 'lodash'
import MUvRecord from '~/src/model/parse/uv_record'
import DATE_FORMAT from '~/src/constants/date_format'

/**
 * UV解析命令类
 * 继承自 ParseBase，用于处理 Kafka 日志中的 UV (Unique Visitor) 数据
 * 主要功能：解析指定时间范围内的日志，提取唯一用户标识(uuid)，并去重后存入数据库
 */
class ParseUV extends ParseBase {
  /**
   * 定义命令行签名为 Parse:UV
   * 接收两个参数：startAtYmdHi（开始时间）和 endAtYmdHi（结束时间），格式为分钟级字符串
   */
  static get signature () {
    return `
     Parse:UV 
     {startAtYmdHi:日志扫描范围上限${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE}格式}
     {endAtYmdHi:日志扫描范围下限${DATE_FORMAT.COMMAND_ARGUMENT_BY_MINUTE}格式}
     `
  }

  /**
   * 命令描述信息
   */
  static get description () {
    return '[按小时] 解析kafka日志, 分析记录指定时间范围内的uv'
  }

  /**
   * 判断该条记录是不是合法的UV记录
   * 当前实现默认所有记录都合法，具体校验逻辑在 processRecordAndCacheInProjectMap 中执行
   * @param {Object} record - 原始日志记录对象
   * @return {Boolean} - 是否合法
   */
  isLegalRecord (record) {
    return true
  }

  /**
   * 处理单条记录并缓存到内存映射结构 projectMap 中
   * 数据结构: projectMap -> projectId -> visitAtHour(分钟) -> uuid -> uvRecord
   * 作用：聚合相同 projectId、相同分钟、相同 uuid 的记录，累加 pvCount
   * @param {Object} record - 原始日志记录对象
   * @return {Boolean} - 处理是否成功
   */
  async processRecordAndCacheInProjectMap (record) {
    // 提取公共信息中的 uuid
    let commonInfo = _.get(record, ['common'], {})
    let uuid = _.get(commonInfo, ['uuid'], '')
    // 提取访问时间戳，用户行为发生的时间
    let visitAt = _.get(record, ['time'], 0)
    // 提取项目ID
    let projectId = _.get(record, ['project_id'], 0)
    // 提取地理位置信息
    let country = _.get(record, ['country'], '')
    let province = _.get(record, ['province'], '')
    let city = _.get(record, ['city'], '')
    // 初始 PV 计数为 1
    let pvCount = 1

    // 校验数据合法性：时间戳必须是非零数字，uuid 不能为空
    if (_.isNumber(visitAt) === false || visitAt === 0 || _.isEmpty(uuid)) {
      this.log(`数据不合法, 自动跳过 visitAt => ${visitAt}, uuid => ${uuid}`)
      return false
    }

    // 将时间戳转换为数据库存储格式的分钟字符串 (例如: "2023-10-27 10:30")
    let visitAtHour = moment.unix(visitAt).format(DATE_FORMAT.DATABASE_BY_MINUTE)
    
    // 构建当前 UV 记录对象
    let uvRecord = {
      projectId,
      visitAt,
      uuid,
      country,
      province,
      city,
      pvCount
    }

    // 从 projectMap 中获取或初始化嵌套 Map 结构
    let visitAtMap = new Map()
    let uvMap = new Map()
    
    // 如果 projectMap 中已存在该 projectId，则获取其对应的 visitAtMap
    if (this.projectMap.has(projectId)) {
      visitAtMap = this.projectMap.get(projectId)
      // 如果 visitAtMap 中已存在该分钟时间点，则获取其对应的 uvMap
      if (visitAtMap.has(visitAtHour)) {
        uvMap = visitAtMap.get(visitAtHour)
        // 如果该分钟内已存在该 uuid，则累加 PV 计数
        if (uvMap.has(uuid)) {
          let oldUvRecord = uvMap.get(uuid)
          uvRecord.pvCount = oldUvRecord.pvCount + uvRecord.pvCount
        }
      }
    }

    // 更新 Map 结构：将最新的 uvRecord 存入 uvMap，uvMap 存入 visitAtMap，visitAtMap 存入 projectMap
    uvMap.set(uuid, uvRecord)
    visitAtMap.set(visitAtHour, uvMap)
    this.projectMap.set(projectId, visitAtMap)
    return true
  }

  /**
   * 将内存中缓存的 UV 数据同步保存到数据库
   * 逻辑：遍历 projectMap，对每个 projectId 和每分钟时间点，检查数据库中已存在的 uuid，
   * 仅插入数据库中不存在的 uuid 记录，避免重复插入
   * @return {Object} - 包含总记录数、处理记录数、成功保存数的统计对象
   */
  async save2DB () {
    // 获取内存中待处理的总记录数
    let totalRecordCount = this.getRecordCountInProjectMap()
    let processRecordCount = 0
    let successSaveCount = 0

    // 遍历每个项目
    for (let [projectId, visitAtMap] of this.projectMap) {
      // 遍历每个分钟时间点
      for (let [visitAtHour, uvMap] of visitAtMap) {
        // 将分钟字符串转换回 Unix 时间戳，用于数据库查询
        let visitAtInDb = moment(visitAtHour, DATE_FORMAT.DATABASE_BY_MINUTE).unix()
        
        // 查询数据库中该 projectId 和该小时内已存在的 uuid 集合，用于去重判断
        let existUuidSet = await MUvRecord.getExistUuidSetInHour(projectId, visitAtInDb)
        
        // 遍历该分钟内的所有 uv 记录
        for (let [uv, uvRecord] of uvMap) {
          let {
            projectId,
            visitAt,
            uuid,
            country,
            province,
            city,
            pvCount
          } = uvRecord
          
          let isSuccess = false
          // 确保 uuid 为字符串类型，防止类型不一致导致的问题
          uuid = `${uuid}` 
          
          // 核心去重逻辑：只有当数据库中不存在该 uuid 时才执行插入操作
          if (existUuidSet.has(uuid) === false) {
            // 调用模型方法替换或插入 UV 记录
            isSuccess = await MUvRecord.replaceUvRecord(projectId, uuid, visitAt, country, province, city)
            // 插入成功后，将 uuid 加入本地 existUuidSet，防止同一批次内重复处理（虽然逻辑上 uuid 在 map 中是唯一的，但增强稳定性）
            existUuidSet.add(uuid)
          }
          
          processRecordCount = processRecordCount + 1
          if (isSuccess) {
            successSaveCount = successSaveCount + 1
          }
          
          // 上报处理进度
          this.reportProcess(processRecordCount, successSaveCount, totalRecordCount)
        }
      }
    }
    return { totalRecordCount, processRecordCount, successSaveCount }
  }

  /**
   * 统计 projectMap 中缓存的 UV 记录总数
   * 用于进度报告的分母
   * @return {Number} - 总记录数
   */
  getRecordCountInProjectMap () {
    let totalCount = 0
    for (let [projectId, visitAtMap] of this.projectMap) {
      for (let [visitAtHour, uvMap] of visitAtMap) {
        for (let [uv, uvRecord] of uvMap) {
          totalCount = totalCount + 1
        }
      }
    }
    return totalCount
  }
}

export default ParseUV