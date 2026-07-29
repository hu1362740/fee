import {
  AlertOutlined,
  AppstoreOutlined,
  BarsOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  DesktopOutlined,
  EyeOutlined,
  FolderOutlined,
  GlobalOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PieChartOutlined,
  ProjectOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserAddOutlined,
  WarningOutlined
} from '@ant-design/icons'
import {
  Breadcrumb,
  Button,
  Drawer,
  Grid,
  Layout,
  Menu,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  type MenuProps
} from 'antd'
import { useEffect, useMemo } from 'react'
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAppState } from '@/context/AppContext'
import UserMenu from './UserMenu'
import logo from '@/assets/logo.png'
import logoMini from '@/assets/logo-min.jpg'

const { Header, Sider, Content } = Layout

const PAGE_META: Array<{ suffix: string; key: string; title: string; group: string }> = [
  { suffix: '/home', key: 'home', title: '首页', group: '监控概览' },
  { suffix: '/behavior/menu-count', key: 'menu-count', title: '菜单点击量', group: '用户行为' },
  { suffix: '/behavior/online-time', key: 'online-time', title: '用户在线时长', group: '用户行为' },
  { suffix: '/behavior/new-users', key: 'new-users', title: '新增用户数据', group: '用户行为' },
  { suffix: '/behavior/uv', key: 'uv', title: 'UV统计', group: '用户行为' },
  { suffix: '/behavior/pv', key: 'pv', title: 'PV统计', group: '用户行为' },
  { suffix: '/monitor/performance', key: 'performance', title: '页面性能', group: '异常监控' },
  { suffix: '/monitor/error-dashboard', key: 'error-dashboard', title: '错误看板', group: '异常监控' },
  { suffix: '/alarm/alarm-config', key: 'alarm-config', title: '报警配置', group: '报警' },
  { suffix: '/alarm/alarm-log', key: 'alarm-log', title: '报警日志', group: '报警' },
  { suffix: '/system/overview', key: 'system-overview', title: '环境分布', group: '系统环境' },
  { suffix: '/projectManage/management', key: 'project-management', title: '项目管理', group: '项目' },
  { suffix: '/userManage/management', key: 'member-management', title: '成员管理', group: '用户' }
]

function pathFor(projectId: string, suffix: string) {
  return `/project/${projectId}${suffix}`
}

