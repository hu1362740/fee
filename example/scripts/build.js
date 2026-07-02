'use strict'

const fs = require('fs')
const path = require('path')
const { findLatestSdkBundle, loadConfig } = require('./server')

const exampleRoot = path.resolve(__dirname, '..')
const requiredFiles = [
  'package.json',
  'config/default.json',
  'public/index.html',
  'src/main.js',
  'src/styles.css',
  'scripts/server.js',
  'scripts/smoke-test.js',
  'README.md'
]

let hasError = false
for (const relativePath of requiredFiles) {
  const fullPath = path.join(exampleRoot, relativePath)
  if (!fs.existsSync(fullPath)) {
    hasError = true
    console.error(`[missing] ${relativePath}`)
  }
}

const sdkBundle = findLatestSdkBundle()
if (!sdkBundle) {
  hasError = true
  console.error('[missing] sdk/dist/js/**/index.js')
  console.error('请先在仓库根目录执行：cd sdk && npm run build')
}

const config = loadConfig()
console.log('example build check')
console.log(`projectPid: ${config.projectPid}`)
console.log(`projectId: ${config.projectId}`)
console.log(`sdkBundle: ${sdkBundle || '-'}`)

if (hasError) {
  process.exit(1)
}

console.log('检查通过，example 子项目可直接通过 npm start 运行。')
