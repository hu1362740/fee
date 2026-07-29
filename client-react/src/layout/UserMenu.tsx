import {
  DeleteOutlined,
  EditOutlined,
  LockOutlined,
  LogoutOutlined,
  UserOutlined
} from '@ant-design/icons'
import { App, Avatar, Dropdown, Form, Input, Modal, type MenuProps } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api'
import { useAppState } from '@/context/AppContext'

export default function UserMenu() {
  const { user, refreshSession, clearSession } = useAppState()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const [profileOpen, setProfileOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [profileForm] = Form.useForm<{ nickname: string }>()
  const [passwordForm] = Form.useForm<{
    oldPassword: string
    password: string
    confirmPassword: string
  }>()

  const items: MenuProps['items'] = [
    ...(user?.register_type === 'site' ? [
      { key: 'profile', icon: <EditOutlined />, label: '修改信息' },
      { key: 'password', icon: <LockOutlined />, label: '修改密码' },
      { key: 'destroy', icon: <DeleteOutlined />, label: '注销账号', danger: true },
      { type: 'divider' as const }
    ] : []),
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' }
  ]

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'profile') {
      profileForm.setFieldsValue({ nickname: user?.nickname || '' })
      setProfileOpen(true)
    } else if (key === 'password') {
      passwordForm.resetFields()
      setPasswordOpen(true)
    } else if (key === 'destroy') {
      modal.confirm({
        title: '确认注销此账号？',
        content: '注销后当前账号将无法继续登录，此操作由服务端执行软删除。',
        okText: '确认注销',
        okButtonProps: { danger: true },
        async onOk() {
          const result = await authApi.destroy()
          message.success(result.msg || '账号已注销')
          await clearSession()
          navigate('/login', { replace: true })
        }
      })
    } else if (key === 'logout') {
      void clearSession().then(() => navigate('/login', { replace: true }))
    }
  }

  return (
    <>
      <Dropdown menu={{ items, onClick: onMenuClick }} placement="bottomRight">
        <button className="user-trigger" type="button" aria-label="用户菜单">
          <Avatar size={32} src={user?.avatar_url} icon={<UserOutlined />} />
          <span>{user?.nickname || user?.account || '用户'}</span>
        </button>
      </Dropdown>

      <Modal
        title="编辑信息"
        open={profileOpen}
        okText="保存"
        onCancel={() => setProfileOpen(false)}
        onOk={() => profileForm.submit()}
      >
        <Form
          form={profileForm}
          layout="vertical"
          onFinish={async values => {
            try {
              if (values.nickname === user?.nickname) {
                message.info('昵称未修改')
                return
              }
              const result = await authApi.modifyMessage(values.nickname.trim())
              message.success(result.msg || '信息修改成功')
              setProfileOpen(false)
              await refreshSession()
            } catch {
              // 统一请求层已展示错误，保留弹窗供用户重试。
            }
          }}
        >
          <Form.Item
            label="昵称"
            name="nickname"
            rules={[{ required: true, whitespace: true, message: '请输入昵称' }]}
          >
            <Input maxLength={50} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="修改密码"
        open={passwordOpen}
        okText="保存"
        onCancel={() => setPasswordOpen(false)}
        onOk={() => passwordForm.submit()}
      >
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={async values => {
            try {
              const result = await authApi.modifyPassword(values)
              message.success(result.msg || '密码修改成功')
              setPasswordOpen(false)
            } catch {
              // 统一请求层已展示错误，保留弹窗供用户重试。
            }
          }}
        >
          <Form.Item label="旧密码" name="oldPassword" rules={[{ required: true, message: '请输入旧密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item
            label="新密码"
            name="password"
            dependencies={['oldPassword']}
            rules={[
              { required: true, message: '请输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  return value && value === getFieldValue('oldPassword')
                    ? Promise.reject(new Error('新旧密码不能相同'))
                    : Promise.resolve()
                }
              })
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            label="确认密码"
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  return value && value !== getFieldValue('password')
                    ? Promise.reject(new Error('两次密码不一致'))
                    : Promise.resolve()
                }
              })
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
