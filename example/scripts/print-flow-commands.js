'use strict'

function pad2 (value) {
  return String(value).padStart(2, '0')
}

function formatCommandMinute (date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function formatCommandHour (date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}`
}

const now = new Date()
const start = new Date(now.getTime() - 15 * 60 * 1000)
const startMinute = formatCommandMinute(start)
const endMinute = formatCommandMinute(now)
const currentHour = formatCommandHour(now)

console.log('在 example 页面产生打点后，可在 server 目录执行以下命令验证入库：')
console.log('')
console.log('cd ..\\server')
console.log(`npm run fee Parse:Monitor "${startMinute}" "${endMinute}"`)
console.log(`npm run fee Parse:Performance "${startMinute}" "${endMinute}"`)
console.log(`npm run fee Parse:UV "${startMinute}" "${endMinute}"`)
console.log(`npm run fee Parse:MenuClick "${startMinute}" "${endMinute}"`)
console.log(`npm run fee Parse:TimeOnSiteByHour "${startMinute}" "${endMinute}"`)
console.log(`npm run fee Parse:Device "${startMinute}" "${endMinute}"`)
console.log(`npm run fee Parse:UserFirstLoginAt "${startMinute}" "${endMinute}"`)
console.log(`npm run fee Summary:Error "${endMinute}" minute`)
console.log(`npm run fee Summary:Performance "${currentHour}" hour`)
console.log(`npm run fee Summary:UV "${currentHour}" hour`)
console.log(`npm run fee Summary:PV "${currentHour}" hour`)
console.log('')
console.log('提示：如果当前 server/package.json 中 fee 脚本尚未完全跨平台，请在 Windows 下使用 fee_test 或先改成 cross-env。')
