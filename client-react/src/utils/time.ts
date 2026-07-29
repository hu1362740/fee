import dayjs, { type Dayjs } from 'dayjs'
import type { FilterBy } from '@/types/api'

export interface TimeRangeValue {
  range: [Dayjs, Dayjs]
  startMs: number
  endMs: number
  filterBy: FilterBy
}

export function todayRange(): [Dayjs, Dayjs] {
  return [dayjs().startOf('day'), dayjs().endOf('day')]
}

export function rangeToValue(range: [Dayjs, Dayjs], filterBy: FilterBy): TimeRangeValue {
  return {
    range,
    startMs: range[0].startOf('day').valueOf(),
    endMs: range[1].endOf('day').valueOf(),
    filterBy
  }
}

export function millisecondsToText(value: number) {
  const seconds = Math.max(Math.floor(Number(value || 0) / 1000), 0)
  if (seconds < 60) return `${seconds}秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟${seconds % 60}秒`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainSeconds = seconds % 60
  return `${hours}小时${minutes}分钟${remainSeconds}秒`
}

export function secondsRange(startMs: number, endMs: number) {
  return {
    startAt: Math.floor(startMs / 1000),
    endAt: Math.floor(endMs / 1000)
  }
}

