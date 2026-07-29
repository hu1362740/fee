import { DeleteOutlined, EditOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Modal, Popconfirm, Select, Space, Switch, Table, Tag } from 'antd'
import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { authApi, memberApi } from '@/api'
import PageHeading from '@/components/PageHeading'
import { PageError } from '@/components/PageState'
import { useAsyncData } from '@/hooks/useAsyncData'
import type { Member, UserRole, UserSearchItem } from '@/types/api'

export default function MemberManagementPage() {
  const { id = '' } = useParams()
  const { message } = App.useApp()
  const [addForm] = Form.useForm<{ ucid_list: string[]; role: Exclude<UserRole, 'admin'> }>()
  const [editForm] = Form.useForm<{ role: Exclude<UserRole, 'admin'> }>()
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [users, setUsers] = useState<UserSearchItem[]>([])
  const [searching, setSearching] = useState(false)
  const serial = useRef(0)
  const state = useAsyncData(() => memberApi.list(id), [id], [])

  const search = async (account: string) => {
    const current = ++serial.current
    if (!account.trim()) {
      setUsers([])
      return
    }
    setSearching(true)
    try {
      const result = await authApi.searchUsers(account.trim())
      if (current === serial.current) setUsers(result)
    } catch {
      if (current === serial.current) setUsers([])
    } finally {
      if (current === serial.current) setSearching(false)
    }
  }
  const add = async () => {
    try {
      const values = await addForm.validateFields()
      await memberApi.add(id, values)
      message.success('成员已添加')
      setAddOpen(false)
      addForm.resetFields()
      await state.reload()
    } catch {
      // 校验信息由表单展示，请求错误由统一请求层提示。
    }
  }
  const saveRole = async () => {
    if (!editing) return
    try {
      const values = await editForm.validateFields()
      await memberApi.update(id, { id: editing.id, role: values.role, need_alarm: editing.need_alarm })
      message.success('成员角色已更新')
      setEditing(null)
      await state.reload()
    } catch {
      // 校验信息由表单展示，请求错误由统一请求层提示。
    }
  }
  const setAlarm = async (member: Member, checked: boolean) => {
    try {
      await memberApi.update(id, { id: member.id, role: member.role, need_alarm: checked ? 1 : 0 })
      message.success(checked ? '已开启成员报警' : '已关闭成员报警')
      await state.reload()
    } catch {
      await state.reload()
    }
  }
  const remove = async (member: Member) => {
    try {
      await memberApi.remove(id, member.id)
      message.success('成员已移除')
      await state.reload()
    } catch {
      // 统一请求层已提示错误。
    }
  }

  return (
    <>
      <PageHeading title="成员管理" description="维护项目成员、角色权限和报警接收状态。" icon={<TeamOutlined />} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { addForm.setFieldsValue({ role: 'dev', ucid_list: [] }); setAddOpen(true) }}>新增成员</Button>} />
      {state.error ? <PageError message={state.error.message} onRetry={() => void state.reload()} /> : (
        <Card className="table-card">
          <Table
            rowKey="id"
            loading={state.loading}
            dataSource={state.data}
            scroll={{ x: 720 }}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 位成员` }}
            columns={[
              { title: '用户 ID', dataIndex: 'ucid', width: 220 },
              { title: '用户昵称', dataIndex: 'nickname', render: value => value || '-' },
              { title: '角色', dataIndex: 'role', width: 110, render: value => <Tag color={value === 'owner' ? 'gold' : 'blue'}>{value}</Tag> },
              { title: '接收报警', width: 110, render: (_, record) => <Switch checked={record.need_alarm === 1} onChange={checked => void setAlarm(record, checked)} /> },
              {
                title: '操作',
                fixed: 'right',
                width: 130,
                render: (_, record) => <Space>
                  <Button type="text" aria-label="修改角色" icon={<EditOutlined />} onClick={() => { setEditing(record); editForm.setFieldsValue({ role: record.role }) }} />
                  <Popconfirm title="确认移除该成员？" okText="移除" cancelText="取消" onConfirm={() => void remove(record)}>
                    <Button danger type="text" aria-label="移除成员" icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              }
            ]}
          />
        </Card>
      )}
      <Modal title="新增成员" open={addOpen} onOk={() => void add()} onCancel={() => setAddOpen(false)} okText="添加" cancelText="取消" destroyOnHidden>
        <Form form={addForm} layout="vertical" preserve={false}>
          <Form.Item name="ucid_list" label="用户账号" rules={[{ required: true, message: '请选择至少一个用户' }]}>
            <Select
              mode="multiple"
              showSearch
              filterOption={false}
              loading={searching}
              placeholder="输入账号或邮箱前缀搜索"
              onSearch={value => void search(value)}
              options={users.map(user => ({ value: user.ucid, label: `${user.account}${user.nickname ? `（${user.nickname}）` : ''}` }))}
            />
          </Form.Item>
          <Form.Item name="role" label="成员角色" rules={[{ required: true }]}>
            <Select options={[{ value: 'dev', label: 'dev（开发者）' }, { value: 'owner', label: 'owner（项目负责人）' }]} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="修改成员角色" open={Boolean(editing)} onOk={() => void saveRole()} onCancel={() => setEditing(null)} okText="保存" cancelText="取消" destroyOnHidden>
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item label="成员">{editing?.nickname || editing?.ucid}</Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select options={[{ value: 'dev', label: 'dev（开发者）' }, { value: 'owner', label: 'owner（项目负责人）' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
