import Base from '~/src/commands/base'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'
import commonConfig from '~/src/configs/common'

/**
 * Utils:SplitLog 命令
 * 功能：Windows 下定时分割 Nginx 日志文件
 * 将 fee-access.log 按分钟分割到 fee-access/YYYY/MM/DD/HH/mm/log
 * 
 * 仅在 Windows 系统上执行，Linux 系统跳过（Linux 使用 logrotate）
 */
class SplitLog extends Base {
  static get signature() {
    return `
     Utils:SplitLog
     `
  }

  static get description() {
    return '[Windows 专用] 定时分割 Nginx 日志文件，按分钟分割到目录结构'
  }

  async execute(args, options) {
    // 仅在 Windows 系统上执行
    if (os.platform() !== 'win32') {
      this.log('[跳过] 当前系统不是 Windows，Linux 使用 logrotate 处理日志分割')
      return
    }

    try {
      // 读取 Nginx 日志根目录（与 SaveLog:Nginx 保持一致）
      const nginxLogRoot = commonConfig.nginxLogFilePath
      const srcLogFile = path.join(nginxLogRoot, 'fee-access.log')
      const outRoot = path.join(nginxLogRoot, 'fee-access')

      if (!fs.existsSync(srcLogFile)) {
        this.log(`[分割] 源日志不存在，跳过: ${srcLogFile}`)
        return
      }

      // 读取内容
      const content = await fsp.readFile(srcLogFile, { encoding: 'utf8' })
      if (!content || content.length === 0) {
        this.log('[分割] 源日志为空，跳过')
        return
      }

      const lines = content.split(/\r?\n/).filter(Boolean)
      let processed = 0
      let skipped = 0
      const grouped = new Map() // key: YYYY/MM/DD/HH/mm => string[]

      const tsRe = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/
      for (const line of lines) {
        const m = tsRe.exec(line)
        if (!m) {
          skipped++
          continue
        }
        const key = `${m[1]}/${m[2]}/${m[3]}/${m[4]}/${m[5]}`
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key).push(line)
        processed++
      }

      this.log(`[分割] 读取 ${lines.length} 行，匹配 ${processed} 行，跳过 ${skipped} 行`)

      let written = 0
      for (const [key, arr] of grouped.entries()) {
        const dir = path.join(outRoot, ...key.split('/'))
        const file = path.join(dir, 'log')
        await fsp.mkdir(dir, { recursive: true })
        await fsp.appendFile(file, arr.join('\n') + '\n', { encoding: 'utf8' })
        written += arr.length
      }

      this.log(`[分割] 完成：写入 ${written} 行到 ${grouped.size} 个分钟分片`) 
    } catch (error) {
      this.log(`[分割] 发生错误: ${error.message}`)
    }
  }
}

export default SplitLog
