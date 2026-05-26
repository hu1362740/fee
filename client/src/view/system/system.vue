<template>
  <div>
    <Row style="margin-top: 20px;">
      <Card shadow>
        <p slot="title">系统环境分布</p>
        <div slot="extra">
          <DatePicker
            v-model="currentMonth"
            type="month"
            :clearable="false"
            placeholder="选择月份"
            format="yyyy-MM"
            style="width: 140px"
            @on-change="onMonthChange"
          />
        </div>

        <Tabs v-model="activeTab" @on-click="onTabChange">

          <!-- 浏览器分布 -->
          <TabPane label="浏览器分布" name="browser">
            <Row>
              <Col span="12">
                <Card :bordered="false">
                  <p slot="title">浏览器占比</p>
                  <div ref="browserPieChart" style="height: 360px;"></div>
                </Card>
              </Col>
              <Col span="12">
                <Card :bordered="false">
                  <p slot="title">
                    版本分布
                    <Select
                      v-model="selectedBrowser"
                      style="width: 130px; margin-left: 10px;"
                      size="small"
                      @on-change="onBrowserChange"
                    >
                      <Option v-for="b in browserList" :key="b" :value="b">{{ b }}</Option>
                    </Select>
                  </p>
                  <div ref="browserVersionChart" style="height: 360px;"></div>
                </Card>
              </Col>
            </Row>
            <Row style="margin-top: 16px;">
              <Card :bordered="false">
                <p slot="title">浏览器排名</p>
                <Table :columns="browserRankColumns" :data="browserRankData" />
              </Card>
            </Row>
          </TabPane>

          <!-- 操作系统分布 -->
          <TabPane label="操作系统分布" name="os">
            <Row>
              <Col span="12">
                <Card :bordered="false">
                  <p slot="title">操作系统占比</p>
                  <div ref="osPieChart" style="height: 360px;"></div>
                </Card>
              </Col>
              <Col span="12">
                <Card :bordered="false">
                  <p slot="title">操作系统版本排名</p>
                  <Table
                    :columns="osColumns"
                    :data="osTableData"
                    height="360"
                  />
                </Card>
              </Col>
            </Row>
          </TabPane>

          <!-- 设备分布 -->
          <TabPane label="设备分布" name="device">
            <Row>
              <Col span="12">
                <Card :bordered="false">
                  <p slot="title">设备厂商占比</p>
                  <div ref="devicePieChart" style="height: 360px;"></div>
                </Card>
              </Col>
              <Col span="12">
                <Card :bordered="false">
                  <p slot="title">设备型号排名</p>
                  <Table
                    :columns="deviceColumns"
                    :data="deviceTableData"
                    height="360"
                  />
                </Card>
              </Col>
            </Row>
          </TabPane>

        </Tabs>
      </Card>
    </Row>
  </div>
</template>

<script>
import moment from 'moment'
import _ from 'lodash'
import echarts from 'echarts'
import {
  getOsDistribution,
  getBrowserList,
  getBrowserDistribution,
  getBrowserDistributionByVersion,
  getDeviceDistribution
} from '@/api/system'

const PIE_OPTION = (data, title) => ({
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {c} ({d}%)'
  },
  legend: {
    type: 'scroll',
    orient: 'vertical',
    right: 10,
    top: 20,
    bottom: 20
  },
  series: [{
    name: title,
    type: 'pie',
    radius: ['0%', '65%'],
    center: ['40%', '50%'],
    data: data,
    label: { formatter: '{b}\n{d}%' },
    emphasis: {
      itemStyle: {
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowColor: 'rgba(0, 0, 0, 0.5)'
      }
    }
  }]
})

const BAR_OPTION = (data) => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: '3%', right: '8%', bottom: '3%', containLabel: true },
  xAxis: { type: 'value' },
  yAxis: {
    type: 'category',
    data: data.map(item => item.name),
    axisLabel: { interval: 0 }
  },
  series: [{
    type: 'bar',
    data: data.map(item => item.value),
    label: { show: true, position: 'right' }
  }]
})

