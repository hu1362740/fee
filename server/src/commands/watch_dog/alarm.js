import moment from 'moment'
import Base from '~/src/commands/base'
import redis from '~/src/library/redis'
import Alert from '~/src/library/utils/modules/alert'
import MMonitor from '~/src/model/parse/monitor'
import WatchIdList from '~/src/configs/alarm'
import MAlarmConfig from '~/src/model/project/alarm/alarm_config'
import Util from '~/src/library/utils/modules/util'
import MProject from '~/src/model/project/project'
import MProjectMember from '~/src/model/project/project_member'
import MAlarmLog from '~/src/model/project/alarm/alarm_log'
import Logger from '~/src/library/logger'
import _ from 'lodash'

// Redis键前缀，用于存储每个报警配置的冷却状态
const BASE_REDIS_KEY = 'plat_fe_fee_watch_alarm_'
// 最大并发查询数，限制同时进行的数据库查询数量，防止压垮数据库
const MAX_QUERY_COUNT = 10
// 最大睡眠计数，用于检测长时间等待锁的情况
const MAX_SLEEP_COUNT = 60

/**
 * 根据报警配置ID生成唯一的Redis键
 * @param {number} id - 报警配置ID
 * @returns {string} Redis键
 */
function getRedisKey (id) {
  return BASE_REDIS_KEY + id
}

/**
 * 通用报警看门狗命令
 * 职责：遍历所有启用的报警配置，监测对应项目的错误数量，若达到阈值则触发报警
 * 特性：支持并发控制，防止过多数据库查询；支持报警间隔冷却，避免频繁骚扰
 */
class WatchAlarm extends Base {
  constructor() {
    super()
    // 当前正在进行的异步查询计数器
    this.currentQueryCounter = 0
  }

  // 定义命令行签名
  static get signature () {
    return `
        WatchDog:Alarm
    `
  }

  // 命令描述
  static get description () {
    return '[根据报警配置] 监测每一条报警配置对应的项目错误'
  }

  /**
   * 命令执行入口
   * @param {Object} args - 命令行参数
   * @param {Object} options - 命令行选项
   */
  async execute (args, options) {
    // 获取所有启用的报警配置列表
    const alarmConfigList = await MAlarmConfig.getAllEnabled()
    for (let alarmConfig of alarmConfigList) {
      // 解构报警配置信息
      const {
        id,
        project_id: projectId,
        error_name: errorName,
        time_range_s: timeRange,
        max_error_count: maxErrorCount,
        alarm_interval_s: alarmInterval,
        note
      } = alarmConfig
      
      const redisKey = getRedisKey(id)
      // 检查该报警配置是否在冷却期内（即最近是否报过警）
      const hasAlertInAlarmInterval = await redis.asyncGet(redisKey)
      if (hasAlertInAlarmInterval) {
        this.log(`项目${projectId}监听的${errorName}错误在${timeRange}秒内报警过，自动跳过`)
      } else {
        // 并发控制逻辑：如果当前并发数未达到上限，则发起异步查询；否则等待
        let waitForDispatch = true
        let sleepCounter = 0
        while (waitForDispatch) {
          if (this.currentQueryCounter < MAX_QUERY_COUNT) {
            // 发起异步报警检查
            this.autoAlarm(projectId, errorName, timeRange, maxErrorCount, alarmInterval, redisKey, note, id)
              .then(() => {
                // 查询结束后，计数器减1
                this.currentQueryCounter = this.currentQueryCounter - 1
              })
              .catch(() => {
                // 异常情况下也需减少计数器，防止泄露
                this.currentQueryCounter = this.currentQueryCounter - 1
              })
            // 计数器加1，表示新增一个进行中的查询
            this.currentQueryCounter = this.currentQueryCounter + 1
            waitForDispatch = false
          } else {
            // 如果并发数已满，休眠1秒后重试
            sleepCounter = sleepCounter + 1
            // 如果等待时间过长（超过MAX_SLEEP_COUNT秒），发送后台报警通知开发人员
            if (sleepCounter > MAX_SLEEP_COUNT) {
              const sleepMinutes = sleepCounter / 60
              await this.sendAlert(WatchIdList.WATCH_UCID_LIST_BACKEND, `报警系统数据库查询已经睡眠${sleepMinutes}分钟，可能出问题了。`)
            }
            await Util.sleep(1000)
          }
        }
      }
    }
  }

  /**
   * 执行具体的报警逻辑
   * @param {number} projectId - 项目ID
   * @param {string} errorName - 错误名称
   * @param {number} timeRange - 监控时间范围（秒）
   * @param {number} maxErrorCount - 最大错误数阈值
   * @param {number} alarmInterval - 报警间隔（秒）
   * @param {string} redisKey - Redis冷却键
   * @param {string} note - 报警备注
   * @param {number} configId - 报警配置ID
   */
  async autoAlarm (projectId, errorName, timeRange, maxErrorCount, alarmInterval, redisKey, note, configId) {
    const nowAt = moment().unix()
    const timeAgoAt = nowAt - timeRange
    // 查询指定时间范围内、指定项目的指定错误类型的错误数量
    const errorCount = await MMonitor.getErrorCountForAlarm(projectId, errorName, timeAgoAt, nowAt)
    this.log(`项目${projectId}监控的${errorName}错误最近${timeRange}秒错误数 => ${errorCount}`)
    
    // 指定时间内报错数大于MaxErrorCount, 则报警
    if (errorCount >= maxErrorCount) {
      // 获取项目详细信息用于构建报警消息
      const project = await MProject.get(projectId)
      const projectName = _.get(project, ['display_name'], projectId)
      // 计算抽样比例百分比
      const projectRate = _.get(project, ['rate'], 0) / 10000 * 100
      // 获取该项目负责报警接收人的UCID列表
      const alarmUcidList = await MProjectMember.getAlarmUcidList(projectId)
      const nowAt = moment().unix()
      
      // 如果错误名为 '*'，替换为中文描述 '所有'
      if (errorName === '*') {
        errorName = '所有'
      }
      
      // 构建报警消息内容
      let alarmMsg = `项目【${projectName}】监控的【${errorName}】错误，抽样比例【${projectRate}%】 最近【${timeRange}】秒内错误数【${errorCount}】, 达到阈值【${maxErrorCount}】,触发报警, 报警备注【${note}】。`
      this.log(alarmMsg)
      
      // 发送报警消息给项目负责人
      await this.sendAlert(alarmUcidList, alarmMsg)//企业微信推送 - 根据 UCID 发送给对应负责人
      
      // 记录报警日志到数据库
      const isSuccess = await MAlarmLog.insert(projectId, configId, nowAt, errorName, alarmMsg)
      if (isSuccess === false) {
        Logger.error('添加报警日志失败')
      }
      
      // 设置Redis冷却标记，在alarmInterval秒内不再对该配置进行报警检查
      await redis.asyncSetex(redisKey, alarmInterval, 1)
    }
  }

  /**
   * 发送警报
   *
   * @param {Array} ucidList - 接收报警的用户UCID列表
   * @param {string} message - 报警消息内容
   */
  async sendAlert (ucidList, message) {
    Alert.sendMessage(ucidList, message)
  }
}

export default WatchAlarm