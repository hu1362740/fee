import type { FilterBy } from '@/types/api'

export function millisecondQuery(startMs: number, endMs: number, filterBy?: FilterBy) {
  return {
    st: startMs,
    et: endMs,
    ...(filterBy ? { filterBy } : {})
  }
}

export function errorSecondQuery(startMs: number, endMs: number) {
  return {
    start_at: Math.floor(startMs / 1000),
    end_at: Math.floor(endMs / 1000)
  }
}

export function alarmTimeQueries(startMs: number, endMs: number) {
  return {
    list: { st: startMs, et: endMs },
    trend: { st: Math.floor(startMs / 1000), et: Math.floor(endMs / 1000) }
  }
}
