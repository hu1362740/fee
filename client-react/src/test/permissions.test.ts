import { describe, expect, it } from 'vitest'
import { canAccess, chooseDefaultProject, resolveProjectRole } from '@/utils/permissions'
import type { LoginUser, Project } from '@/types/api'

const projects: Project[] = [
  { id: 1, project_name: 'one', display_name: '一号', role: 'dev' },
  { id: 2, project_name: 'two', display_name: '二号', role: 'owner' }
]

describe('项目与权限', () => {
  it('恢复仍可访问的最近项目，否则选择第一个项目', () => {
    expect(chooseDefaultProject(projects, '2')?.id).toBe(2)
    expect(chooseDefaultProject(projects, '99')?.id).toBe(1)
    expect(chooseDefaultProject([], '1')).toBeNull()
  })

  it('admin 拥有全部权限，owner 不能访问 admin 页面', () => {
    expect(canAccess(['admin'], 'admin')).toBe(true)
    expect(canAccess(['admin', 'owner'], 'owner')).toBe(true)
    expect(canAccess(['admin'], 'owner')).toBe(false)
    expect(canAccess(['admin', 'owner'], 'dev')).toBe(false)
  })

  it('全局 admin 优先，否则使用项目角色', () => {
    const admin = { role: 'admin' } as LoginUser
    const normal = { role: 'dev' } as LoginUser
    expect(resolveProjectRole(admin, projects[0])).toBe('admin')
    expect(resolveProjectRole(normal, projects[1])).toBe('owner')
    expect(resolveProjectRole(normal, projects[0])).toBe('dev')
  })
})
