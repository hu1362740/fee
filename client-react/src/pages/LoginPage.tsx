import { LockOutlined, MailOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Form, Input, Segmented, Space, Spin, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { authApi } from '@/api'
import { useAppState } from '@/context/AppContext'
import type { LoginType } from '@/types/api'
import logo from '@/assets/logo.png'

interface LoginForm {
  account: string
  password: string
}

interface RegisterForm extends LoginForm {
  nickname: string
  confirmPassword: string
}

export default function LoginPage() {
  const appState = useAppState()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loginType, setLoginType] = useState<LoginType>('normal')
  const [loadingType, setLoadingType] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void authApi.loginType()
      .then(type => setLoginType(type === 'uc' ? 'uc' : 'normal'))
      .catch(() => setLoginType('normal'))
      .finally(() => setLoadingType(false))
  }, [])

  if (appState.ready && appState.user && appState.currentProjectId) {
    return <Navigate to={`/project/${appState.currentProjectId}/home`} replace />
  }

  const onLogin = async (values: LoginForm) => {
    setSubmitting(true)
    try {
      await authApi.login(loginType, { account: values.account.trim(), password: values.password })
      const project = await appState.refreshSession()
      message.success('欢迎回来')
      navigate(project ? `/project/${project.id}/home` : '/empty-project', { replace: true })
    } catch {
      // 统一请求层已展示服务端或网络错误。
    } finally {
      setSubmitting(false)
    }
  }

  const onRegister = async (values: RegisterForm) => {
    setSubmitting(true)
    try {
      const result = await authApi.register({
        account: values.account.trim(),
        password: values.password,
        nickname: values.nickname.trim()
      })
      message.success(result.msg || '注册成功，请登录')
      setMode('login')
    } catch {
      // 统一请求层已展示服务端或网络错误。
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-overlay" />
      <section className="login-brand-panel">
        <div className="login-brand-copy">
          <img src={logo} alt="灯塔" />
          <Typography.Title>让每一次异常都有迹可循</Typography.Title>
          <Typography.Paragraph>
            汇集用户行为、页面性能、错误、报警与运行环境数据，
            为团队提供清晰、可靠的前端质量视图。
          </Typography.Paragraph>
          <Space wrap>
            <span><SafetyCertificateOutlined /> 私有化部署</span>
            <span><SafetyCertificateOutlined /> 实时监控</span>
            <span><SafetyCertificateOutlined /> 多项目管理</span>
          </Space>
        </div>
      </section>

      <section className="login-form-panel">
        <Card className="login-card">
          <div className="login-card-header">
            <div>
              <Typography.Title level={2}>{mode === 'login' ? '欢迎回来' : '创建账号'}</Typography.Title>
              <Typography.Text type="secondary">
                {mode === 'login' ? '登录灯塔前端监控平台' : '注册站点账号后即可登录'}
              </Typography.Text>
            </div>
            {loginType === 'normal' && (
              <Button type="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? '去注册' : '去登录'}
              </Button>
            )}
          </div>

          {loadingType ? (
            <div className="login-loading"><Spin /></div>
          ) : (
            <>
              {mode === 'login' && (
                <>
                  <Segmented
                    block
                    value={loginType}
                    options={[
                      { label: '普通登录', value: 'normal' },
                      { label: 'UC 登录', value: 'uc' }
                    ]}
                    onChange={value => setLoginType(value as LoginType)}
                  />
                  {loginType === 'uc' && (
                    <Alert className="login-mode-alert" showIcon type="info" title="使用企业 UC 账号登录" />
                  )}
                  <Form<LoginForm> layout="vertical" size="large" onFinish={onLogin}>
                    <Form.Item
                      label="账号"
                      name="account"
                      rules={[{ required: true, whitespace: true, message: '请输入账号' }]}
                    >
                      <Input prefix={<MailOutlined />} placeholder={loginType === 'normal' ? '请输入邮箱' : '请输入 UC 账号'} />
                    </Form.Item>
                    <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
                      <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block loading={submitting}>登录</Button>
                  </Form>
                </>
              )}
              {mode === 'register' && (
                <Form<RegisterForm> layout="vertical" size="large" onFinish={onRegister}>
                  <Form.Item
                    label="邮箱"
                    name="account"
                    rules={[
                      { required: true, whitespace: true, message: '请输入邮箱' },
                      { type: 'email', message: '邮箱格式不正确' }
                    ]}
                  >
                    <Input prefix={<MailOutlined />} />
                  </Form.Item>
                  <Form.Item label="昵称" name="nickname" rules={[{ required: true, whitespace: true, message: '请输入昵称' }]}>
                    <Input prefix={<UserOutlined />} maxLength={50} />
                  </Form.Item>
                  <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
                    <Input.Password prefix={<LockOutlined />} />
                  </Form.Item>
                  <Form.Item
                    label="确认密码"
                    name="confirmPassword"
                    dependencies={['password']}
                    rules={[
                      { required: true, message: '请再次输入密码' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          return value && value !== getFieldValue('password')
                            ? Promise.reject(new Error('两次密码不一致'))
                            : Promise.resolve()
                        }
                      })
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined />} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={submitting}>注册</Button>
                </Form>
              )}
            </>
          )}
        </Card>
      </section>
    </main>
  )
}
