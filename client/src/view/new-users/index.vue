<template>
  <div>
    <Row>
      <Card shadow>
        <p slot="title">新增用户({{title}})</p>
        <time-bar :disabledMinute="true"
                  :displayTypeItem="true"
                  @change='dateChange'>
          <Cascader style="margin-left:-70px !important;width:100px"
                    :clearable="false"
                    :data="city"
                    v-model="selectCity"
                    change-on-select
                    @on-change="cityChange"
                    slot="left"></Cascader>
        </time-bar>
        <div ref="lineChart" style="height:350px;width:100%"></div>
      </Card>
    </Row>
    <Row>
      <Col span="14">
      <Card shadow>
        <p slot="title">省分布</p>
        <div ref="mapChart" style="height:400px;width:100%"></div>
      </Card>
      </Col>
      <Col span="10">
      <Card shadow>
        <p slot="title">省排名</p>
        <Table :columns='columns'
               :data='tableData'
               height=400 />
      </Card>
      </Col>
    </Row>
  </div>
</template>
<script>
import moment from 'moment'
import _ from 'lodash'
import echarts from 'echarts'
import 'echarts/map/js/china'
import { getNewUsersByLine, getNewUsersByMap } from '@/api/behavior'
import TimeBar from '@/view/components/time-bar'
import city from './city'

export default {
  components: {
    TimeBar
  },
  data () {
    return {
      title: '全国',
      city,
      selectCity: ['全国'],
      lineTimeParam: {},
      chartInstances: {},
      lineRawData: [],
      mapRawData: [],
      columns: [
        { title: '排名', type: 'index', align: 'center' },
        { title: '省份', key: 'name', align: 'center' },
        { title: '数量', key: 'value', align: 'center' }
      ],
      tableData: []
    }
  },
  methods: {
    getOrInitChart (refName) {
      if (!this.$refs[refName]) return null
      if (!this.chartInstances[refName]) {
        this.chartInstances[refName] = echarts.init(this.$refs[refName])
      }
      return this.chartInstances[refName]
    },
    renderLineChart () {
      const chart = this.getOrInitChart('lineChart')
      if (!chart) return
      const xData = this.lineRawData.map(d => d.key)
      const yData = this.lineRawData.map(d => d.value)
      chart.setOption({
        tooltip: {
          trigger: 'axis',
          formatter (params) {
            if (params[0]) return `日期：${params[0].name}<br/>人次：${params[0].value}`
          }
        },
        xAxis: { type: 'category', data: xData, axisLabel: { rotate: 30 } },
        yAxis: { type: 'value' },
        series: [{ type: 'line', data: yData, smooth: true }]
      }, true)
    },
    renderMapChart () {
      const chart = this.getOrInitChart('mapChart')
      if (!chart) return
      const maxVal = Math.max(...this.mapRawData.map(d => d.value), 1)
      chart.setOption({
        tooltip: { trigger: 'item', formatter: '{b}: {c}' },
        visualMap: {
          min: 0,
          max: maxVal,
          text: ['高', '低'],
          realtime: false,
          calculable: true,
          inRange: { color: ['#e0f3f8', '#74add1', '#313695'] }
        },
        series: [{ type: 'map', map: 'china', roam: false, data: this.mapRawData }]
      }, true)
    },
    async dateChange (fromChildObj) {
      this.$set(this.lineTimeParam, 'st', moment(moment(fromChildObj.dateRange[0]).format('YYYY/MM/DD 00:00:00'), 'YYYY/MM/DD HH:mm:ss').unix() * 1000)
      this.$set(this.lineTimeParam, 'et', moment(moment(fromChildObj.dateRange[1]).format('YYYY/MM/DD 23:59:59'), 'YYYY/MM/DD HH:mm:ss').unix() * 1000)
      this.$set(this.lineTimeParam, 'filterBy', fromChildObj.filterBy)
      await this.getLineData()
      await this.getMapData()
    },
    async cityChange (value) {
      const cityLength = value.length
      let type = 'country'
      let country = '中国'
      let city = ''
      let province = value[0]
      let title = province
      if (cityLength === 2) {
        city = value[1]
        title += '/' + city
        type = 'city'
      } else {
        if (province === '全国') {
          type = 'country'
        } else {
          type = 'province'
        }
      }
      this.lineTimeParam['country'] = country
      this.lineTimeParam['city'] = city
      this.lineTimeParam['province'] = province
      this.lineTimeParam['type'] = type
      await this.getLineData()
      this.title = title
    },
    async getLineData () {
      const res = await getNewUsersByLine(this.lineTimeParam)
      this.lineRawData = _.get(res, ['data'], [])
      this.$nextTick(() => { this.renderLineChart() })
    },
    async getMapData () {
      const params = {
        st: this.lineTimeParam.st,
        et: this.lineTimeParam.et,
        field: 'province'
      }
      let mapData = await getNewUsersByMap(params)
      const list = _.get(mapData, ['data'], [])
      this.mapRawData = list.map(item => ({ name: item.name, value: item.value }))
      this.tableData = list.sort((item1, item2) => item2.value - item1.value)
      this.$nextTick(() => { this.renderMapChart() })
    }
  },
  async mounted () {
    this.lineTimeParam = {
      filterBy: 'hour',
      st: moment(moment().format('YYYY/MM/DD 00:00:00'), 'YYYY/MM/DD HH:mm:ss').unix() * 1000,
      et: moment(moment().format('YYYY/MM/DD 23:59:59'), 'YYYY/MM/DD HH:mm:ss').unix() * 1000,
      type: 'country',
      country: '中国',
      province: '全国',
      city: ''
    }
    await this.getLineData()
    await this.getMapData()
  },
  beforeDestroy () {
    Object.values(this.chartInstances).forEach(chart => {
      if (chart) chart.dispose()
    })
  }
}
</script>

<style lang="less" scoped>
.count-style {
  font-size: 50px;
}
</style>
