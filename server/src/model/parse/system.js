const BaseTableName = 't_o_system_collection'

/**
 * 获取系统采集表名
 * 按ID分表，格式为: t_o_system_collection_{id}
 * @param {number|string} id 通常是projectId
 * @return {String}
 */
function getTableName (id) {
  return `${BaseTableName}_${id}`
}

export default {
  getTableName
}