export default function AppLayout() {
  const app = useAppState()
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const accessible = app.projects.some(project => String(project.id) === String(id))
  const currentMeta = PAGE_META.find(item => location.pathname.endsWith(item.suffix)) || PAGE_META[0]!

  useEffect(() => {
    if (!app.ready) void app.refreshSession()
  }, [app.ready, app.refreshSession])

  useEffect(() => {
    if (!app.ready || !app.user || !app.projects.length) return
    if (!accessible) {
      const target = app.currentProjectId || String(app.projects[0]!.id)
      navigate(`/project/${target}/home`, { replace: true })
      return
    }
    if (app.currentProjectId !== id) app.setCurrentProject(id)
  }, [accessible, app, id, navigate])

  useEffect(() => {
    if (!id || !currentMeta) return
    app.addTab(id, { key: currentMeta.key, title: currentMeta.title, path: location.pathname })
  }, [app.addTab, currentMeta, id, location.pathname])

  const menuItems = useMemo<MenuProps['items']>(() => {
    if (!id) return []
    const items: MenuProps['items'] = [
      { key: 'home', icon: <HomeOutlined />, label: '首页' },
      {
        key: 'behavior',
        icon: <AppstoreOutlined />,
        label: '用户行为',
        children: [
          { key: 'menu-count', icon: <BarsOutlined />, label: '菜单点击量' },
          { key: 'online-time', icon: <ClockCircleOutlined />, label: '用户在线时长' },
          { key: 'new-users', icon: <UserAddOutlined />, label: '新增用户数据' },
          { key: 'uv', icon: <EyeOutlined />, label: 'UV统计' },
          { key: 'pv', icon: <GlobalOutlined />, label: 'PV统计' }
        ]
      },
      {
        key: 'monitor',
        icon: <WarningOutlined />,
        label: '异常监控',
        children: [
          { key: 'performance', icon: <ThunderboltOutlined />, label: '页面性能' },
          { key: 'error-dashboard', icon: <DashboardOutlined />, label: '错误看板' }
        ]
      },
      {
        key: 'alarm',
        icon: <AlertOutlined />,
        label: '报警',
        children: [
          { key: 'alarm-config', icon: <SettingOutlined />, label: '配置' },
          { key: 'alarm-log', icon: <ClockCircleOutlined />, label: '日志' }
        ]
      },
      {
        key: 'system',
        icon: <DesktopOutlined />,
        label: '系统环境',
        children: [{ key: 'system-overview', icon: <PieChartOutlined />, label: '环境分布' }]
      }
    ]
    if (app.role === 'admin') {
      items.push({
        key: 'project',
        icon: <ProjectOutlined />,
        label: '项目',
        children: [{ key: 'project-management', icon: <FolderOutlined />, label: '项目管理' }]
      })
    }
    if (app.role === 'admin' || app.role === 'owner') {
      items.push({
        key: 'user',
        icon: <TeamOutlined />,
        label: '用户',
        children: [{ key: 'member-management', icon: <TeamOutlined />, label: '成员管理' }]
      })
    }
    return items
  }, [app.role, id])

  if (!app.ready) return <div className="screen-loading"><Spin size="large" /></div>
  if (!app.user) return <Navigate to="/login" replace />
  if (!app.projects.length) return <Navigate to="/empty-project" replace />
  if (!accessible) return <div className="screen-loading"><Spin size="large" /></div>

  const routeByKey: Record<string, string> = {
    home: pathFor(id, '/home'),
    'menu-count': pathFor(id, '/behavior/menu-count'),
    'online-time': pathFor(id, '/behavior/online-time'),
    'new-users': pathFor(id, '/behavior/new-users'),
    uv: pathFor(id, '/behavior/uv'),
    pv: pathFor(id, '/behavior/pv'),
    performance: pathFor(id, '/monitor/performance'),
    'error-dashboard': pathFor(id, '/monitor/error-dashboard'),
    'alarm-config': pathFor(id, '/alarm/alarm-config'),
    'alarm-log': pathFor(id, '/alarm/alarm-log'),
    'system-overview': pathFor(id, '/system/overview'),
    'project-management': pathFor(id, '/projectManage/management'),
    'member-management': pathFor(id, '/userManage/management')
  }

  const menu = (
    <>
      <div className="brand">
        <img src={app.collapsed && !isMobile ? logoMini : logo} alt="灯塔" />
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[currentMeta.key]}
        defaultOpenKeys={[currentMeta.group === '监控概览' ? '' : currentMeta.group]}
        items={menuItems}
        onClick={({ key }) => {
          const target = routeByKey[key]
          if (target) navigate(target)
          app.setMobileMenuOpen(false)
        }}
      />
    </>
  )

  const tabs = app.tabsByProject[id] || []
  const normalizedTabs = tabs.length ? tabs : [{ key: 'home', title: '首页', path: pathFor(id, '/home') }]

  const closeTab = (targetKey: string) => {
    if (targetKey === 'home') return
    const index = normalizedTabs.findIndex(tab => tab.key === targetKey)
    const nextTabs = normalizedTabs.filter(tab => tab.key !== targetKey)
    app.setTabs(id, nextTabs)
    if (currentMeta.key === targetKey) {
      const fallback = nextTabs[Math.max(index - 1, 0)] || nextTabs[0]
      navigate(fallback?.path || pathFor(id, '/home'))
    }
  }

  return (
    <Layout className="app-shell">
      {!isMobile && (
        <Sider
          width={220}
          collapsedWidth={72}
          collapsed={app.collapsed}
          trigger={null}
          className="app-sider"
        >
          {menu}
        </Sider>
      )}
      <Drawer
        placement="left"
        width={248}
        open={isMobile && app.mobileMenuOpen}
        closable={false}
        styles={{ body: { padding: 0, background: '#0b1f3a' } }}
        onClose={() => app.setMobileMenuOpen(false)}
      >
        {menu}
      </Drawer>

      <Layout>
        <Header className="app-header">
          <Space size={16} className="header-left">
            <Button
              type="text"
              icon={
                isMobile
                  ? <MenuUnfoldOutlined />
                  : app.collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />
              }
              aria-label="切换导航"
              onClick={() => {
                if (isMobile) app.setMobileMenuOpen(true)
                else app.setCollapsed(!app.collapsed)
              }}
            />
            <Breadcrumb
              className="header-breadcrumb"
              items={[
                { title: <HomeOutlined />, href: pathFor(id, '/home') },
                ...(currentMeta.group !== '监控概览' ? [{ title: currentMeta.group }] : []),
                { title: currentMeta.title }
              ]}
            />
          </Space>
          <Space size={14} className="header-actions">
            <Tag color={app.role === 'admin' ? 'blue' : app.role === 'owner' ? 'gold' : 'default'}>
              {app.role}
            </Tag>
            <div className="project-selector">
              <Typography.Text type="secondary" className="sample-rate">
                抽样 {((app.currentProject?.rate ?? 10000) / 100).toFixed(0)}%
              </Typography.Text>
              <Select
                value={id}
                popupMatchSelectWidth={320}
                options={app.projects.map(project => ({
                  value: String(project.id),
                  label: (
                    <div className="project-option">
                      <strong>{project.display_name}</strong>
                      <span>{project.c_desc || project.project_name}</span>
                    </div>
                  )
                }))}
                onChange={projectId => {
                  app.setCurrentProject(projectId)
                  navigate(`/project/${projectId}/home`)
                }}
              />
            </div>
            <Tooltip title="产品文档地址尚未配置">
              <Button type="text" icon={<QuestionCircleOutlined />} aria-label="产品帮助" />
            </Tooltip>
            <UserMenu />
          </Space>
        </Header>

        <div className="page-tabs">
          <Tabs
            type="editable-card"
            hideAdd
            activeKey={currentMeta.key}
            items={normalizedTabs.map(tab => ({
              key: tab.key,
              label: tab.title,
              closable: tab.key !== 'home'
            }))}
            onChange={key => {
              const tab = normalizedTabs.find(item => item.key === key)
              if (tab) navigate(tab.path)
            }}
            onEdit={(targetKey, action) => {
              if (action === 'remove') closeTab(String(targetKey))
            }}
          />
        </div>

        <Content className="app-content"><Outlet /></Content>
      </Layout>
    </Layout>
  )
}
