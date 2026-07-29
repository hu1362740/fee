import { BugOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Card, Col, DatePicker, Input, Radio, Row, Select, Space, Table, Tabs, Tag } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { errorApi } from '@/api'
import EChart from '@/components/EChart'
import PageHeading from '@/components/PageHeading'
import { PageError, PageLoading } from '@/components/PageState'
import StatCard from '@/components/StatCard'
import { useAsyncData } from '@/hooks/useAsyncData'
import type { FilterBy } from '@/types/api'
import { errorSecondQuery } from '@/utils/apiAdapters'

const { RangePicker } = DatePicker

function parseExt(ext: unknown) {
  if (!ext || typeof ext !== 'object') return ext
  return Object.fromEntries(Object.entries(ext).map(([key, raw]) => {
    if (typeof raw !== 'string') return [key, raw]
    try {
      return [key, JSON.parse(raw)]
    } catch {
      return [key, raw]
    }
  }))
}

export default function ErrorDashboardPage() {
  const { id = '' } = useParams()
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('day'), dayjs().endOf('day')])
  const [selectedErrors, setSelectedErrors] = useState<string[]>([])
  const [prefix, setPrefix] = useState<string>()
  const [url, setUrl] = useState('')
  const [urlKeyword, setUrlKeyword] = useState('')
  const [filterBy, setFilterBy] = useState<Extract<FilterBy, 'hour' | 'minute'>>('hour')
  const [page, setPage] = useState(1)
  const seconds = useMemo(() => errorSecondQuery(range[0].valueOf(), range[1].valueOf()), [range])
  const summaryState = useAsyncData(
    () => errorApi.summary(id, seconds.start_at, seconds.end_at),
    [id, seconds],
    []
  )
  useEffect(() => {
    const available = new Set(summaryState.data.map(item => item.error_name))
    setSelectedErrors(current => {
      const retained = current.filter(item => available.has(item))
      return retained.length ? retained : summaryState.data.slice(0, 10).map(item => item.error_name)
    })
  }, [summaryState.data])
  const commonParams = useMemo(() => ({
    start_at: seconds.start_at,
    end_at: seconds.end_at,
    error_name_list_json: JSON.stringify(selectedErrors),
    url
  }), [seconds, selectedErrors, url])
  const dataState = useAsyncData(async () => {
    const [urls, trend, names, geography, logs] = await Promise.all([
      errorApi.urls(id, commonParams),
      errorApi.trend(id, { ...commonParams, count_type: filterBy }),
      errorApi.names(id, commonParams),
      errorApi.geography(id, commonParams),
      errorApi.logs(id, { ...commonParams, current_page: page })
    ])
    return { urls, trend, names, geography, logs }
  }, [id, commonParams, filterBy, page], {
    urls: [],
    trend: [],
    names: [],
    geography: [],
    logs: { list: [], pager: { current_page: 1, page_size: 10, total: 0 } }
  })
  const prefixes = useMemo(() => [...new Set(summaryState.data
    .map(item => item.error_name.includes('_') ? `${item.error_name.split('_')[0]}_` : '')
    .filter(Boolean))], [summaryState.data])
  const total = dataState.data.names.reduce((sum, item) => sum + Number(item.value || 0), 0)
  const maxGeo = Math.max(...dataState.data.geography.map(item => item.value), 1)
  const groupedTrend = useMemo(() => {
    const names = [...new Set(dataState.data.trend.map(item => item.name))]
    const indexes = [...new Set(dataState.data.trend.map(item => item.index_display))]
    return { names, indexes }
  }, [dataState.data.trend])
  const trendOption = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', bottom: 0 },
    grid: { top: 30, left: 24, right: 24, bottom: 70, containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: groupedTrend.indexes, axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf1f6' } } },
    series: groupedTrend.names.map(name => ({
      type: 'line',
      name,
      stack: 'errors',
      areaStyle: {},
      showSymbol: false,
      data: groupedTrend.indexes.map(index => dataState.data.trend.find(item => item.name === name && item.index_display === index)?.value ?? 0)
    }))
  }), [dataState.data.trend, groupedTrend])
  const pieOption = useMemo(() => ({
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 次（{d}%）' },
    legend: { type: 'scroll', orient: 'vertical', right: 8, top: 20, bottom: 20 },
    series: [{ type: 'pie', radius: ['42%', '72%'], center: ['40%', '50%'], data: dataState.data.names, label: { show: false }, emphasis: { label: { show: true } } }]
  }), [dataState.data.names])
  const mapOption = useMemo(() => ({
    tooltip: { trigger: 'item', formatter: '{b}：{c}' },
    visualMap: { min: 0, max: maxGeo, left: 10, bottom: 10, calculable: true, inRange: { color: ['#fff1f0', '#ff7875', '#a8071a'] } },
    series: [{ type: 'map', map: 'china', roam: true, data: dataState.data.geography }]
  }), [dataState.data.geography, maxGeo])

  const refresh = async () => {
    await summaryState.reload()
    await dataState.reload()
  }

  return (
    <>
      <PageHeading
        title="错误看板"
        description="从错误类型、URL、趋势、占比、地域和原始日志多维定位异常。"
        icon={<BugOutlined />}
        extra={<Button icon={<ReloadOutlined />} onClick={() => void refresh()}>刷新</Button>}
      />
      <Card className="filter-card">
        <Space wrap size={12}>
          <RangePicker
            allowClear={false}
            value={range}
            disabledDate={date => date.isAfter(dayjs(), 'day') || date.isBefore(dayjs().subtract(7, 'day'), 'day')}
            onChange={value => {
              if (value?.[0] && value[1]) {
                setRange([value[0].startOf('day'), value[1].endOf('day')])
                setPage(1)
              }
            }}
          />
          <Select
            allowClear
            showSearch
            placeholder="按错误前缀筛选"
            value={prefix}
            options={prefixes.map(value => ({ value, label: value }))}
            style={{ width: 210 }}
            onChange={value => {
              setPrefix(value)
              if (value) setSelectedErrors(summaryState.data.filter(item => item.error_name.startsWith(value)).map(item => item.error_name))
            }}
          />
          <Select
            mode="multiple"
            allowClear
            showSearch
            maxTagCount="responsive"
            placeholder="选择错误类型"
            value={selectedErrors}
            loading={summaryState.loading}
            options={summaryState.data.map(item => ({ value: item.error_name, label: `${item.error_name} (${item.error_count})` }))}
            style={{ minWidth: 320, flex: 1 }}
            onChange={value => { setSelectedErrors(value); setPage(1) }}
          />
        </Space>
      </Card>
      {summaryState.error || dataState.error ? (
        <div className="section-gap"><PageError message={(summaryState.error || dataState.error)?.message} onRetry={() => void refresh()} /></div>
      ) : (
        <>
          <Row gutter={[16, 16]} className="section-gap">
            <Col xs={24} md={8}><StatCard title="当前错误总量" value={total} color="#cf1322" loading={dataState.loading} /></Col>
            <Col xs={24} md={8}><StatCard title="错误类型数" value={dataState.data.names.length} color="#fa541c" loading={dataState.loading} /></Col>
            <Col xs={24} md={8}><StatCard title="受影响 URL" value={dataState.data.urls.length} loading={dataState.loading} /></Col>
          </Row>
          <Row gutter={[16, 16]} className="section-gap">
            <Col xs={24} xl={7}>
              <Card className="table-card" title="URL 分布">
                <Input.Search allowClear placeholder="在表中查找 URL" value={urlKeyword} onChange={event => setUrlKeyword(event.target.value)} style={{ marginBottom: 12 }} />
                <Table
                  rowKey="name"
                  size="small"
                  loading={dataState.loading}
                  dataSource={dataState.data.urls.filter(item => item.name.toLowerCase().includes(urlKeyword.trim().toLowerCase()))}
                  pagination={{ pageSize: 10 }}
                  rowClassName={record => record.name === url ? 'selected-table-row' : ''}
                  onRow={record => ({ onClick: () => { setUrl(current => current === record.name ? '' : record.name); setPage(1) }, style: { cursor: 'pointer' } })}
                  columns={[{ title: '数量', dataIndex: 'value', width: 80 }, { title: 'URL', dataIndex: 'name', ellipsis: true }]}
                />
              </Card>
            </Col>
            <Col xs={24} xl={17}>
              <Card className="chart-card">
                <Tabs
                  items={[
                    {
                      key: 'trend',
                      label: '错误趋势',
                      children: <>
                        <Radio.Group value={filterBy} optionType="button" buttonStyle="solid" onChange={event => setFilterBy(event.target.value)}>
                          <Radio.Button value="hour">小时</Radio.Button>
                          <Radio.Button value="minute">分钟</Radio.Button>
                        </Radio.Group>
                        {dataState.loading ? <PageLoading /> : <EChart option={trendOption} empty={!dataState.data.trend.length} height={440} />}
                      </>
                    },
                    {
                      key: 'pie',
                      label: '错误占比',
                      children: dataState.loading ? <PageLoading /> : <EChart option={pieOption} empty={!dataState.data.names.length} height={470} />
                    },
                    {
                      key: 'map',
                      label: '地域分布',
                      children: <Row gutter={12}>
                        <Col xs={24} lg={16}>{dataState.loading ? <PageLoading /> : <EChart option={mapOption} empty={!dataState.data.geography.length} chinaMap height={470} />}</Col>
                        <Col xs={24} lg={8}><Table rowKey="name" size="small" dataSource={[...dataState.data.geography].sort((a, b) => b.value - a.value)} pagination={{ pageSize: 10 }} columns={[{ title: '省份', dataIndex: 'name' }, { title: '次数', dataIndex: 'value' }]} /></Col>
                      </Row>
                    }
                  ]}
                />
              </Card>
            </Col>
          </Row>
          <Card className="table-card section-gap" title="错误日志">
            <Table
              rowKey={(record, index) => String(record.id ?? `${record.log_at}-${index}`)}
              loading={dataState.loading}
              dataSource={dataState.data.logs.list}
              scroll={{ x: 980 }}
              pagination={{
                current: Number(dataState.data.logs.pager.current_page || page),
                pageSize: dataState.data.logs.pager.page_size,
                total: dataState.data.logs.pager.total,
                showTotal: value => `共 ${value} 条`,
                onChange: setPage
              }}
              expandable={{
                expandedRowRender: record => <pre className="json-preview">{JSON.stringify(parseExt(record.ext), null, 2)}</pre>,
                rowExpandable: record => Boolean(record.ext)
              }}
              columns={[
                { title: '时间', dataIndex: 'log_at', width: 180, render: value => dayjs.unix(Number(value)).format('YYYY-MM-DD HH:mm:ss') },
                { title: '错误名称', dataIndex: 'error_name', width: 220, render: value => <Tag color="red">{value}</Tag> },
                { title: 'URL', dataIndex: 'url', ellipsis: true },
                { title: 'HTTP', dataIndex: 'http_code', width: 80, render: value => value || '-' },
                { title: '地域', width: 150, render: (_, record) => `${record.province ?? ''} ${record.city ?? ''}`.trim() || '-' }
              ]}
            />
          </Card>
        </>
      )}
    </>
  )
}
