import { LogoutOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Empty, Space, Typography } from 'antd'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAppState } from '@/context/AppContext'

export default function EmptyProjectPage() {
  const app = useAppState()
  const navigate = useNavigate()
  if (!app.ready) return null
  if (!app.user) return <Navigate to="/login" replace />
  if (app.currentProjectId) return <Navigate to={`/project/${app.currentProjectId}/home`} replace />

  return (
    <main className="empty-project-page">
      <Empty
        description={
          <div>
            <Typography.Title level={3}>暂无可访问项目</Typography.Title>
            <Typography.Paragraph type="secondary">
              当前账号尚未加入任何项目，请联系管理员分配项目权限后重试。
            </Typography.Paragraph>
          </div>
        }
      >
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void app.refreshSession()}>重新加载</Button>
          <Button
            icon={<LogoutOutlined />}
            onClick={() => void app.clearSession().then(() => navigate('/login', { replace: true }))}
          >
            退出登录
          </Button>
        </Space>
      </Empty>
    </main>
  )
}