export default {
  name: 'system',
  data () {
    return {
      activeTab: 'browser',
      currentMonth: moment().format('YYYY-MM'),

      // echarts 实例
      chartInstances: {},

      // 浏览器
      browserList: [],
      selectedBrowser: '',
      browserPieRawData: [],
      browserVersionRawData: [],
      browserRankColumns: [
        { title: '排名', type: 'index', align: 'center', width: 70 },
        { title: '浏览器', key: 'browser', align: 'center' },
        { title: '数量', key: 'total_count', align: 'center', sortable: true }
      ],
      browserRankData: [],

      // 操作系统
      osPieRawData: [],
      osColumns: [
        { title: '排名', type: 'index', align: 'center', width: 70 },
        { title: '系统', key: 'os', align: 'center' },
        { title: '版本', key: 'os_version', align: 'center' },
        { title: '数量', key: 'total_count', align: 'center', sortable: true }
      ],
      osTableData: [],

      // 设备
      devicePieRawData: [],
      deviceColumns: [
        { title: '排名', type: 'index', align: 'center', width: 70 },
        { title: '厂商', key: 'device_vendor', align: 'center' },
        { title: '型号', key: 'device_model', align: 'center' },
        { title: '数量', key: 'total_count', align: 'center', sortable: true }
      ],
      deviceTableData: []
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

    renderPieChart (refName, data, title) {
      const chart = this.getOrInitChart(refName)
      if (!chart) return
      chart.setOption(PIE_OPTION(data, title), true)
    },

    renderBarChart (refName, data) {
      const chart = this.getOrInitChart(refName)
      if (!chart) return
      chart.setOption(BAR_OPTION(data), true)
    },

    onMonthChange (month) {
      this.currentMonth = month
      this.loadTabData(this.activeTab)
    },

    onTabChange (name) {
      this.loadTabData(name)
      this.$nextTick(() => {
        const refMap = {
          browser: ['browserPieChart', 'browserVersionChart'],
          os: ['osPieChart'],
          device: ['devicePieChart']
        }
        ;(refMap[name] || []).forEach(refName => {
          if (this.chartInstances[refName]) {
            this.chartInstances[refName].resize()
          }
        })
      })
    },

    loadTabData (tab) {
      if (tab === 'browser') {
        this.loadBrowserData()
      } else if (tab === 'os') {
        this.loadOsData()
      } else if (tab === 'device') {
        this.loadDeviceData()
      }
    },

    async loadBrowserData () {
      const params = { month: this.currentMonth }

      const [listRes, allRes] = await Promise.all([
        getBrowserList(params),
        getBrowserDistributionByVersion(params)
      ])

      this.browserList = _.get(listRes, ['data'], [])
      if (this.browserList.length > 0 && !this.selectedBrowser) {
        this.selectedBrowser = this.browserList[0]
      }

      const allList = _.get(allRes, ['data'], [])
      const browserMap = {}
      for (let item of allList) {
        const browser = item.browser || '未知'
        browserMap[browser] = (browserMap[browser] || 0) + Number(item.total_count)
      }

      this.browserPieRawData = Object.keys(browserMap)
        .map(name => ({ name, value: browserMap[name] }))
        .sort((a, b) => b.value - a.value)

      this.browserRankData = this.browserPieRawData
        .map(item => ({ browser: item.name, total_count: item.value }))

      if (this.selectedBrowser) {
        await this.loadBrowserVersionData(this.selectedBrowser)
      }

      this.$nextTick(() => {
        this.renderPieChart('browserPieChart', this.browserPieRawData, '浏览器')
        this.renderBarChart('browserVersionChart', this.browserVersionRawData)
      })
    },

    async onBrowserChange (browser) {
      this.selectedBrowser = browser
      await this.loadBrowserVersionData(browser)
      this.$nextTick(() => {
        this.renderBarChart('browserVersionChart', this.browserVersionRawData)
      })
    },

    async loadBrowserVersionData (browser) {
      const res = await getBrowserDistribution({ month: this.currentMonth, q: browser })
      const list = _.get(res, ['data'], [])
      this.browserVersionRawData = list
        .map(item => ({ name: String(item.key || ''), value: Number(item.value || 0) }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    },

    async loadOsData () {
      const params = { month: this.currentMonth }
      const res = await getOsDistribution(params)
      const list = _.get(res, ['data'], [])

      const osMap = {}
      for (let item of list) {
        const osName = item.type || '未知'
        osMap[osName] = (osMap[osName] || 0) + Number(item.value)
      }

      this.osPieRawData = Object.keys(osMap)
        .map(name => ({ name, value: osMap[name] }))
        .sort((a, b) => b.value - a.value)

      this.osTableData = list
        .map(item => ({
          os: item.type || '未知',
          os_version: item.key || '',
          total_count: Number(item.value)
        }))
        .sort((a, b) => b.total_count - a.total_count)

      this.$nextTick(() => {
        this.renderPieChart('osPieChart', this.osPieRawData, '操作系统')
      })
    },

    async loadDeviceData () {
      const params = { month: this.currentMonth }
      const res = await getDeviceDistribution(params)
      const list = _.get(res, ['data'], [])

      const vendorMap = {}
      for (let item of list) {
        const vendor = item.type || '未知'
        vendorMap[vendor] = (vendorMap[vendor] || 0) + Number(item.value)
      }

      this.devicePieRawData = Object.keys(vendorMap)
        .map(name => ({ name, value: vendorMap[name] }))
        .sort((a, b) => b.value - a.value)

      this.deviceTableData = list
        .map(item => ({
          device_vendor: item.type || '未知',
          device_model: item.key || '',
          total_count: Number(item.value)
        }))
        .sort((a, b) => b.total_count - a.total_count)

      this.$nextTick(() => {
        this.renderPieChart('devicePieChart', this.devicePieRawData, '设备厂商')
      })
    }
  },

  async mounted () {
    await this.loadBrowserData()
  },

  beforeDestroy () {
    Object.values(this.chartInstances).forEach(chart => {
      if (chart) chart.dispose()
    })
  }
}
</script>

<style lang="less" scoped>
.ivu-card-no-border {
  box-shadow: none;
}
</style>
