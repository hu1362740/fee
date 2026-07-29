import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import {
  BarChart,
  LineChart,
  MapChart,
  PieChart,
  ScatterChart
} from 'echarts/charts'
import {
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent
} from 'echarts/components'
import { LabelLayout, UniversalTransition } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'
import { EmptyChart } from './PageState'

echarts.use([
  BarChart,
  LineChart,
  MapChart,
  PieChart,
  ScatterChart,
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
  LabelLayout,
  UniversalTransition,
  CanvasRenderer
])

let chinaMapPromise: Promise<void> | null = null

async function ensureChinaMap() {
  if (echarts.getMap('china')) return
  if (!chinaMapPromise) {
    chinaMapPromise = fetch('/map/china.json')
      .then(response => {
        if (!response.ok) throw new Error('地图资源加载失败')
        return response.json()
      })
      .then(geoJson => {
        echarts.registerMap('china', geoJson)
      })
  }
  return chinaMapPromise
}

interface EChartProps {
  option: EChartsOption | Record<string, unknown>
  height?: number
  empty?: boolean
  emptyText?: string
  chinaMap?: boolean
  className?: string
}

export default function EChart({
  option,
  height = 360,
  empty = false,
  emptyText,
  chinaMap = false,
  className
}: EChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [mapReady, setMapReady] = useState(!chinaMap)

  useEffect(() => {
    if (!chinaMap) return
    void ensureChinaMap().then(() => setMapReady(true))
  }, [chinaMap])

  useEffect(() => {
    if (!ref.current || empty || !mapReady) return
    const chart = echarts.init(ref.current)
    chartRef.current = chart
    chart.setOption(option as EChartsOption, true)
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [empty, mapReady])

  useEffect(() => {
    if (!empty && mapReady) chartRef.current?.setOption(option as EChartsOption, true)
  }, [empty, mapReady, option])

  if (empty) return <EmptyChart description={emptyText} />
  return <div ref={ref} className={className} style={{ width: '100%', height }} aria-label="数据图表" />
}
