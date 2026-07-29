import { EyeOutlined } from '@ant-design/icons'
import { Card, Col, Row, Table } from 'antd'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pvApi, uvApi } from '@/api'
import EChart from '@/components/EChart'
import PageHeading from '@/components/PageHeading'
import { PageError, PageLoading } from '@/components/PageState'
import StatCard from '@/components/StatCard'
import TimeRangeFilter from '@/components/TimeRangeFilter'
import { useAsyncData } from '@/hooks/useAsyncData'
import { rangeToValue, todayRange, type TimeRangeValue } from '@/utils/time'

export default function PvPage() {
  const { id = '' } = useParams()
  const [query, setQuery] = useState<TimeRangeValue>(() => rangeToValue(todayRange(), 'hour'))
  const { data, loading, error, reload } = useAsyncData(async () => {
    const params = { st: query.startMs, et: query.endMs }
    const [count, uvCount, trend] = await Promise.all([
      pvApi.count(id, params),
      uvApi.count(id, params),
      pvApi.trend(id, { ...params, filterBy: query.filterBy })
    ])
    return { count, uvCount, trend }
  }, [id, query], { count: 0, uvCount: 0, trend: [] })
  const ratio = data.uvCount ? (data.count / data.uvCount).toFixed(2) : '0.00'
  const option = useMemo(() => ({
    color: ['#fa8c16'],
    tooltip: { trigger: 'axis' },
    grid: { top: 28, left: 24, right: 24, bottom: 20, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: data.trend.map(item => item.key), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf1f6' } } },
    series: [{ type: 'line', name: 'PV', data: data.trend.map(item => item.value), smooth: true, areaStyle: { color: 'rgba(250,140,22,.1)' } }]
  }), [data.trend])
  return (
    <>
      <PageHeading title="PV 统计" description="查看页面访问总量、趋势及人均浏览深度。" icon={<EyeOutlined />} />
      <Card className="filter-card"><TimeRangeFilter showFilterBy onChange={setQuery} /></Card>
      {error ? <div className="section-gap"><PageError message={error.message} onRetry={() => void reload()} /></div> : (
        <>
          <Row gutter={[16, 16]} className="section-gap">
            <Col xs={24} md={8}><StatCard title="页面访问总量" value={data.count} color="#fa8c16" loading={loading} /></Col>
            <Col xs={24} md={8}><StatCard title="独立访客总量" value={data.uvCount} loading={loading} /></Col>
            <Col xs={24} md={8}><StatCard title="PV / UV" value={ratio} suffix="次/人" color="#722ed1" loading={loading} /></Col>
          </Row>
          <Card className="chart-card section-gap" title="PV 趋势">
            {loading ? <PageLoading /> : <EChart option={option} empty={!data.trend.length} />}
          </Card>
          <Card className="table-card section-gap" title="PV 明细">
            <Table rowKey={(item, index) => `${item.key}-${index}`} loading={loading} dataSource={data.trend} pagination={{ pageSize: 10 }} columns={[{ title: '时间', dataIndex: 'key' }, { title: 'PV', dataIndex: 'value' }]} />
          </Card>
        </>
      )}
    </>
  )
}
