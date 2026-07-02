'use strict'

const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { URL } = require('url')

const exampleRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(exampleRoot, '..')
const publicRoot = path.join(exampleRoot, 'public')
const srcRoot = path.join(exampleRoot, 'src')
const configPath = path.join(exampleRoot, 'config', 'default.json')
const tinyGif = Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64')

function loadConfig () {
  const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  return {
    ...rawConfig,
    port: Number(process.env.EXAMPLE_PORT || rawConfig.port),
    host: process.env.EXAMPLE_HOST || rawConfig.host,
    projectPid: process.env.EXAMPLE_PROJECT_PID || rawConfig.projectPid,
    projectId: Number(process.env.EXAMPLE_PROJECT_ID || rawConfig.projectId),
    writeServerKafkaLog: process.env.EXAMPLE_WRITE_SERVER_KAFKA_LOG
      ? process.env.EXAMPLE_WRITE_SERVER_KAFKA_LOG === '1'
      : rawConfig.writeServerKafkaLog
  }
}

function ensureDir (dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function pad2 (value) {
  return String(value).padStart(2, '0')
}

function getDateParts (date) {
  return {
    year: String(date.getFullYear()),
    month: pad2(date.getMonth() + 1),
    day: pad2(date.getDate()),
    hour: pad2(date.getHours()),
    minute: pad2(date.getMinutes())
  }
}

function toIsoWithTimezone (date) {
  const timezoneOffset = -date.getTimezoneOffset()
  const sign = timezoneOffset >= 0 ? '+' : '-'
  const absOffset = Math.abs(timezoneOffset)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}${sign}${pad2(Math.floor(absOffset / 60))}:${pad2(absOffset % 60)}`
}

function findLatestSdkBundle () {
  const sdkDistRoot = path.join(repoRoot, 'sdk', 'dist', 'js')
  const candidates = []

  function walk (dir) {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile() && entry.name === 'index.js') {
        candidates.push({
          path: fullPath,
          mtimeMs: fs.statSync(fullPath).mtimeMs
        })
      }
    }
  }

  walk(sdkDistRoot)
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates[0] ? candidates[0].path : ''
}

function getContentType (filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif'
  }
  return map[ext] || 'application/octet-stream'
}

function sendJson (res, statusCode, data) {
  const body = JSON.stringify(data, null, 2)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  })
  res.end(body)
}

function sendFile (res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
    return
  }
  res.writeHead(200, {
    'Content-Type': getContentType(filePath),
    'Cache-Control': 'no-store'
  })
  fs.createReadStream(filePath).pipe(res)
}

function parseUserAgent (userAgent) {
  const lower = userAgent.toLowerCase()
  const browser = lower.includes('edg/')
    ? 'Edge'
    : lower.includes('chrome/')
      ? 'Chrome'
      : lower.includes('firefox/')
        ? 'Firefox'
        : lower.includes('safari/')
          ? 'Safari'
          : 'Unknown'
  const os = lower.includes('windows')
    ? 'Windows'
    : lower.includes('mac os')
      ? 'Mac OS'
      : lower.includes('android')
        ? 'Android'
        : lower.includes('iphone') || lower.includes('ipad')
          ? 'iOS'
          : 'Unknown'

  return {
    ua: userAgent,
    browser: { name: browser, version: '', major: '' },
    engine: { name: '', version: '' },
    os: { name: os, version: '' },
    device: { vendor: '', model: '', type: '' },
    cpu: { architecture: '' }
  }
}

function buildNginxLikeLine ({ record, req, receivedAt, requestUrl }) {
  const remoteAddress = req.socket.remoteAddress || '127.0.0.1'
  const userAgent = req.headers['user-agent'] || ''
  const referer = req.headers.referer || ''
  const fields = new Array(18).fill('-')

  fields[0] = toIsoWithTimezone(receivedAt)
  fields[1] = 'fee-example'
  fields[2] = 'collector'
  fields[3] = remoteAddress
  fields[4] = remoteAddress
  fields[5] = 'GET'
  fields[6] = '/dig'
  fields[7] = '200'
  fields[8] = '43'
  fields[9] = referer
  fields[10] = '-'
  fields[11] = '-'
  fields[12] = '-'
  fields[13] = '-'
  fields[14] = '-'
  fields[15] = requestUrl || `/dig?d=${encodeURIComponent(JSON.stringify(record))}`
  fields[16] = '-'
  fields[17] = encodeURIComponent(userAgent)

  return fields.join('\t')
}

function normalizeRecord ({ config, record, rawLine, req, receivedAt }) {
  const remoteAddress = req.socket.remoteAddress || '127.0.0.1'
  const userAgent = req.headers['user-agent'] || ''
  const location = config.defaultLocation || {}
  const common = record.common || {}
  const logAt = Math.floor(receivedAt.getTime() / 1000)

  return {
    ...record,
    common,
    md5: crypto.createHash('md5').update(rawLine).digest('hex'),
    project_id: Number(config.projectId),
    project_name: common.pid || config.projectPid,
    time: logAt,
    ua: parseUserAgent(userAgent),
    ip: remoteAddress,
    country: location.country || '',
    province: location.province || '',
    city: location.city || ''
  }
}

function appendLine (filePath, line) {
  ensureDir(path.dirname(filePath))
  fs.appendFileSync(filePath, `${line}\n`, 'utf8')
}

function getKafkaLogFile (config, logType, date) {
  const parts = getDateParts(date)
  return path.resolve(
    exampleRoot,
    config.serverKafkaLogRoot,
    logType,
    `month_${parts.year}${parts.month}`,
    `day_${parts.day}`,
    parts.hour,
    `${parts.minute}.log`
  )
}

function getLocalNginxLogFile () {
  return path.join(exampleRoot, 'logs', 'nginx', 'fee-access.log')
}

function getLocalRecordLogFile () {
  return path.join(exampleRoot, 'logs', 'records.jsonl')
}

function readRecentRecords (limit) {
  const logFile = getLocalRecordLogFile()
  if (!fs.existsSync(logFile)) return []
  const lines = fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean)
  return lines.slice(-limit).map((line) => {
    try {
      return JSON.parse(line)
    } catch (err) {
      return { parseError: err.message, line }
    }
  })
}

function summarizeRecords (records) {
  return records.reduce((summary, record) => {
    const type = record.type || 'unknown'
    const code = String(record.code || 'unknown')
    summary.total += 1
    summary.byType[type] = (summary.byType[type] || 0) + 1
    summary.byCode[code] = (summary.byCode[code] || 0) + 1
    return summary
  }, { total: 0, byType: {}, byCode: {} })
}

function collectRecord ({ config, req, res, parsedUrl }) {
  const encodedRecord = parsedUrl.searchParams.get('d')
  if (!encodedRecord) {
    sendJson(res, 400, { ok: false, message: '缺少 d 参数' })
    return
  }

  let record
  try {
    record = JSON.parse(encodedRecord)
  } catch (err) {
    sendJson(res, 400, { ok: false, message: `d 参数不是合法 JSON: ${err.message}` })
    return
  }

  const receivedAt = new Date()
  const requestUrl = `/dig?d=${encodeURIComponent(JSON.stringify(record))}`
  const rawLine = buildNginxLikeLine({ record, req, receivedAt, requestUrl })
  const normalizedRecord = normalizeRecord({ config, record, rawLine, req, receivedAt })

  appendLine(getLocalNginxLogFile(), rawLine)
  appendLine(getLocalRecordLogFile(), JSON.stringify(normalizedRecord))

  if (config.writeServerKafkaLog) {
    appendLine(getKafkaLogFile(config, 'raw', receivedAt), rawLine)
    appendLine(getKafkaLogFile(config, 'json', receivedAt), JSON.stringify(normalizedRecord))
  }

  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(tinyGif)
}

function clearLogs () {
  for (const dir of [
    path.join(exampleRoot, 'logs')
  ]) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
}

function createExampleServer (config = loadConfig()) {
  const sdkBundle = findLatestSdkBundle()

  return http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || `${config.host}:${config.port}`}`)
    const pathname = parsedUrl.pathname

    if (pathname === config.collectorPath) {
      collectRecord({ config, req, res, parsedUrl })
      return
    }

    if (pathname === '/api/config') {
      sendJson(res, 200, {
        projectId: config.projectId,
        projectPid: config.projectPid,
        projectName: config.projectName,
        collectorPath: config.collectorPath,
        sdkTarget: config.sdkTarget,
        writeServerKafkaLog: config.writeServerKafkaLog,
        defaultUser: config.defaultUser,
        sdkBundle: sdkBundle ? path.relative(repoRoot, sdkBundle) : ''
      })
      return
    }

    if (pathname === '/api/records') {
      const limit = Number(parsedUrl.searchParams.get('limit') || 50)
      const records = readRecentRecords(limit)
      sendJson(res, 200, {
        summary: summarizeRecords(records),
        records
      })
      return
    }

    if (pathname === '/api/clear' && req.method === 'POST') {
      clearLogs()
      sendJson(res, 200, { ok: true })
      return
    }

    if (pathname === '/sdk/index.js') {
      if (!sdkBundle) {
        sendJson(res, 500, {
          ok: false,
          message: '未找到 sdk/dist/js/**/index.js，请先在仓库根目录执行：cd sdk && npm run build'
        })
        return
      }
      sendFile(res, sdkBundle)
      return
    }

    if (pathname === '/' || pathname === '/index.html') {
      sendFile(res, path.join(publicRoot, 'index.html'))
      return
    }

    if (pathname === '/sdk-bridge.js') {
      sendFile(res, path.join(publicRoot, 'sdk-bridge.js'))
      return
    }

    if (pathname === '/src/main.js') {
      sendFile(res, path.join(srcRoot, 'main.js'))
      return
    }

    if (pathname === '/src/styles.css') {
      sendFile(res, path.join(srcRoot, 'styles.css'))
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found')
  })
}

function start () {
  const config = loadConfig()
  const server = createExampleServer(config)
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`端口已被占用：${config.host}:${config.port}`)
      console.error('处理方式 1：关闭占用该端口的旧 example 进程后重试。')
      console.error('PowerShell 查询命令：Get-NetTCPConnection -LocalPort 8090 | Select-Object OwningProcess')
      console.error('PowerShell 停止命令：Stop-Process -Id <OwningProcess> -Force')
      console.error('处理方式 2：换一个端口启动，例如：$env:EXAMPLE_PORT=8091; npm start')
      process.exit(1)
    }
    throw err
  })
  server.listen(config.port, config.host, () => {
    console.log(`Fee SDK example is running at http://${config.host}:${config.port}`)
    console.log(`collector: http://${config.host}:${config.port}${config.collectorPath}`)
    console.log(`project pid: ${config.projectPid}, project id: ${config.projectId}`)
  })
}

if (require.main === module) {
  start()
}

module.exports = {
  createExampleServer,
  loadConfig,
  findLatestSdkBundle,
  readRecentRecords,
  summarizeRecords
}
