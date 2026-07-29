import { projectApiPath, requestData, requestResult } from './client'
import type {
  AlarmConfig,
  AlarmLog,
  AlarmTrend,
  BrowserDistribution,
  ErrorLog,
  ErrorSummary,
  ErrorTrendItem,
  KeyValue,
  LoginType,
  LoginUser,
  Member,
  NameValue,
  Pager,
  PerformanceRecord,
  Project,
  SystemDistribution,
  UserSearchItem
} from '@/types/api'

export const authApi = {
  loginType: () => requestData<LoginType>({ url: '/api/login/type', method: 'get' }),
  login: (loginType: LoginType, data: { account: string; password: string }) =>
    requestResult<unknown>({ url: `/api/login/${loginType}`, method: 'post', data }),
  register: (data: { account: string; password: string; nickname: string }) =>
    requestResult<unknown>({ url: '/api/user/register', method: 'post', data }),
  logout: () => requestResult<unknown>({ url: '/api/logout', method: 'get' }),
  user: () => requestData<LoginUser>({ url: '/api/user/detail', method: 'get' }),
  modifyMessage: (nickname: string) =>
    requestResult<unknown>({ url: '/api/user/modify/msg', method: 'post', data: { nickname } }),
  modifyPassword: (data: { oldPassword: string; password: string; confirmPassword: string }) =>
    requestResult<unknown>({ url: '/api/user/modify/password', method: 'post', data }),
  destroy: () => requestResult<unknown>({ url: '/api/user/destroy', method: 'get' }),
  searchUsers: (account: string) =>
    requestData<UserSearchItem[]>({ url: '/api/user/search', method: 'get', params: { account, st: Date.now() } })
}

export const projectApi = {
  list: () => requestData<Project[]>({ url: '/api/project/item/list', method: 'get' }),
  add: (data: { projectName: string; displayName: string; cDesc?: string; ownerUcid: string }) =>
    requestResult<unknown>({ url: '/api/project/item/add', method: 'post', data }),
  update: (data: { id: number; projectName: string; displayName: string; cDesc?: string }) =>
    requestResult<unknown>({ url: '/api/project/item/update', method: 'post', data }),
  remove: (id: number) =>
    requestResult<unknown>({ url: '/api/project/item/delete', method: 'post', data: { id } })
}

export const behaviorApi = {
  menu: (projectId: string) =>
    requestData<Array<{ menuCode: string; menuName: string; menuUrl: string; totalCount: number }>>({
      url: projectApiPath(projectId, 'behavior/menu'),
      method: 'get'
    }),
  online: (projectId: string, params: { filterBy: string; st: number; et: number }) =>
    requestData<KeyValue[]>({ url: projectApiPath(projectId, 'behavior/online'), method: 'get', params }),
  newUserLine: (projectId: string, params: Record<string, unknown>) =>
    requestData<KeyValue[]>({
      url: projectApiPath(projectId, 'project/summary/new_user/distribution_line'),
      method: 'get',
      params
    }),
  newUserMap: (projectId: string, params: { st: number; et: number; field: string }) =>
    requestData<NameValue[]>({
      url: projectApiPath(projectId, 'project/summary/new_user/distribution_map'),
      method: 'get',
      params
    })
}

export const uvApi = {
  count: (projectId: string, params: { st: number; et: number }) =>
    requestData<number>({ url: projectApiPath(projectId, 'uv/count'), method: 'get', params }),
  trend: (projectId: string, params: { st: number; et: number; filterBy: string }) =>
    requestData<KeyValue[]>({ url: projectApiPath(projectId, 'uv/trend'), method: 'get', params })
}

export const pvApi = {
  count: (projectId: string, params: { st: number; et: number }) =>
    requestData<number>({ url: projectApiPath(projectId, 'pv/count'), method: 'get', params }),
  trend: (projectId: string, params: { st: number; et: number; filterBy: string }) =>
    requestData<KeyValue[]>({ url: projectApiPath(projectId, 'pv/trend'), method: 'get', params })
}

