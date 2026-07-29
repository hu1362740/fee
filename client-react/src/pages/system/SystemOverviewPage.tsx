import { DesktopOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, DatePicker, Row, Select, Space, Table, Tabs, Typography } from 'antd'
import dayjs from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { systemApi } from '@/api'
import EChart from '@/components/EChart'
import PageHeading from '@/components/PageHeading'
import { PageError, PageLoading } from '@/components/PageState'
import StatCard from '@/components/StatCard'
import { useAsyncData } from '@/hooks/useAsyncData'
import type { NameValue, SystemDistribution } from '@/types/api'

interface RankRow {
  name: string
  version?: string
  value: number
  percent: string
}

function totalOf(list: Array<{ value: number }>) {
  return list.reduce((sum, item) => sum + Number(item.value || 0), 0)
}

function toRanks(list: SystemDistribution[]): RankRow[] {
  const total = totalOf(list)
  return list
    .map(item => ({
      name: item.type || '未知',
      version: item.key || '未知',
      value: Number(item.value || 0),
      percent: total ? `${(Number(item.value || 0) * 100 / total).toFixed(2)}%` : '0.00%'
    }))
    .sort((a, b) => b.value - a.value)
}

function toGrouped(list: RankRow[]): NameValue[] {
  const grouped = new Map<string, number>()
  list.forEach(item => grouped.set(item.name, (grouped.get(item.name) || 0) + item.value))
  return [...grouped].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

function pieOption(data: NameValue[], name: string) {
  const sorted = [...data].sort((a, b) => b.value - a.value)
  const top = sorted.length > 10
    ? [...sorted.slice(0, 10), { name: '其他', value: sorted.slice(10).reduce((sum, item) => sum + item.value, 0) }]
    : sorted
  return {
    tooltip: { trigger: 'item', formatter: '{b}：{c}（{d}%）' },
    legend: { type: 'scroll', orient: 'vertical', right: 8, top: 22, bottom: 20 },
    series: [{ type: 'pie', name, radius: ['40%', '70%'], center: ['38%', '50%'], data: top, label: { formatter: '{b}\n{d}%' } }]
  }
}

function DistributionTab({
  title,
  data,
  loading,
  alert
}: {
  title: string
  data: RankRow[]
  loading: boolean
  alert?: string
}) {
  const grouped = useMemo(() => toGrouped(data), [data])
  return (
    <>
      {alert && <Alert showIcon type="info" title={alert} style={{ marginBottom: 14 }} />}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card type="inner" title={`${title}占比 Top 10`}>
            {loading ? <PageLoading /> : <EChart option={pieOption(grouped, title)} empty={!grouped.length} height={390} />}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card type="inner" title={`${title}排名`}>
            <Table
              rowKey={(item, index) => `${item.name}-${item.version}-${index}`}
              size="small"
              loading={loading}
              dataSource={data}
              scroll={{ y: 330 }}
              pagination={false}
              columns={[
                { title: '排名', width: 70, render: (_value, _record, index) => index + 1 },
                { title, dataIndex: 'name' },
                { title: '版本/型号', dataIndex: 'version', render: value => value || '-' },
                { title: '数量', dataIndex: 'value', sorter: (a, b) => a.value - b.value },
                { title: '占比', dataIndex: 'percent', width: 90 }
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  )
}

export default function SystemOverviewPage() {
  const { id = '' } = useParams()
  const [month, setMonth] = useState(dayjs())
  const [selectedBrowser, setSelectedBrowser] = useState('')
  const [lastUpdated, setLastUpdated] = useState('')
  const monthText = month.format('YYYY-MM')
  const state = useAsyncData(async () => {
    const [browsers, allBrowsers, os, devices, runtimes] = await Promise.all([
      systemApi.browsers(id, monthText),
      systemApi.browserVersionsAll(id, monthText),
      systemApi.os(id, monthText),
      systemApi.devices(id, monthText),
      systemApi.runtimes(id, monthText)
    ])
    setLastUpdated(dayjs().format('YYYY-MM-DD HH:mm:ss'))
    return { browsers, allBrowsers, os, devices, runtimes }
  }, [id, monthText], { browsers: [], allBrowsers: [], os: [], devices: [], runtimes: [] })
  useEffect(() => {
    setSelectedBrowser(current => state.data.browsers.includes(current) ? current : (state.data.browsers[0] ?? ''))
  }, [state.data.browsers])
  const versionState = useAsyncData(
    () => selectedBrowser ? systemApi.browserVersions(id, monthText, selectedBrowser) : Promise.resolve([]),
    [id, monthText, selectedBrowser],
    []
  )
  const browserRanks = useMemo<RankRow[]>(() => {
    const grouped = new Map<string, number>()
    state.data.allBrowsers.forEach(item => grouped.set(item.browser || '未知', (grouped.get(item.browser || '未知') || 0) + Number(item.total_count || 0)))
    const rows = [...grouped].map(([name, value]) => ({ name, value }))
    const total = totalOf(rows)
    return rows.sort((a, b) => b.value - a.value).map(item => ({ ...item, percent: total ? `${(item.value * 100 / total).toFixed(2)}%` : '0.00%' }))
  }, [state.data.allBrowsers])
  const osRanks = useMemo(() => toRanks(state.data.os), [state.data.os])
  const deviceRanks = useMemo(() => toRanks(state.data.devices), [state.data.devices])
  const runtimeRanks = useMemo(() => toRanks(state.data.runtimes), [state.data.runtimes])
  const browserVersionData = useMemo(() => versionState.data.map(item => ({ name: String(item.key || '未知'), value: Number(item.value || 0) })), [versionState.data])
  const versionOption = useMemo(() => ({
    color: ['#1677ff'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 20, left: 24, right: 45, bottom: 20, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf1f6' } } },
    yAxis: { type: 'category', inverse: true, data: browserVersionData.map(item => item.name) },
    series: [{ type: 'bar', data: browserVersionData.map(item => item.value), barMaxWidth: 22, label: { show: true, position: 'right' }, itemStyle: { borderRadius: [0, 4, 4, 0] } }]
  }), [browserVersionData])

  return (
    <>
      <PageHeading
        title="系统环境"
        description="按月汇总浏览器、操作系统、设备和业务版本样本。"
        icon={<DesktopOutlined />}
        extra={<Space>
          <DatePicker picker="month" allowClear={false} value={month} onChange={value => value && setMonth(value)} />
          <Button icon={<ReloadOutlined />} loading={state.loading} onClick={() => void state.reload()}>刷新</Button>
        </Space>}
      />
      {state.error ? <PageError message={state.error.message} onRetry={() => void state.reload()} /> : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={12} lg={6}><StatCard title="浏览器样本" value={totalOf(browserRanks)} loading={state.loading} /></Col>
            <Col xs={12} lg={6}><StatCard title="操作系统样本" value={totalOf(osRanks)} color="#13c2c2" loading={state.loading} /></Col>
            <Col xs={12} lg={6}><StatCard title="设备样本" value={totalOf(deviceRanks)} color="#722ed1" loading={state.loading} /></Col>
            <Col xs={12} lg={6}><StatCard title="版本样本" value={totalOf(runtimeRanks)} color="#fa8c16" loading={state.loading} /></Col>
          </Row>
          <Card
            className="content-card section-gap"
            title="分布详情"
            extra={<Typography.Text type="secondary">更新时间：{lastUpdated || '-'}</Typography.Text>}
          >
            <Tabs items={[
              {
                key: 'browser',
                label: '浏览器',
                children: <Row gutter={[16, 16]}>
                  <Col xs={24} lg={12}>
                    <Card type="inner" title="浏览器占比 Top 10">
                      {state.loading ? <PageLoading /> : <EChart option={pieOption(browserRanks, '浏览器')} empty={!browserRanks.length} height={390} />}
                    </Card>
                  </Col>
                  <Col xs={24} lg={12}>
                    <Card
                      type="inner"
                      title="版本分布"
                      extra={<Select value={selectedBrowser || undefined} options={state.data.browsers.map(value => ({ value, label: value }))} onChange={setSelectedBrowser} style={{ width: 140 }} />}
                    >
                      {versionState.loading ? <PageLoading /> : <EChart option={versionOption} empty={!browserVersionData.length} height={390} />}
                    </Card>
                  </Col>
                  <Col span={24}>
                    <Table rowKey="name" dataSource={browserRanks} pagination={false} columns={[{ title: '排名', width: 70, render: (_value, _record, index) => index + 1 }, { title: '浏览器', dataIndex: 'name' }, { title: '数量', dataIndex: 'value' }, { title: '占比', dataIndex: 'percent' }]} />
                  </Col>
                </Row>
              },
              { key: 'os', label: '操作系统', children: <DistributionTab title="操作系统" data={osRanks} loading={state.loading} /> },
              { key: 'device', label: '设备', children: <DistributionTab title="设备" data={deviceRanks} loading={state.loading} alert="桌面端 UA 通常没有厂商和型号，设备分布更适合使用真实移动设备验证。" /> },
              { key: 'runtime', label: '业务版本', children: <DistributionTab title="业务版本" data={runtimeRanks} loading={state.loading} alert="版本数据来自 SDK 的 runtime_version 字段，需要服务端完成相应汇总任务。" /> }
            ]} />
          </Card>
        </>
      )}
    </>
  )
}
