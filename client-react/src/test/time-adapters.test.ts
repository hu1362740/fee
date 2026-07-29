import { describe, expect, it } from 'vitest'
import { alarmTimeQueries, errorSecondQuery, millisecondQuery } from '@/utils/apiAdapters'
import { millisecondsToText } from '@/utils/time'

describe('接口时间适配', () => {
  it('错误看板转换为秒并向下取整', () => {
    expect(errorSecondQuery(1_234, 9_999)).toEqual({ start_at: 1, end_at: 9 })
  })

  it('行为与性能接口保持毫秒', () => {
    expect(millisecondQuery(1_234, 9_999, 'hour')).toEqual({ st: 1_234, et: 9_999, filterBy: 'hour' })
  })

  it('报警列表使用毫秒，趋势使用秒', () => {
    expect(alarmTimeQueries(1_234, 9_999)).toEqual({
      list: { st: 1_234, et: 9_999 },
      trend: { st: 1, et: 9 }
    })
  })

  it('在线时长格式化为易读文本', () => {
    expect(millisecondsToText(3_661_000)).toBe('1小时1分钟1秒')
  })
})
