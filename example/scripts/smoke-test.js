'use strict'

const http = require('http')
const { createExampleServer, loadConfig } = require('./server')

function request (port, method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method,
      path
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8')
        })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function makeRecord (type, code, detail, extra) {
  return {
    type,
    code,
    detail,
    extra: extra || {},
    common: {
      pid: 'template',
      uuid: 'smoke-test-uuid',
      ucid: 'smoke-test-user',
      is_test: false,
      version: '1.0.0-smoke',
      timestamp: Date.now(),
      runtime_version: '1.0.0-smoke',
      sdk_version: 'smoke',
      page_type: 'example/smoke-test',
      record: {
        time_on_page: true,
        performance: true,
        js_error: true
      }
    }
  }
}

async function main () {
  const config = loadConfig()
  const server = createExampleServer({
    ...config,
    host: '127.0.0.1',
    port: 0,
    writeServerKafkaLog: false
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port

  try {
    await request(port, 'POST', '/api/clear')

    const records = [
      makeRecord('error', 8, {
        error_no: 'SmokeTest主动错误',
        url: 'example/smoke-test',
        http_code: 500,
        during_ms: 120,
        request_size_b: 64,
        response_size_b: 256
      }, { trace_id: 'smoke-error' }),
      makeRecord('product', 10002, {
        code: 'SMOKE_CLICK',
        name: '冒烟测试点击',
        url: 'example/smoke-test'
      }),
      makeRecord('product', 10001, {
        duration_ms: 6000
      }),
      makeRecord('perf', 20001, {
        url: 'example/smoke-test',
        fetchStart: 1000,
        domainLookupStart: 1010,
        domainLookupEnd: 1020,
        connectStart: 1020,
        secureConnectionStart: 1021,
        connectEnd: 1040,
        requestStart: 1050,
        responseStart: 1110,
        responseEnd: 1140,
        domInteractive: 1220,
        domContentLoadedEventEnd: 1300,
        loadEventStart: 1400
      }),
      makeRecord('info', 20010, {
        url: 'example/smoke-test',
        metric: 'resource',
        duration_ms: 33
      })
    ]

    for (const record of records) {
      const encoded = encodeURIComponent(JSON.stringify(record))
      const res = await request(port, 'GET', `/dig?d=${encoded}`)
      if (res.statusCode !== 200) {
        throw new Error(`/dig 返回状态异常: ${res.statusCode}`)
      }
    }

    const res = await request(port, 'GET', '/api/records?limit=20')
    const payload = JSON.parse(res.body)
    const summary = payload.summary

    if (summary.total < records.length) {
      throw new Error(`记录数量不足，期望至少 ${records.length}，实际 ${summary.total}`)
    }
    for (const type of ['error', 'product', 'perf', 'info']) {
      if (!summary.byType[type]) {
        throw new Error(`缺少 ${type} 类型记录`)
      }
    }

    console.log('example smoke test passed')
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    server.close()
  }
}

main().catch((err) => {
  console.error(err.stack || err.message)
  process.exit(1)
})
