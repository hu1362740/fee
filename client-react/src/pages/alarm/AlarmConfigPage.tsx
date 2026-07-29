import { BellOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Tooltip } from 'antd'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { alarmApi, errorApi } from '@/api'
import PageHeading from '@/components/PageHeading'
import { PageError } from '@/components/PageState'
import { useAsyncData } from '@/hooks/useAsyncData'
import type { AlarmConfig } from '@/types/api'

interface AlarmForm {
  error_name: string
  time_range_s: number
  max_error_count: number
  alarm_interval_s: number
  note?: string
}

export default function AlarmConfigPage() {
  const { id = '' } = useParams()
  const { message } = App.useApp()
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AlarmConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<AlarmForm>()
  const listState = useAsyncData(() => alarmApi.list(id, page), [id, page], { currentPage: 1, pageSize: 10, totalCount: 0, list: [] })
  const errorState = useAsyncData(() => errorApi.summary(id), [id], [])

  const openEditor = (record?: AlarmConfig) => {
    setEditing(record ?? null)
    form.setFieldsValue(record ? {
      error_name: record.error_name,
      time_range_s: record.time_range_s,
      max_error_count: record.max_error_count,
      alarm_interval_s: record.alarm_interval_s,
      note: record.note
    } : {
      error_name: '*',
      time_range_s: 60,
      max_error_count: 5,
      alarm_interval_s: 60,
      note: ''
    })
    setOpen(true)
  }

  const submit = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      const payload = {
        ...(editing ? { id: editing.id } : {}),
        errorType: 8,
        errorName: values.error_name,
        timeRange: values.time_range_s,
        maxErrorCount: values.max_error_count,
        alarmInterval: values.alarm_interval_s,
        isEnable: editing?.is_enable ?? 1,
        note: values.note
      }
      if (editing) await alarmApi.update(id, payload)
      else await alarmApi.add(id, payload)
      message.success(editing ? '报警配置已更新' : '报警配置已新增')
      setOpen(false)
      await listState.reload()
    } catch {
      // 表单保持打开，错误由统一请求层提示。
    } finally {
      setSaving(false)
    }
  }

  const updateEnabled = async (record: AlarmConfig, checked: boolean) => {
    try {
      await alarmApi.update(id, {
        id: record.id,
        errorType: 8,
        errorName: record.error_name,
        timeRange: record.time_range_s,
        maxErrorCount: record.max_error_count,
        alarmInterval: Math.max(record.alarm_interval_s, 60),
        isEnable: checked ? 1 : 0,
        note: record.note
      })
      message.success(checked ? '报警规则已启用' : '报警规则已停用')
      await listState.reload()
    } catch {
      await listState.reload()
    }
  }

  const remove = async (record: AlarmConfig) => {
    try {
      await alarmApi.remove(id, record.id)
      message.success('报警配置已删除')
      if (listState.data.list.length === 1 && page > 1) setPage(page - 1)
      else await listState.reload()
    } catch {
      // 统一请求层已提示错误。
    }
  }

  return (
    <>
      <PageHeading
        title="报警配置"
        description="为错误类型配置统计窗口、触发阈值和重复报警间隔。"
        icon={<BellOutlined />}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>新增配置</Button>}
      />
      {listState.error ? <PageError message={listState.error.message} onRetry={() => void listState.reload()} /> : (
        <Card className="table-card">
          <Table
            rowKey="id"
            loading={listState.loading}
            dataSource={listState.data.list}
            scroll={{ x: 1050 }}
            pagination={{
              current: listState.data.currentPage,
              pageSize: listState.data.pageSize,
              total: listState.data.totalCount,
              showTotal: value => `共 ${value} 条`,
              onChange: setPage
            }}
            columns={[
              { title: 'ID', dataIndex: 'id', width: 70 },
              { title: '错误名称', dataIndex: 'error_name', width: 210, render: value => <Tag color={value === '*' ? 'blue' : 'red'}>{value === '*' ? '全部错误' : value}</Tag> },
              { title: '监控范围', dataIndex: 'time_range_s', width: 120, render: value => `${value} 秒` },
              { title: '触发阈值', dataIndex: 'max_error_count', width: 110, render: value => `> ${value} 次` },
              {
                title: <Tooltip title="报警后未恢复时，再次发送报警的最短间隔（最低 60 秒）">沉默时间</Tooltip>,
                dataIndex: 'alarm_interval_s',
                width: 120,
                render: value => `${value} 秒`
              },
              { title: '备注', dataIndex: 'note', ellipsis: true, render: value => value || '-' },
              { title: '创建人', dataIndex: 'create_ucid', width: 100, render: value => value || '-' },
              { title: '修改人', dataIndex: 'update_ucid', width: 100, render: value => value || '-' },
              { title: '启用', width: 80, render: (_, record) => <Switch checked={record.is_enable === 1} onChange={checked => void updateEnabled(record, checked)} /> },
              {
                title: '操作',
                fixed: 'right',
                width: 120,
                render: (_, record) => <Space>
                  <Button type="text" aria-label="编辑" icon={<EditOutlined />} onClick={() => openEditor(record)} />
                  <Popconfirm title="确认删除这条报警配置？" okText="删除" cancelText="取消" onConfirm={() => void remove(record)}>
                    <Button danger type="text" aria-label="删除" icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              }
            ]}
          />
        </Card>
      )}
      <Modal
        title={editing ? '编辑报警配置' : '新增报警配置'}
        open={open}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        onOk={() => void submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="error_name" label="错误名称" rules={[{ required: true, message: '请选择错误名称' }]}>
            <Select
              showSearch
              loading={errorState.loading}
              options={[
                { value: '*', label: '全部错误' },
                ...errorState.data.filter(item => item.error_count >= 5).map(item => ({ value: item.error_name, label: `${item.error_name}（${item.error_count}）` }))
              ]}
            />
          </Form.Item>
          <Form.Item name="time_range_s" label="监控范围（最近 x 秒）" rules={[{ required: true }, { type: 'number', min: 1, message: '监控范围必须大于 0 秒' }]}>
            <InputNumber min={1} precision={0} addonAfter="秒" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="max_error_count" label="错误数达到 x 以上" rules={[{ required: true }, { type: 'number', min: 1, message: '错误数必须大于 0' }]}>
            <InputNumber min={1} precision={0} addonAfter="次" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="alarm_interval_s"
            label="沉默时间"
            extra="报警后如果未恢复正常，至少间隔 60 秒再次报警。"
            rules={[{ required: true }, { type: 'number', min: 60, message: '沉默时间不能低于 60 秒' }]}
          >
            <InputNumber min={60} precision={0} addonAfter="秒" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="备注"><Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={200} showCount /></Form.Item>
        </Form>
      </Modal>
    </>
  )
}
