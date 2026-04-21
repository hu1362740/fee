import Base from '~/src/commands/base'
import _ from 'lodash'
import MProject from '~/src/model/project/project'
import MErrorSummary from '~/src/model/summary/error_summary'
import moment from 'moment'
import DATE_FORMAT from '~/src/constants/date_format'

/**
 * 缓存更新命令：每10分钟执行一次
 * 主要职责：遍历所有项目，主动触发错误名称分布数据的Redis缓存更新
 */
class CreateCacheUpdatePerTenMinute extends Base {
  // 定义命令行签名，用于通过 `npm run fee_test CreateCache:UpdatePerOneMinute` 调用
  static get signature () {
    return `
      CreateCache:UpdatePerOneMinute
     `
  }

  // 命令描述，说明执行频率和目的
  static get description () {
    return '[每10分钟执行一次] 主动调用方法, 更新Redis缓存, 每10分钟更新一次'
  }

  /**
   * 命令执行入口
   * @param {Object} args - 命令行参数
   * @param {Object} options - 命令行选项
   */
  async execute (args, options) {
    await this.updateErrorNameDistributionCache()
  }

  /**
   * 更新错误名称分布数据缓存
   * 逻辑：
   * 1. 获取所有项目列表
   * 2. 遍历每个项目，计算最近7天的时间范围
   * 3. 调用 Model 层方法，强制更新 Redis 中的错误分布缓存
   */
  async updateErrorNameDistributionCache () {
    this.log('更新错误分布数据缓存')
    // 获取所有需要监控的项目列表
    let projectList = await MProject.getList()
    for (let project of projectList) {
      // 安全获取项目ID，默认为0
      let projectId = _.get(project, ['id'], 0)
      // 计算时间范围：从7天前的0点开始，到今天结束
      let startAt = moment().subtract(7, DATE_FORMAT.UNIT.DAY).startOf(DATE_FORMAT.UNIT.DAY).unix()
      let endAt = moment().endOf(DATE_FORMAT.UNIT.DAY).unix()
      // 调用模型层方法，forceUpdate=true 表示强制刷新缓存，确保数据最新
      let result = await MErrorSummary.getErrorNameDistributionByTimeWithCache(projectId, startAt, endAt, true)
      this.log(`projectId => ${projectId} , startAt => ${startAt}, endAt => ${endAt}, result =>`, result)
    }
    this.log('错误分布缓存更新完毕')
  }
}

export default CreateCacheUpdatePerTenMinute