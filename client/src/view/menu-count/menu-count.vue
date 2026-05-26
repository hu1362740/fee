<template>
  <div>
    <Row style='margin-top: 20px;'>
      <Card shadow>
        <div ref="barChart" style="width:100%;height:600px"></div>
      </Card>
    </Row>
  </div>
</template>

<script>
  import echarts from 'echarts'
  import { getMenuCount } from '@/api/behavior'

  export default {
    name: 'home',
    components: {},
    data () {
      return {
        chartInstance: null,
        rawData: []
      }
    },
    mounted () {
      this.fetchData()
    },
    methods: {
      renderBarChart () {
        if (!this.$refs.barChart) return
        if (!this.chartInstance) {
          this.chartInstance = echarts.init(this.$refs.barChart)
        }
        // 初始区域最多展示30条记录
        const MAX_DISPLAY_RECORD = 30
        const sorted = this.rawData.slice().sort((a, b) => b.totalCount - a.totalCount)
        const names = sorted.map(d => d.menuName)
        const values = sorted.map(d => d.totalCount)
        const recordListLength = names.length
        let showEndPercent = 0 // 从100 => 0
        if (recordListLength > MAX_DISPLAY_RECORD) {
          showEndPercent = 100 - Math.floor(MAX_DISPLAY_RECORD / recordListLength * 100) % 100
        }
        this.chartInstance.setOption({
          title: { show: true, text: '近一周菜单点击量' },
          tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
          grid: { left: '3%', right: '10%', containLabel: true },
          xAxis: { type: 'value', name: 'PV' },
          yAxis: {
            type: 'category',
            data: names,
            axisLabel: { show: true, interval: 0 }
          },
          dataZoom: [{
            type: 'slider',
            show: true,
            yAxisIndex: [0],
            left: '0%',
            start: 100,
            end: showEndPercent,
            showDetail: false
          }],
          series: [{ type: 'bar', data: values, label: { show: true, position: 'right' } }]
        }, true)
      },
      async fetchData () {
        const res = await getMenuCount()
        this.rawData = res.data || []
        this.$nextTick(() => { this.renderBarChart() })
      }
    },
    beforeDestroy () {
      if (this.chartInstance) this.chartInstance.dispose()
    }
  }
</script>

<style lang='less' scoped>
  .count-style {
    font-size: 50px
  }
</style>
