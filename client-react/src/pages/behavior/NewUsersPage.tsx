import { EnvironmentOutlined } from '@ant-design/icons'
import { Card, Col, Input, Row, Select, Space, Table, Typography } from 'antd'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { behaviorApi } from '@/api'
import EChart from '@/components/EChart'
import PageHeading from '@/components/PageHeading'
import { PageError, PageLoading } from '@/components/PageState'
import TimeRangeFilter from '@/components/TimeRangeFilter'
import { useAsyncData } from '@/hooks/useAsyncData'
import { rangeToValue, todayRange, type TimeRangeValue } from '@/utils/time'

const provinces = [
  '全国', '北京', '天津', '上海', '重庆', '河北', '河南', '云南', '辽宁', '黑龙江', '湖南', '安徽',
  '山东', '新疆', '江苏', '浙江', '江西', '湖北', '广西', '甘肃', '山西', '内蒙古', '陕西', '吉林',
  '福建', '贵州', '广东', '青海', '西藏', '四川', '宁夏', '海南', '台湾', '香港', '澳门'
]

export default function NewUsersPage() {
  const { id = '' } = useParams()
  const [query, setQuery] = useState<TimeRangeValue>(() => rangeToValue(todayRange(), 'hour'))
  const [province, setProvince] = useState('全国')
  const [city, setCity] = useState('')
  const { data, loading, error, reload } = useAsyncData(async () => {
    const common = { st: query.startMs, et: query.endMs }
    const [line, map] = await Promise.all([
      behaviorApi.newUserLine(id, {
        ...common,
        filterBy: query.filterBy,
        country: '中国',
        province,
        city,
        type: city ? 'city' : province === '全国' ? 'country' : 'province'
      }),
      behaviorApi.newUserMap(id, { ...common, field: 'province' })
    ])
    return { line, map }
  }, [id, query, province, city], { line: [], map: [] })
  const ranking = useMemo(() => [...data.map].sort((a, b) => b.value - a.value), [data.map])
  const lineOption = useMemo(() => ({
    color: ['#722ed1'],
    tooltip: { trigger: 'axis' },
    grid: { top: 28, left: 24, right: 24, bottom: 20, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: data.line.map(item => item.key), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf1f6' } } },
    series: [{ type: 'line', name: '新增用户', data: data.line.map(item => item.value), smooth: true, areaStyle: { color: 'rgba(114,46,209,.1)' } }]
  }), [data.line])
  const max = Math.max(...ranking.map(item => item.value), 1)
  const mapOption = useMemo(() => ({
    tooltip: { trigger: 'item', formatter: '{b}：{c}' },
    visualMap: { min: 0, max, left: 12, bottom: 10, calculable: true, inRange: { color: ['#e6f4ff', '#69b1ff', '#0958d9'] } },
    series: [{ type: 'map', map: 'china', roam: true, data: data.map, emphasis: { label: { show: true } } }]
  }), [data.map, max])

  return (
    <>
      <PageHeading title="新增用户" description="查看新增用户趋势与全国地域分布。" icon={<EnvironmentOutlined />} />
      <Card className="filter-card">
        <Space wrap size={16}>
          <TimeRangeFilter showFilterBy onChange={setQuery} />
          <Space>
            <Typography.Text type="secondary">地域</Typography.Text>
            <Select
              showSearch
              value={province}
              options={provinces.map(value => ({ value, label: value }))}
              onChange={value => {
                setProvince(value)
                if (value === '全国') setCity('')
              }}
              style={{ width: 130 }}
            />
            <Input
              allowClear
              value={city}
              disabled={province === '全国'}
              placeholder="输入城市（可选）"
              onChange={event => setCity(event.target.value.trim())}
              style={{ width: 160 }}
            />
          </Space>
        </Space>
      </Card>
      {error ? <div className="section-gap"><PageError message={error.message} onRetry={() => void reload()} /></div> : (
        <>
          <Card className="chart-card section-gap" title={`${province}${city ? ` / ${city}` : ''}新增用户趋势`}>
            {loading ? <PageLoading /> : <EChart option={lineOption} empty={!data.line.length} />}
          </Card>
          <Row gutter={[16, 16]} className="section-gap">
            <Col xs={24} xl={15}>
              <Card className="chart-card" title="新增用户地域分布">
                {loading ? <PageLoading /> : <EChart option={mapOption} empty={!data.map.length} chinaMap height={500} />}
              </Card>
            </Col>
            <Col xs={24} xl={9}>
              <Card className="table-card" title="省份排名">
                <Table
                  rowKey="name"
                  size="small"
                  loading={loading}
                  dataSource={ranking}
                  pagination={{ pageSize: 10, hideOnSinglePage: true }}
                  columns={[
                    { title: '排名', width: 70, render: (_value, _record, index) => index + 1 },
                    { title: '省份', dataIndex: 'name' },
                    { title: '新增用户', dataIndex: 'value', sorter: (a, b) => a.value - b.value }
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </>
  )
}
