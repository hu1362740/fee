import moment from 'moment'
import Base from '~/src/commands/base'
import redis from '~/src/library/redis'
import Alert from '~/src/library/utils/modules/alert'
import MMonitor from '~/src/model/parse/monitor'
import WatchIdList from '~/src/configs/alarm'
import DATE_FORMAT from '~/src/constants/date_format'

// SaaS平台特定的项目ID
const PROJECT_ID_SAAS = 1
// 允许的最大错误数量阈值，超过此值将触发报警
const MAX_ALLOW_ERROR_COUNT = 20
// Redis键名，用于记录最近5分钟内是否已发送过报警，防止频繁报警
const REDIS_KEY = 'plat_fe_fee_sass_watch_dog'

/**
 * SaaS平台看门狗监控命令
 * 职责：按分钟检查SaaS系统最近5分钟内的错误数，若超出阈值则自动报警
 * 注意：由于日志落表存在延迟，实际监控的是5分钟前到10分钟前的数据区间（代码中逻辑为 now-10 到 now-5）
 */
class WatchDog4SaaS extends Base {
  // 定义命令行签名
  static get signature () {
    return `
     WatchDog:Saas 
     `
  }

  // 命令描述
  static get description () {
    return '[按分钟] 检查最近5分钟内错误数是否超出阈值, 自动报警'
  }

  /**
   * 命令执行入口
   * @param {Object} args - 命令行参数
   * @param {Object} options - 命令行选项
   */
  async execute (args, options) {
    let nowAt = moment().unix()
    // 格式化时间字符串用于日志输出，显示监控的时间窗口
    let startAtYmdHis = moment.unix(nowAt - 60 * 5).format(DATE_FORMAT.DISPLAY_BY_SECOND)
    let finishAtYmdHis = moment.unix(nowAt - 60 * 0).format(DATE_FORMAT.DISPLAY_BY_SECOND)
    
    // 检查Redis中是否存在报警标记，如果存在说明5分钟内已报过警，跳过本次检查
    let hasAlertIn5Minute = await redis.asyncGet(REDIS_KEY)
    if (hasAlertIn5Minute) {
      this.log('5分钟内报过警, 自动跳过')
    } else {
      // 查找特定时间窗口内的错误数
      // 注意：这里查询的是 nowAt - 60*10 到 nowAt - 60*5 之间的数据，以规避日志落表延迟
      let errorCount = await MMonitor.getErrorCountInRangeBySameMonth(PROJECT_ID_SAAS, nowAt - 60 * 10, nowAt - 60 * 5)
      this.log(`${startAtYmdHis}~${finishAtYmdHis}5分钟内错误数 => ${errorCount}`)
      
      // 判断错误数是否超过阈值
      if (errorCount >= MAX_ALLOW_ERROR_COUNT) {
        // 5分钟内报错数大于20, 则报警
        this.log(`${startAtYmdHis}~${finishAtYmdHis}错误数超出阈值=> ${MAX_ALLOW_ERROR_COUNT}, 触发报警`)
        // 发送报警消息给SaaS负责人
        await this.sendAlert(WatchIdList.WATCH_UCID_LIST_SAAS, `sass系统${startAtYmdHis}~${finishAtYmdHis}五分钟内错误数${errorCount}, 超过阈值${MAX_ALLOW_ERROR_COUNT},请注意.`)
        // 在Redis中设置报警标记，过期时间为5分钟，防止短时间内重复报警
        await redis.asyncSetex(REDIS_KEY, 5 * 60, 1)
      }
    }
    this.log(`检查完毕, 自动退出`)
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

export default WatchDog4SaaS