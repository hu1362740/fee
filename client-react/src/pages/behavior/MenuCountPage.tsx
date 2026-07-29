import { BarChartOutlined } from '@ant-design/icons'
import { Card, Table } from 'antd'
import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { behaviorApi } from '@/api'
import EChart from '@/components/EChart'
import PageHeading from '@/components/PageHeading'
import { PageError, PageLoading } from '@/components/PageState'
import { useAsyncData } from '@/hooks/useAsyncData'

interface MenuItem {
  menuCode: string
  menuName: string
  menuUrl: string
  totalCount: number
}

export default function MenuCountPage() {
  const { id = '' } = useParams()
  const { data, loading, error, reload } = useAsyncData(() => behaviorApi.menu(id), [id], [] as MenuItem[])
  const sorted = useMemo(() => [...data].sort((a, b) => b.totalCount - a.totalCount), [data])
  const option = useMemo(() => ({
    color: ['#1677ff'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { top: 20, left: 24, right: 40, bottom: 20, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#edf1f6' } } },
    yAxis: {
      type: 'category',
      inverse: true,
      data: sorted.map(item => item.menuName || item.menuCode),
      axisLabel: { width: 180, overflow: 'truncate' }
    },
    dataZoom: sorted.length > 12 ? [{ type: 'inside', yAxisIndex: 0 }, { type: 'slider', yAxisIndex: 0, right: 0 }] : [],
    series: [{
      type: 'bar',
      data: sorted.map(item => item.totalCount),
      barMaxWidth: 22,
      itemStyle: { borderRadius: [0, 5, 5, 0] },
      label: { show: true, position: 'right' }
    }]
  }), [sorted])

  return (
    <>
      <PageHeading title="菜单点击量" description="近七日菜单访问次数排名，帮助识别高频功能。" icon={<BarChartOutlined />} />
      {error ? <PageError message={error.message} onRetry={() => void reload()} /> : (
        <>
          <Card className="chart-card" title="近七日点击排名">
            {loading ? <PageLoading /> : <EChart option={option} empty={!sorted.length} height={Math.max(360, Math.min(sorted.length * 36, 680))} />}
          </Card>
          <Card className="table-card section-gap" title="菜单明细">
            <Table
              rowKey={record => `${record.menuCode}-${record.menuUrl}`}
              loading={loading}
              dataSource={sorted}
              scroll={{ x: 720 }}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              columns={[
                { title: '菜单名称', dataIndex: 'menuName', render: value => value || '-' },
                { title: '菜单编码', dataIndex: 'menuCode', render: value => value || '-' },
                { title: '菜单地址', dataIndex: 'menuUrl', ellipsis: true, render: value => value || '-' },
                { title: '点击次数', dataIndex: 'totalCount', sorter: (a, b) => a.totalCount - b.totalCount }
              ]}
            />
          </Card>
        </>
      )}
    </>
  )
}
