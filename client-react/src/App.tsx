import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Spin } from 'antd'
import { useAppState } from '@/context/AppContext'
import { canAccess, resolveProjectRole } from '@/utils/permissions'
import type { UserRole } from '@/types/api'
import AppLayout from '@/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import ErrorPage from '@/pages/ErrorPage'
import EmptyProjectPage from '@/pages/EmptyProjectPage'

const MenuCountPage = lazy(() => import('@/pages/behavior/MenuCountPage'))
const OnlineTimePage = lazy(() => import('@/pages/behavior/OnlineTimePage'))
const NewUsersPage = lazy(() => import('@/pages/behavior/NewUsersPage'))
const UvPage = lazy(() => import('@/pages/behavior/UvPage'))
const PvPage = lazy(() => import('@/pages/behavior/PvPage'))
const ErrorDashboardPage = lazy(() => import('@/pages/monitor/ErrorDashboardPage'))
const PerformancePage = lazy(() => import('@/pages/monitor/PerformancePage'))
const AlarmConfigPage = lazy(() => import('@/pages/alarm/AlarmConfigPage'))
const AlarmLogPage = lazy(() => import('@/pages/alarm/AlarmLogPage'))
const SystemOverviewPage = lazy(() => import('@/pages/system/SystemOverviewPage'))
const ProjectManagementPage = lazy(() => import('@/pages/management/ProjectManagementPage'))
const MemberManagementPage = lazy(() => import('@/pages/management/MemberManagementPage'))

function RootRedirect() {
  const app = useAppState()
  useEffect(() => {
    if (!app.ready) void app.refreshSession()
  }, [app.ready, app.refreshSession])
  if (!app.ready) return <div className="screen-loading"><Spin size="large" /></div>
  if (!app.user) return <Navigate to="/login" replace />
  if (!app.currentProjectId) return <Navigate to="/empty-project" replace />
  return <Navigate to={`/project/${app.currentProjectId}/home`} replace />
}

function Protected({ roles, children }: { roles?: UserRole[]; children: ReactNode }) {
  const app = useAppState()
  const { id } = useParams()
  if (!app.ready || !app.user) return <div className="screen-loading"><Spin size="large" /></div>
  const routeProject = app.projects.find(project => String(project.id) === String(id))
  const routeRole = resolveProjectRole(app.user, routeProject)
  if (!canAccess(roles, routeRole)) return <Navigate to="/401" replace />
  return children
}

export default function AppRouter() {
  return (
    <Suspense fallback={<div className="screen-loading"><Spin size="large" /></div>}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/empty-project" element={<EmptyProjectPage />} />
        <Route path="/project/:id" element={<AppLayout />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<ErrorDashboardPage />} />
          <Route path="behavior/menu-count" element={<MenuCountPage />} />
          <Route path="behavior/online-time" element={<OnlineTimePage />} />
          <Route path="behavior/new-users" element={<NewUsersPage />} />
          <Route path="behavior/uv" element={<UvPage />} />
          <Route path="behavior/pv" element={<PvPage />} />
          <Route path="monitor/performance" element={<PerformancePage />} />
          <Route path="monitor/error-dashboard" element={<ErrorDashboardPage />} />
          <Route path="alarm/alarm-config" element={<AlarmConfigPage />} />
          <Route path="alarm/alarm-log" element={<AlarmLogPage />} />
          <Route path="system/overview" element={<SystemOverviewPage />} />
          <Route
            path="projectManage/management"
            element={<Protected roles={['admin']}><ProjectManagementPage /></Protected>}
          />
          <Route
            path="userManage/management"
            element={<Protected roles={['admin', 'owner']}><MemberManagementPage /></Protected>}
          />
        </Route>
        <Route path="/401" element={<ErrorPage code={401} />} />
        <Route path="/500" element={<ErrorPage code={500} />} />
        <Route path="*" element={<ErrorPage code={404} />} />
      </Routes>
    </Suspense>
  )
}
