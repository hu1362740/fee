import Base from '~/src/commands/base'
import moment from 'moment'
import MSystemRuntimeVersion from '~/src/model/summary/system_runtime_version'
import DATE_FORMAT from '~/src/constants/date_format'

/**
 * SystemRuntimeVersionSummary 类
 * 继承自 Base，用于按月统计各项目的运行时版本 (Runtime Version) 分布情况
 * 主要功能：调用 Model 层方法，基于 t_o_system_collection 表数据进行聚合统计
 */
class SystemRuntimeVersionSummary extends Base {
  static get signature () {
    return `
     Summary:SystemRuntimeVersion
     {sumaryAtTime:按月统计浏览器分布情况${DATE_FORMAT.COMMAND_ARGUMENT_BY_MONTH}格式}
     {countType:日志统计格式, ${DATE_FORMAT.UNIT.MONTH}}
     `
  }

  static get description () {
    return '[按月] 基于数据库统计浏览器占比'
  }

  /**
   * 执行运行时版本统计任务
   * 1. 校验参数 (仅支持按月统计)
   * 2. 调用 Model 层进行数据统计
   * @param {*} args
   * @param {*} options
   */
  async execute (args, options) {
    // 按月统计, 每天都跑
    let { sumaryAtTime, countType } = args
    if (this.isArgumentsLegal(args, options) === false) {
      this.warn('参数不正确, 自动退出')
      return false
    }
    let sumaryAt = moment(sumaryAtTime, DATE_FORMAT.COMMAND_ARGUMENT_BY_UNIT[countType]).unix()
    MSystemRuntimeVersion.sumarySystemRuntimeVersion(sumaryAt)
  }

  /**
   * [可覆盖]检查请求参数, 默认检查传入的时间范围是否正确, 如果有自定义需求可以在子类中进行覆盖
   * @param {*} args
   * @param {*} options
   * @return {Boolean}
   */
  isArgumentsLegal (args, options) {
    let { sumaryAtTime, countType } = args
    let sumaryAtMoment = moment(sumaryAtTime, DATE_FORMAT.COMMAND_ARGUMENT_BY_UNIT[countType])
    if (
      moment.isMoment(sumaryAtMoment) === false ||
      sumaryAtMoment.isValid() === false ||
      countType !== DATE_FORMAT.UNIT.MONTH
    ) {
      this.warn(`参数不正确 sumaryAtTime => ${sumaryAtTime}, countType => ${countType}`)
      return false
    }
    return true
  }
}

export default SystemRuntimeVersionSummary