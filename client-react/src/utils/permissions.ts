import type { LoginUser, Project, UserRole } from '@/types/api'

export function resolveProjectRole(user: LoginUser | null, project?: Project): UserRole {
  if (user?.role === 'admin') return 'admin'
  if (project?.role === 'owner') return 'owner'
  return 'dev'
}

export function canAccess(required: UserRole[] | undefined, actual: UserRole) {
  if (!required?.length) return true
  if (actual === 'admin') return true
  return required.includes(actual)
}

export function chooseDefaultProject(projects: Project[], recentProjectId?: string | null) {
  if (!projects.length) return null
  const recent = projects.find(project => String(project.id) === String(recentProjectId))
  return recent || projects[0] || null
}