export const errorApi = {
  summary: (projectId: string, startAt?: number, endAt?: number) =>
    requestData<ErrorSummary[]>({
      url: projectApiPath(projectId, 'error/distribution/summary'),
      method: 'get',
      params: startAt === undefined || endAt === undefined ? undefined : { start_at: startAt, end_at: endAt }
    }),
  urls: (projectId: string, params: Record<string, unknown>) =>
    requestData<NameValue[]>({
      url: projectApiPath(projectId, 'error/distribution/url'),
      method: 'get',
      params
    }),
  trend: (projectId: string, params: Record<string, unknown>) =>
    requestData<ErrorTrendItem[]>({
      url: projectApiPath(projectId, 'error/viser/area/stack_area'),
      method: 'get',
      params
    }),
  names: (projectId: string, params: Record<string, unknown>) =>
    requestData<NameValue[]>({
      url: projectApiPath(projectId, 'error/distribution/error_name'),
      method: 'get',
      params
    }),
  geography: (projectId: string, params: Record<string, unknown>) =>
    requestData<NameValue[]>({
      url: projectApiPath(projectId, 'error/distribution/geography'),
      method: 'get',
      params
    }),
  logs: (projectId: string, params: Record<string, unknown>) =>
    requestData<Pager<ErrorLog>>({
      url: projectApiPath(projectId, 'error/log/list'),
      method: 'get',
      params
    })
}

export const performanceApi = {
  urls: (projectId: string, params: { st: number; et: number; summaryBy: string }) =>
    requestData<string[]>({ url: projectApiPath(projectId, 'performance/url_list'), method: 'get', params }),
  overview: (projectId: string, params: { st: number; et: number; url: string; summaryBy: string }) =>
    requestData<Record<string, number>>({
      url: projectApiPath(projectId, 'performance/url/overview'),
      method: 'get',
      params
    }),
  line: (projectId: string, params: { st: number; et: number; url: string; summaryBy: string }) =>
    requestData<PerformanceRecord[]>({
      url: projectApiPath(projectId, 'performance/url/line_chart'),
      method: 'get',
      params
    })
}

export const alarmApi = {
  list: (projectId: string, currentPage = 1) =>
    requestData<{ currentPage: number; pageSize: number; totalCount: number; list: AlarmConfig[] }>({
      url: projectApiPath(projectId, 'alarm/config/list'),
      method: 'get',
      params: { currentPage }
    }),
  add: (projectId: string, data: Record<string, unknown>) =>
    requestResult<unknown>({ url: projectApiPath(projectId, 'alarm/config/add'), method: 'post', data }),
  update: (projectId: string, data: Record<string, unknown>) =>
    requestResult<unknown>({ url: projectApiPath(projectId, 'alarm/config/update'), method: 'post', data }),
  remove: (projectId: string, id: number) =>
    requestResult<unknown>({
      url: projectApiPath(projectId, 'alarm/config/delete'),
      method: 'get',
      params: { id }
    }),
  logs: (projectId: string, params: { st: number; et: number }) =>
    requestData<AlarmLog[]>({ url: projectApiPath(projectId, 'alarm/log'), method: 'get', params }),
  trend: (projectId: string, params: { st: number; et: number }) =>
    requestData<AlarmTrend[]>({ url: projectApiPath(projectId, 'alarm/log/line'), method: 'get', params })
}

export const systemApi = {
  os: (projectId: string, month: string) =>
    requestData<SystemDistribution[]>({ url: projectApiPath(projectId, 'os'), method: 'get', params: { month } }),
  browsers: (projectId: string, month: string) =>
    requestData<string[]>({ url: projectApiPath(projectId, 'browser/list'), method: 'get', params: { month } }),
  browserVersionsAll: (projectId: string, month: string) =>
    requestData<BrowserDistribution[]>({
      url: projectApiPath(projectId, 'browser/distribution_version'),
      method: 'get',
      params: { month }
    }),
  browserVersions: (projectId: string, month: string, q: string) =>
    requestData<KeyValue[]>({
      url: projectApiPath(projectId, 'browser'),
      method: 'get',
      params: { month, q }
    }),
  devices: (projectId: string, month: string) =>
    requestData<SystemDistribution[]>({
      url: projectApiPath(projectId, 'device'),
      method: 'get',
      params: { month }
    }),
  runtimes: (projectId: string, month: string) =>
    requestData<SystemDistribution[]>({
      url: projectApiPath(projectId, 'runtimeVersion'),
      method: 'get',
      params: { month }
    })
}

export const memberApi = {
  list: (projectId: string) =>
    requestData<Member[]>({ url: projectApiPath(projectId, 'project/member/list'), method: 'get' }),
  add: (projectId: string, data: { ucid_list: string[]; role: string }) =>
    requestResult<unknown>({ url: projectApiPath(projectId, 'project/member/add'), method: 'post', data }),
  update: (projectId: string, data: { id: number; role?: string; need_alarm?: number }) =>
    requestResult<unknown>({ url: projectApiPath(projectId, 'project/member/update'), method: 'post', data }),
  remove: (projectId: string, id: number) =>
    requestResult<unknown>({
      url: projectApiPath(projectId, 'project/member/delete'),
      method: 'get',
      params: { id }
    })
}
