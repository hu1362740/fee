export type ApiAction = 'success' | 'alert' | 'redirect' | 'login' | 'forbitan'
export type UserRole = 'admin' | 'owner' | 'dev'
export type LoginType = 'normal' | 'uc'
export type FilterBy = 'minute' | 'hour' | 'day' | 'week' | 'month'

export interface ApiResponse<T> {
  code: number
  action: ApiAction
  data: T
  msg: string
  url: string
}

export interface LoginUser {
  ucid: string
  account: string
  nickname: string
  email?: string
  mobile?: string
  avatar_url?: string
  register_type: 'site' | 'uc' | string
  role: UserRole
}

export interface Project {
  id: number
  project_name: string
  display_name: string
  c_desc?: string
  rate?: number
  role: Exclude<UserRole, 'admin'>
  need_alarm?: number
}

export interface Member {
  id: number
  ucid: string
  nickname: string
  role: Exclude<UserRole, 'admin'>
  need_alarm: number
}

export interface UserSearchItem {
  ucid: string
  account: string
  nickname?: string
}

export interface KeyValue {
  key: string
  value: number
  index_timestamp_ms?: number
}

export interface NameValue {
  name: string
  value: number
}

export interface ErrorSummary {
  error_name: string
  error_count: number
}

export interface ErrorTrendItem extends NameValue {
  index: number | string
  index_display: string
}

export interface ErrorLog {
  id?: number
  log_at: number
  error_name: string
  url: string
  http_code?: number
  province?: string
  city?: string
  ext?: Record<string, unknown>
  [key: string]: unknown
}

export interface Pager<T> {
  pager: {
    current_page: number | string
    page_size: number
    total: number
  }
  list: T[]
}

export interface AlarmConfig {
  id: number
  error_name: string
  time_range_s: number
  max_error_count: number
  alarm_interval_s: number
  is_enable: number
  create_ucid?: string
  update_ucid?: string
  note?: string
}

export interface AlarmLog {
  id?: number
  config_id: number
  error_name: string
  message: string
  send_at: number
}

export interface AlarmTrend extends NameValue {
  index: string
}

export interface SystemDistribution {
  type: string
  key?: string
  value: number
}

export interface BrowserDistribution {
  browser: string
  version: string
  total_count: number
}

export interface PerformanceRecord {
  index?: string
  index_timestamp_ms: number
  [indicator: string]: string | number | undefined
}

