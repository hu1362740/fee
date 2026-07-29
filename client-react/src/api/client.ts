import axios, { type AxiosRequestConfig } from 'axios'
import Cookies from 'js-cookie'
import type { ApiResponse } from '@/types/api'
import { emitUiEvent } from '@/lib/uiEvents'

export class ApiBusinessError extends Error {
  constructor(
    message: string,
    public readonly response: ApiResponse<unknown>
  ) {
    super(message)
    this.name = 'ApiBusinessError'
  }
}

export interface ApiActionHandlers {
  alert: (message: string) => void
  login: (message: string) => void
  forbitan: (message: string) => void
  redirect: (url: string) => void
}

const browserHandlers: ApiActionHandlers = {
  alert: content => emitUiEvent({ type: 'error', content }),
  login: () => {
    Cookies.remove('fee_token')
    emitUiEvent({ type: 'error', content: '登录状态已失效，请重新登录' })
    if (window.location.pathname !== '/login') window.location.assign('/login')
  },
  forbitan: content => {
    emitUiEvent({ type: 'error', content })
    if (window.location.pathname !== '/401') window.location.assign('/401')
  },
  redirect: url => {
    const target = new URL(url, window.location.origin)
    if (target.origin === window.location.origin) {
      window.location.assign(`${target.pathname}${target.search}${target.hash}`)
    }
  }
}

export function interpretApiResponse<T>(
  payload: ApiResponse<T>,
  handlers: ApiActionHandlers = browserHandlers
): ApiResponse<T> {
  if (!payload || typeof payload.action !== 'string') {
    throw new Error('服务响应格式不正确')
  }
  if (payload.action === 'success') return payload

  const content = payload.msg || '请求处理失败'
  if (payload.action === 'login') handlers.login(content)
  else if (payload.action === 'forbitan') handlers.forbitan(content)
  else if (payload.action === 'redirect' && payload.url) handlers.redirect(payload.url)
  else handlers.alert(content)
  throw new ApiBusinessError(content, payload as ApiResponse<unknown>)
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json; charset=utf-8'
  }
})

http.interceptors.request.use(config => {
  config.headers['X-URL-PATH'] = window.location.pathname
  const token = Cookies.get('fee_token')
  if (token && !config.url?.includes('/api/login') && !config.url?.includes('/api/user/register')) {
    config.headers['x-access-token'] = token
  }
  return config
})

http.interceptors.response.use(
  response => {
    interpretApiResponse(response.data as ApiResponse<unknown>)
    return response
  },
  error => {
    emitUiEvent({ type: 'error', content: '服务暂时不可用，请稍后重试' })
    return Promise.reject(error)
  }
)

export async function requestResult<T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
  const response = await http.request<ApiResponse<T>>(config)
  return response.data
}

export async function requestData<T>(config: AxiosRequestConfig): Promise<T> {
  const result = await requestResult<T>(config)
  return result.data
}

export function projectApiPath(projectId: string | number, path: string) {
  const cleanPath = path.replace(/^\/+/, '')
  return `/project/${projectId}/api/${cleanPath}`
}
