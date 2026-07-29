import { DashboardOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import { Alert, Card, Col, DatePicker, Row, Table, Tooltip, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { performanceApi } from '@/api'
import EChart from '@/components/EChart'
import PageHeading from '@/components/PageHeading'
import { PageError, PageLoading } from '@/components/PageState'
import { useAsyncData } from '@/hooks/useAsyncData'
import type { PerformanceRecord } from '@/types/api'

const { RangePicker } = DatePicker

const metrics = [
  ['dom_ready_ms', 'DOM Ready'],
  ['first_render_ms', '首次渲染'],
  ['first_response_ms', '首次可交互'],
  ['first_tcp_ms', '首包时间'],
  ['load_complete_ms', '完全加载'],
  ['ssl_connect_ms', 'SSL 建连'],
  ['dns_lookup_ms', 'DNS 查询'],
  ['tcp_connect_ms', 'TCP 连接'],
  ['response_request_ms', '请求响应'],
  ['response_transfer_ms', '内容传输'],
  ['dom_parse_ms', 'DOM 解析'],
  ['load_resource_ms', '资源加载']
] as const

const waterfallMetrics = metrics.slice(6)

export default function PerformancePage() {
  const { id = '' } = useParams()
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('day'), dayjs()])
  const [selectedUrl, setSelectedUrl] = useState('')
  const params = useMemo(() => ({ st: range[0].valueOf(), et: range[1].valueOf() }), [range])
  const urlsState = useAsyncData(
    () => performanceApi.urls(id, { ...params, summaryBy: 'minute' }),
    [id, params],
    []
  )
  useEffect(() => {
    setSelectedUrl(current => urlsState.data.includes(current) ? current : (urlsState.data[0] ?? ''))
  }, [urlsState.data])
  const detailState = useAsyncData(async () => {
    if (!selectedUrl) return { overview: {}, line: [] as PerformanceRecord[] }
    const [overview, line] = await Promise.all([
      performanceApi.overview(id, { ...params, url: selectedUrl, summaryBy: 'hour' }),
      performanceApi.line(id, { ...params, url: selectedUrl, summaryBy: 'hour' })
    ])
    return { overview, line }
  }, [id, params, selectedUrl], { overview: {}, line: [] as PerformanceRecord[] })

  const lineOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', bottom: 0 },
    grid: { top: 28, left: 24, right: 24, bottom: 70, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: detailState.data.line.map(item => dayjs(Number(item.index_timestamp_ms)).format('MM-DD HH:mm')),
      axisLabel: { hideOverlap: true }
    },
    yAxis: { type: 'value', axisLabel: { formatter: '{value} ms' }, splitLine: { lineStyle: { color: '#edf1f6' } } },
    series: metrics.map(([key, name]) => ({
      type: 'line',
      name,
      data: detailState.data.line.map(item => Number(item[key] || 0)),
      showSymbol: false,
      smooth: true
    }))
  }), [detailState.data.line])

  let cumulative = 0
  const waterfall = waterfallMetrics.map(([key, name]) => {
    const duration = Number(detailState.data.overview[key] || 0)
    const item = { name, start: cumulative, duration }
    cumulative += duration
    return item
  })
  const waterfallOption = useMemo(() => ({
    color: ['transparent', '#1677ff'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (items: Array<{ seriesName: string; name: string; value: number }>) => {
        const duration = items.find(item => item.seriesName === '耗时')?.value ?? 0
        return `${items[0]?.name ?? ''}<br/>耗时：${duration} ms`
      }
    },
    grid: { top: 20, left: 24, right: 36, bottom: 20, containLabel: true },
    xAxis: { type: 'value', axisLabel: { formatter: '{value} ms' }, splitLine: { lineStyle: { color: '#edf1f6' } } },
    yAxis: { type: 'category', inverse: true, data: waterfall.map(item => item.name) },
    series: [
      { type: 'bar', name: '起点', stack: 'total', data: waterfall.map(item => item.start), itemStyle: { color: 'transparent' }, emphasis: { itemStyle: { color: 'transparent' } } },
      { type: 'bar', name: '耗时', stack: 'total', data: waterfall.map(item => item.duration), barMaxWidth: 24, itemStyle: { borderRadius: 4 }, label: { show: true, position: 'right', formatter: '{c} ms' } }
    ]
  }), [waterfall])

  return (
    <>
      <PageHeading title="页面性能" description="按 URL 查看十二项加载性能趋势与阶段瀑布图。" icon={<DashboardOutlined />} />
      <Card className="filter-card">
        <RangePicker
          showTime
          allowClear={false}
          value={range}
          disabledDate={date => date.isAfter(dayjs()) || date.isBefore(dayjs().subtract(7, 'day'), 'day')}
          onChange={value => {
            if (value?.[0] && value[1]) setRange([value[0], value[1]])
          }}
        />
      </Card>
      {urlsState.error ? <div className="section-gap"><PageError message={urlsState.error.message} onRetry={() => void urlsState.reload()} /></div> : (
        <Row gutter={[16, 16]} className="section-gap">
          <Col xs={24} xl={7}>
            <Card className="table-card" title="页面 URL">
              <Table
                rowKey={url => url}
                size="small"
                loading={urlsState.loading}
                dataSource={urlsState.data}
                pagination={{ pageSize: 12 }}
                rowClassName={url => url === selectedUrl ? 'selected-table-row' : ''}
                onRow={url => ({ onClick: () => setSelectedUrl(url), style: { cursor: 'pointer' } })}
                columns={[{ title: 'URL', ellipsis: true, render: url => <Typography.Text title={url}>{url}</Typography.Text> }]}
              />
            </Card>
          </Col>
          <Col xs={24} xl={17}>
            {!selectedUrl ? <Alert showIcon type="info" title="当前时间范围内没有可分析的 URL" /> : detailState.error ? (
              <PageError message={detailState.error.message} onRetry={() => void detailState.reload()} />
            ) : (
              <>
                <Card
                  className="chart-card"
                  title={<span>页面加载时间详情 <Tooltip title="数值单位为毫秒，曲线展示所选 URL 的各项 Navigation Timing 指标。"><QuestionCircleOutlined /></Tooltip></span>}
                  extra={<Typography.Text type="secondary" ellipsis style={{ maxWidth: 360 }}>{selectedUrl}</Typography.Text>}
                >
                  {detailState.loading ? <PageLoading /> : <EChart option={lineOption} empty={!detailState.data.line.length} height={430} />}
                </Card>
                <Card className="chart-card section-gap" title="页面加载瀑布图">
                  {detailState.loading ? <PageLoading /> : <EChart option={waterfallOption} empty={!waterfall.some(item => item.duration > 0)} height={390} />}
                </Card>
              </>
            )}
          </Col>
        </Row>
      )}
    </>
  )
}
