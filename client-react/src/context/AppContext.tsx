import Cookies from 'js-cookie'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type PropsWithChildren
} from 'react'
import { authApi, projectApi } from '@/api'
import type { LoginUser, Project, UserRole } from '@/types/api'
import { chooseDefaultProject, resolveProjectRole } from '@/utils/permissions'

export interface OpenTab {
  key: string
  title: string
  path: string
}

interface AppState {
  ready: boolean
  user: LoginUser | null
  projects: Project[]
  currentProjectId: string | null
  collapsed: boolean
  mobileMenuOpen: boolean
  tabsByProject: Record<string, OpenTab[]>
}

type Action =
  | { type: 'SESSION'; user: LoginUser | null; projects: Project[]; currentProjectId: string | null }
  | { type: 'READY' }
  | { type: 'PROJECT'; projectId: string }
  | { type: 'COLLAPSED'; value: boolean }
  | { type: 'MOBILE_MENU'; value: boolean }
  | { type: 'TABS'; projectId: string; tabs: OpenTab[] }
  | { type: 'RESET' }

const initialState: AppState = {
  ready: false,
  user: null,
  projects: [],
  currentProjectId: null,
  collapsed: false,
  mobileMenuOpen: false,
  tabsByProject: {}
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SESSION':
      return {
        ...state,
        ready: true,
        user: action.user,
        projects: action.projects,
        currentProjectId: action.currentProjectId
      }
    case 'READY':
      return { ...state, ready: true }
    case 'PROJECT':
      return { ...state, currentProjectId: action.projectId, mobileMenuOpen: false }
    case 'COLLAPSED':
      return { ...state, collapsed: action.value }
    case 'MOBILE_MENU':
      return { ...state, mobileMenuOpen: action.value }
    case 'TABS':
      return {
        ...state,
        tabsByProject: { ...state.tabsByProject, [action.projectId]: action.tabs }
      }
    case 'RESET':
      return { ...initialState, ready: true }
  }
}

interface AppContextValue extends AppState {
  currentProject?: Project
  role: UserRole
  refreshSession: () => Promise<Project | null>
  clearSession: () => Promise<void>
  setCurrentProject: (projectId: string) => void
  setCollapsed: (value: boolean) => void
  setMobileMenuOpen: (value: boolean) => void
  addTab: (projectId: string, tab: OpenTab) => void
  setTabs: (projectId: string, tabs: OpenTab[]) => void
}

const AppContext = createContext<AppContextValue | null>(null)

function readStoredTabs(projectId: string): OpenTab[] {
  try {
    const value = localStorage.getItem(`fee:tabs:${projectId}`)
    const tabs = value ? JSON.parse(value) as OpenTab[] : []
    return Array.isArray(tabs) ? tabs : []
  } catch {
    return []
  }
}

export function AppProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initialState)

  const refreshSession = useCallback(async () => {
    if (!Cookies.get('fee_token')) {
      dispatch({ type: 'SESSION', user: null, projects: [], currentProjectId: null })
      return null
    }
    try {
      const [user, projects] = await Promise.all([authApi.user(), projectApi.list()])
      const selected = chooseDefaultProject(projects, localStorage.getItem('fee:lastProjectId'))
      const currentProjectId = selected ? String(selected.id) : null
      if (currentProjectId) localStorage.setItem('fee:lastProjectId', currentProjectId)
      dispatch({ type: 'SESSION', user, projects, currentProjectId })
      if (currentProjectId) {
        dispatch({ type: 'TABS', projectId: currentProjectId, tabs: readStoredTabs(currentProjectId) })
      }
      return selected
    } catch {
      dispatch({ type: 'SESSION', user: null, projects: [], currentProjectId: null })
      return null
    }
  }, [])

  const clearSession = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // 即使服务端暂不可用，也必须清理本地会话。
    } finally {
      Cookies.remove('fee_token')
      localStorage.removeItem('fee:lastProjectId')
      dispatch({ type: 'RESET' })
    }
  }, [])

  const setCurrentProject = useCallback((projectId: string) => {
    localStorage.setItem('fee:lastProjectId', projectId)
    dispatch({ type: 'PROJECT', projectId })
    dispatch({ type: 'TABS', projectId, tabs: readStoredTabs(projectId) })
  }, [])

  const setTabs = useCallback((projectId: string, tabs: OpenTab[]) => {
    localStorage.setItem(`fee:tabs:${projectId}`, JSON.stringify(tabs))
    dispatch({ type: 'TABS', projectId, tabs })
  }, [])

  const addTab = useCallback((projectId: string, tab: OpenTab) => {
    const currentTabs = state.tabsByProject[projectId] || readStoredTabs(projectId)
    const homeTab: OpenTab = {
      key: 'home',
      title: '首页',
      path: `/project/${projectId}/home`
    }
    const normalized = currentTabs.some(item => item.key === 'home') ? currentTabs : [homeTab, ...currentTabs]
    if (normalized.some(item => item.key === tab.key)) {
      if (normalized !== currentTabs) setTabs(projectId, normalized)
      return
    }
    setTabs(projectId, [...normalized, tab])
  }, [setTabs, state.tabsByProject])

  const currentProject = state.projects.find(project => String(project.id) === state.currentProjectId)
  const value = useMemo<AppContextValue>(() => ({
    ...state,
    currentProject,
    role: resolveProjectRole(state.user, currentProject),
    refreshSession,
    clearSession,
    setCurrentProject,
    setCollapsed: value => dispatch({ type: 'COLLAPSED', value }),
    setMobileMenuOpen: value => dispatch({ type: 'MOBILE_MENU', value }),
    addTab,
    setTabs
  }), [addTab, clearSession, currentProject, refreshSession, setCurrentProject, setTabs, state])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// Context Hook 与 Provider 同文件能保持状态契约集中，热更新提示可安全忽略。
// eslint-disable-next-line react-refresh/only-export-components
export function useAppState() {
  const value = useContext(AppContext)
  if (!value) throw new Error('useAppState 必须在 AppProvider 内使用')
  return value
}
