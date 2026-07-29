import { AlertOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Card, Col, Input, Row, Table, Tag } from 'antd'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { alarmApi } from '@/api'
import EChart from '@/components/EChart'
import PageHeading from '@/components/PageHeading'
import { PageError, PageLoading } from '@/components/PageState'
import StatCard from '@/components/StatCard'
import TimeRangeFilter from '@/components/TimeRangeFilter'
import { useAsyncData } from '@/hooks/useAsyncData'
import { alarmTimeQueries } from '@/utils/apiAdapters'
import { rangeToValue, todayRange, type TimeRangeValue } from '@/utils/time'

export default function AlarmLogPage() {
  const { id = '' } = useParams()
  const [query, setQuery] = useState<TimeRangeValue>(() => rangeToValue(todayRange(), 'hour'))
  const [keyword, setKeyword] = useState('')
  const state = useAsyncData(async () => {
    const times = alarmTimeQueries(query.startMs, query.endMs)
    const [logs, trend] = await Promise.all([
      alarmApi.logs(id, times.list),
      alarmApi.trend(id, times.trend)
    ])
    return { logs, trend }
  }, [id, query], { logs: [], trend: [] })
  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return state.data.logs
    return state.data.logs.filter(item => [item.config_id, item.error_name, item.message, item.send_at]
      .join(' ').toLowerCase().includes(q))
  }, [keyword, state.data.logs])
  const configCount = new Set(filtered.map(item => item.config_id)).size
  const errorCount = new Set(filtered.map(item => item.error_name)).size
  const option = useMemo(() => ({
    color: ['#ff4d4f'],
    tooltip: { trigger: 'axis' },
    grid: { top: 28, left: 24, right: 24, bottom: 20, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: state.data.trend.map(item => item.index || item.name), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf1f6' } } },
    series: [{ type: 'line', name: '报警次数', data: state.data.trend.map(item => item.value), smooth: true, areaStyle: { color: 'rgba(255,77,79,.12)' } }]
  }), [state.data.trend])

  return (
    <>
      <PageHeading
        title="报警日志"
        description="查看报警触发趋势、汇总指标和完整消息明细。"
        icon={<AlertOutlined />}
        extra={<Button icon={<ReloadOutlined />} onClick={() => void state.reload()}>刷新</Button>}
      />
      <Card className="filter-card"><TimeRangeFilter disableThirty onChange={setQuery} /></Card>
      {state.error ? <div className="section-gap"><PageError message={state.error.message} onRetry={() => void state.reload()} /></div> : (
        <>
          <Row gutter={[16, 16]} className="section-gap">
            <Col xs={24} md={8}><StatCard title="报警总数" value={filtered.length} color="#ff4d4f" loading={state.loading} /></Col>
            <Col xs={24} md={8}><StatCard title="涉及规则数" value={configCount} loading={state.loading} /></Col>
            <Col xs={24} md={8}><StatCard title="错误类型数" value={errorCount} color="#fa8c16" loading={state.loading} /></Col>
          </Row>
          <Card className="chart-card section-gap" title="报警趋势">
            {state.loading ? <PageLoading /> : <EChart option={option} empty={!state.data.trend.length} height={420} />}
          </Card>
          <Card
            className="table-card section-gap"
            title="报警明细"
            extra={<Input allowClear prefix={<SearchOutlined />} placeholder="搜索错误名、消息或配置 ID" value={keyword} onChange={event => setKeyword(event.target.value)} style={{ width: 290 }} />}
          >
            <Table
              rowKey={(record, index) => String(record.id ?? `${record.config_id}-${record.send_at}-${index}`)}
              loading={state.loading}
              dataSource={filtered}
              scroll={{ x: 950 }}
              pagination={{ pageSize: 10, showTotal: total => `共 ${total} 条` }}
              expandable={{ expandedRowRender: record => <pre className="json-preview">{record.message || '无消息内容'}</pre> }}
              columns={[
                { title: '报警时间', dataIndex: 'send_at', width: 180, render: value => dayjs.unix(Number(value)).format('YYYY-MM-DD HH:mm:ss') },
                { title: '配置 ID', dataIndex: 'config_id', width: 100 },
                { title: '错误名称', dataIndex: 'error_name', width: 230, render: value => <Tag color="red">{value}</Tag> },
                { title: '报警内容', dataIndex: 'message', ellipsis: true }
              ]}
            />
          </Card>
        </>
      )}
    </>
  )
}
