import { DeleteOutlined, EditOutlined, FolderOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd'
import { useRef, useState } from 'react'
import { authApi, projectApi } from '@/api'
import PageHeading from '@/components/PageHeading'
import { PageError } from '@/components/PageState'
import { useAppState } from '@/context/AppContext'
import { useAsyncData } from '@/hooks/useAsyncData'
import type { Project, UserSearchItem } from '@/types/api'

interface ProjectForm {
  projectName: string
  displayName: string
  cDesc?: string
  ownerUcid?: string
}

export default function ProjectManagementPage() {
  const app = useAppState()
  const { message } = App.useApp()
  const [form] = Form.useForm<ProjectForm>()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [saving, setSaving] = useState(false)
  const [owners, setOwners] = useState<UserSearchItem[]>([])
  const [searching, setSearching] = useState(false)
  const searchSerial = useRef(0)
  const state = useAsyncData(projectApi.list, [], [])

  const searchOwners = async (account: string) => {
    const serial = ++searchSerial.current
    if (!account.trim()) {
      setOwners([])
      return
    }
    setSearching(true)
    try {
      const result = await authApi.searchUsers(account.trim())
      if (serial === searchSerial.current) setOwners(result)
    } catch {
      if (serial === searchSerial.current) setOwners([])
    } finally {
      if (serial === searchSerial.current) setSearching(false)
    }
  }
  const showEditor = (project?: Project) => {
    setEditing(project ?? null)
    form.setFieldsValue(project ? {
      projectName: project.project_name,
      displayName: project.display_name,
      cDesc: project.c_desc
    } : { projectName: '', displayName: '', cDesc: '', ownerUcid: undefined })
    setOpen(true)
  }
  const submit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editing) {
        await projectApi.update({ id: editing.id, projectName: values.projectName, displayName: values.displayName, cDesc: values.cDesc })
      } else {
        await projectApi.add({ projectName: values.projectName, displayName: values.displayName, cDesc: values.cDesc, ownerUcid: values.ownerUcid! })
      }
      message.success(editing ? '项目已更新' : '项目已创建')
      setOpen(false)
      await state.reload()
      await app.refreshSession()
    } catch {
      // 表单保持打开，错误由统一请求层提示。
    } finally {
      setSaving(false)
    }
  }
  const remove = async (project: Project) => {
    try {
      await projectApi.remove(project.id)
      message.success('项目已删除')
      await state.reload()
      await app.refreshSession()
    } catch {
      // 统一请求层已提示错误。
    }
  }
  return (
    <>
      <PageHeading title="项目管理" description="维护监控项目、SDK 项目标识和项目负责人。" icon={<FolderOutlined />} extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => showEditor()}>新增项目</Button>} />
      {state.error ? <PageError message={state.error.message} onRetry={() => void state.reload()} /> : (
        <Card className="table-card">
          <Table
            rowKey="id"
            loading={state.loading}
            dataSource={state.data}
            scroll={{ x: 850 }}
            pagination={{ pageSize: 10, showTotal: total => `共 ${total} 个项目` }}
            columns={[
              { title: '项目 ID', dataIndex: 'id', width: 90 },
              { title: '显示名称', dataIndex: 'display_name', width: 180 },
              { title: '项目标识', dataIndex: 'project_name', width: 180, render: value => <Tag color="blue">{value}</Tag> },
              { title: '抽样率', dataIndex: 'rate', width: 100, render: value => `${(Number(value || 0) / 100).toFixed(0)}%` },
              { title: '备注', dataIndex: 'c_desc', ellipsis: true, render: value => value || '-' },
              {
                title: '操作',
                fixed: 'right',
                width: 120,
                render: (_, record) => <Space>
                  <Button type="text" aria-label="编辑项目" icon={<EditOutlined />} onClick={() => showEditor(record)} />
                  <Popconfirm title="确认删除项目？" description={record.display_name || record.project_name} okText="删除" cancelText="取消" onConfirm={() => void remove(record)}>
                    <Button danger type="text" aria-label="删除项目" icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              }
            ]}
          />
        </Card>
      )}
      <Modal title={editing ? '编辑项目' : '新增项目'} open={open} confirmLoading={saving} onOk={() => void submit()} onCancel={() => setOpen(false)} okText="保存" cancelText="取消" destroyOnHidden>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="projectName" label="项目标识" extra="需与 SDK 上报的 project_name 完全一致。" rules={[{ required: true, message: '请输入项目标识' }, { pattern: /^[\w.-]+$/, message: '仅支持字母、数字、下划线、点和短横线' }]}>
            <Input placeholder="例如 fee-web" disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="displayName" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}><Input maxLength={60} /></Form.Item>
          {!editing && <Form.Item name="ownerUcid" label="项目 Owner" rules={[{ required: true, message: '请选择项目 Owner' }]}>
            <Select
              showSearch
              filterOption={false}
              loading={searching}
              placeholder="输入账号远程搜索"
              onSearch={value => void searchOwners(value)}
              options={owners.map(owner => ({ value: owner.ucid, label: `${owner.account}${owner.nickname ? `（${owner.nickname}）` : ''}` }))}
            />
          </Form.Item>}
          <Form.Item name="cDesc" label="项目备注"><Input.TextArea rows={3} maxLength={200} showCount /></Form.Item>
        </Form>
      </Modal>
    </>
  )
}
