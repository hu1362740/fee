import { describe, expect, it, vi } from 'vitest'
import { ApiBusinessError, interpretApiResponse, projectApiPath, type ApiActionHandlers } from '@/api/client'
import type { ApiAction, ApiResponse } from '@/types/api'

function response(action: ApiAction, overrides: Partial<ApiResponse<{ ok: boolean }>> = {}): ApiResponse<{ ok: boolean }> {
  return {
    code: 0,
    action,
    data: { ok: true },
    msg: `${action} message`,
    url: '/project/1/home',
    ...overrides
  }
}

describe('API action 处理', () => {
  const makeHandlers = () => ({
    alert: vi.fn(),
    login: vi.fn(),
    forbitan: vi.fn(),
    redirect: vi.fn()
  } satisfies ApiActionHandlers)

  it('success 返回强类型响应', () => {
    const handlers = makeHandlers()
    expect(interpretApiResponse(response('success'), handlers).data.ok).toBe(true)
    expect(handlers.alert).not.toHaveBeenCalled()
  })

  it.each([
    ['alert', 'alert'],
    ['login', 'login'],
    ['forbitan', 'forbitan'],
    ['redirect', 'redirect']
  ] as const)('%s 调用对应处理器并抛出业务错误', (action, handler) => {
    const handlers = makeHandlers()
    expect(() => interpretApiResponse(response(action), handlers)).toThrow(ApiBusinessError)
    expect(handlers[handler]).toHaveBeenCalledTimes(1)
  })

  it('拼装项目 API 路径时清理多余斜线', () => {
    expect(projectApiPath(18, '/uv/count')).toBe('/project/18/api/uv/count')
  })
})
