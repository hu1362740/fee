import { TeamOutlined } from '@ant-design/icons'
import { Card, Col, Row, Table } from 'antd'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { uvApi } from '@/api'
import EChart from '@/components/EChart'
import PageHeading from '@/components/PageHeading'
import { PageError, PageLoading } from '@/components/PageState'
import StatCard from '@/components/StatCard'
import TimeRangeFilter from '@/components/TimeRangeFilter'
import { useAsyncData } from '@/hooks/useAsyncData'
import { rangeToValue, todayRange, type TimeRangeValue } from '@/utils/time'

export default function UvPage() {
  const { id = '' } = useParams()
  const [query, setQuery] = useState<TimeRangeValue>(() => rangeToValue(todayRange(), 'hour'))
  const { data, loading, error, reload } = useAsyncData(async () => {
    const params = { st: query.startMs, et: query.endMs }
    const [count, trend] = await Promise.all([uvApi.count(id, params), uvApi.trend(id, { ...params, filterBy: query.filterBy })])
    return { count, trend }
  }, [id, query], { count: 0, trend: [] })
  const peak = data.trend.reduce((max, item) => Math.max(max, Number(item.value || 0)), 0)
  const option = useMemo(() => ({
    color: ['#1677ff'],
    tooltip: { trigger: 'axis' },
    grid: { top: 28, left: 24, right: 24, bottom: 20, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: data.trend.map(item => item.key), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf1f6' } } },
    series: [{ type: 'line', name: 'UV', data: data.trend.map(item => item.value), smooth: true, areaStyle: { color: 'rgba(22,119,255,.1)' } }]
  }), [data.trend])
  return (
    <>
      <PageHeading title="UV 统计" description="查看独立访客总量、趋势与时间明细。" icon={<TeamOutlined />} />
      <Card className="filter-card"><TimeRangeFilter showFilterBy onChange={setQuery} /></Card>
      {error ? <div className="section-gap"><PageError message={error.message} onRetry={() => void reload()} /></div> : (
        <>
          <Row gutter={[16, 16]} className="section-gap">
            <Col xs={24} md={12}><StatCard title="独立访客总量" value={data.count} loading={loading} /></Col>
            <Col xs={24} md={12}><StatCard title="单周期峰值" value={peak} color="#52c41a" loading={loading} /></Col>
          </Row>
          <Card className="chart-card section-gap" title="UV 趋势">
            {loading ? <PageLoading /> : <EChart option={option} empty={!data.trend.length} />}
          </Card>
          <Card className="table-card section-gap" title="UV 明细">
            <Table rowKey={(item, index) => `${item.key}-${index}`} loading={loading} dataSource={data.trend} pagination={{ pageSize: 10 }} columns={[{ title: '时间', dataIndex: 'key' }, { title: 'UV', dataIndex: 'value' }]} />
          </Card>
        </>
      )}
    </>
  )
}
