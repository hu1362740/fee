import { ClockCircleOutlined } from '@ant-design/icons'
import { Card, Col, Row } from 'antd'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { behaviorApi } from '@/api'
import EChart from '@/components/EChart'
import PageHeading from '@/components/PageHeading'
import { PageError, PageLoading } from '@/components/PageState'
import StatCard from '@/components/StatCard'
import TimeRangeFilter from '@/components/TimeRangeFilter'
import { useAsyncData } from '@/hooks/useAsyncData'
import { millisecondsToText, rangeToValue, todayRange, type TimeRangeValue } from '@/utils/time'

export default function OnlineTimePage() {
  const { id = '' } = useParams()
  const [query, setQuery] = useState<TimeRangeValue>(() => rangeToValue(todayRange(), 'hour'))
  const { data, loading, error, reload } = useAsyncData(
    () => behaviorApi.online(id, { filterBy: query.filterBy, st: query.startMs, et: query.endMs }),
    [id, query],
    []
  )
  const average = data.length ? Math.round(data.reduce((sum, item) => sum + Number(item.value || 0), 0) / data.length) : 0
  const maximum = data.reduce((max, item) => Math.max(max, Number(item.value || 0)), 0)
  const option = useMemo(() => ({
    color: ['#13c2c2'],
    tooltip: {
      trigger: 'axis',
      formatter: (items: Array<{ axisValueLabel: string; value: number }>) =>
        `${items[0]?.axisValueLabel ?? ''}<br/>平均在线时长：${millisecondsToText(items[0]?.value ?? 0)}`
    },
    grid: { top: 35, left: 24, right: 24, bottom: 20, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: data.map(item => item.key), axisLabel: { hideOverlap: true } },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (value: number) => millisecondsToText(value) },
      splitLine: { lineStyle: { color: '#edf1f6' } }
    },
    series: [{
      type: 'line',
      name: '平均在线时长',
      data: data.map(item => Number(item.value || 0)),
      smooth: true,
      symbol: 'circle',
      symbolSize: 7,
      areaStyle: { color: 'rgba(19,194,194,.12)' }
    }]
  }), [data])

  return (
    <>
      <PageHeading title="在线时长" description="按时间粒度查看用户平均停留时长趋势。" icon={<ClockCircleOutlined />} />
      <Card className="filter-card"><TimeRangeFilter showFilterBy onChange={setQuery} /></Card>
      {error ? <div className="section-gap"><PageError message={error.message} onRetry={() => void reload()} /></div> : (
        <>
          <Row gutter={[16, 16]} className="section-gap">
            <Col xs={24} md={12}><StatCard title="所选周期平均时长" value={millisecondsToText(average)} loading={loading} /></Col>
            <Col xs={24} md={12}><StatCard title="峰值时长" value={millisecondsToText(maximum)} color="#13c2c2" loading={loading} /></Col>
          </Row>
          <Card className="chart-card section-gap" title="在线时长趋势">
            {loading ? <PageLoading /> : <EChart option={option} empty={!data.length} />}
          </Card>
        </>
      )}
    </>
  )
}
