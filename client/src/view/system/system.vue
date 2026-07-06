<template>
  <div class="system-overview-page">
    <Card shadow>
      <div class="page-toolbar">
        <div>
          <h3>系统环境分布</h3>
          <p>按月汇总浏览器、操作系统、设备和业务版本样本</p>
        </div>
        <div class="toolbar-actions">
          <DatePicker
            v-model="currentMonth"
            type="month"
            :clearable="false"
            placeholder="选择月份"
            format="yyyy-MM"
            style="width: 140px"
            @on-change="onMonthChange"
          />
          <Button
            icon="md-refresh"
            :loading="isRefreshing"
            @click="refreshAll"
          >刷新</Button>
        </div>
      </div>
    </Card>

    <Row
      :gutter="16"
      class="summary-row"
    >
      <Col span="6">
        <Card shadow>
          <div class="summary-item">
            <span>浏览器样本</span>
            <strong>{{ browserTotal }}</strong>
          </div>
        </Card>
      </Col>
      <Col span="6">
        <Card shadow>
          <div class="summary-item">
            <span>操作系统样本</span>
            <strong>{{ osTotal }}</strong>
          </div>
        </Card>
      </Col>
      <Col span="6">
        <Card shadow>
          <div class="summary-item">
            <span>设备样本</span>
            <strong>{{ deviceTotal }}</strong>
          </div>
        </Card>
      </Col>
      <Col span="6">
        <Card shadow>
          <div class="summary-item">
            <span>版本样本</span>
            <strong>{{ runtimeTotal }}</strong>
          </div>
        </Card>
      </Col>
    </Row>

    <Card
      shadow
      class="content-card"
    >
      <div
        slot="title"
        class="content-title"
      >
        <span>分布详情</span>
        <span
          v-if="lastUpdatedAt"
          class="updated-at"
        >更新时间：{{ lastUpdatedAt }}</span>
      </div>

      <Tabs
        v-model="activeTab"
        @on-click="onTabChange"
      >
        <TabPane
          label="浏览器"
          name="browser"
        >
          <Row :gutter="16">
            <Col span="12">
              <div class="panel">
                <div class="panel-title">浏览器占比 Top {{ PIE_TOP_COUNT }}</div>
                <div class="chart-shell">
                  <Spin
                    v-if="loading.browser"
                    fix
                  />
                  <div
                    ref="browserPieChart"
                    class="chart"
                  />
                  <div
                    v-if="!loading.browser && browserPieData.length === 0"
                    class="empty-state"
                  >暂无浏览器数据</div>
                </div>
              </div>
            </Col>
            <Col span="12">
              <div class="panel">
                <div class="panel-title selector-title">
                  <span>版本分布</span>
                  <Select
                    v-model="selectedBrowser"
                    style="width: 140px"
                    size="small"
                    @on-change="onBrowserChange"
                  >
                    <Option
                      v-for="browser in browserList"
                      :key="browser"
                      :value="browser"
                    >{{ browser }}</Option>
                  </Select>
                </div>
                <div class="chart-shell">
                  <Spin
                    v-if="loading.browserVersion"
                    fix
                  />
                  <div
                    ref="browserVersionChart"
                    class="chart"
                  />
                  <div
                    v-if="!loading.browserVersion && browserVersionRawData.length === 0"
                    class="empty-state"
                  >暂无版本数据</div>
                </div>
              </div>
            </Col>
          </Row>
          <div class="panel table-panel">
            <div class="panel-title">浏览器排名</div>
            <Table
              :columns="browserRankColumns"
              :data="browserRankData"
              :loading="loading.browser"
            />
          </div>
        </TabPane>

        <TabPane
          label="操作系统"
          name="os"
        >
          <Row :gutter="16">
            <Col span="12">
              <div class="panel">
                <div class="panel-title">操作系统占比 Top {{ PIE_TOP_COUNT }}</div>
                <div class="chart-shell">
                  <Spin
                    v-if="loading.os"
                    fix
                  />
                  <div
                    ref="osPieChart"
                    class="chart"
                  />
                  <div
                    v-if="!loading.os && osPieData.length === 0"
                    class="empty-state"
                  >暂无操作系统数据</div>
                </div>
              </div>
            </Col>
            <Col span="12">
              <div class="panel">
                <div class="panel-title">操作系统版本排名</div>
                <Table
                  :columns="osColumns"
                  :data="osTableData"
                  :loading="loading.os"
                  height="360"
                />
              </div>
            </Col>
          </Row>
        </TabPane>

        <TabPane
          label="设备"
          name="device"
        >
          <Alert
            show-icon
            class="tab-alert"
          >桌面端 UA 通常没有厂商和型号，设备分布更适合用移动端模拟或真实移动设备验证。</Alert>
          <Row :gutter="16">
            <Col span="12">
              <div class="panel">
                <div class="panel-title">设备厂商占比 Top {{ PIE_TOP_COUNT }}</div>
                <div class="chart-shell">
                  <Spin
                    v-if="loading.device"
                    fix
                  />
                  <div
                    ref="devicePieChart"
                    class="chart"
                  />
                  <div
                    v-if="!loading.device && devicePieData.length === 0"
                    class="empty-state"
                  >暂无设备数据</div>
                </div>
              </div>
            </Col>
            <Col span="12">
              <div class="panel">
                <div class="panel-title">设备型号排名</div>
                <Table
                  :columns="deviceColumns"
                  :data="deviceTableData"
                  :loading="loading.device"
                  height="360"
                />
              </div>
            </Col>
          </Row>
        </TabPane>

        <TabPane
          label="版本"
          name="runtime"
        >
          <Alert
            show-icon
            class="tab-alert"
          >版本数据来自 SDK 公共字段 runtime_version，需要执行 Summary:SystemRuntimeVersion 后展示。</Alert>
          <Row :gutter="16">
            <Col span="12">
              <div class="panel">
                <div class="panel-title">业务版本占比 Top {{ PIE_TOP_COUNT }}</div>
                <div class="chart-shell">
                  <Spin
                    v-if="loading.runtime"
                    fix
                  />
                  <div
                    ref="runtimePieChart"
                    class="chart"
                  />
                  <div
                    v-if="!loading.runtime && runtimePieData.length === 0"
                    class="empty-state"
                  >暂无版本数据</div>
                </div>
              </div>
            </Col>
            <Col span="12">
              <div class="panel">
                <div class="panel-title">业务版本排名</div>
                <Table
                  :columns="runtimeColumns"
                  :data="runtimeTableData"
                  :loading="loading.runtime"
                  height="360"
                />
              </div>
            </Col>
          </Row>
        </TabPane>
      </Tabs>
    </Card>
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
  getDeviceDistribution,
  getRuntimeVersionDistribution
} from '@/api/system'

const PIE_TOP_COUNT = 10
const DISPLAY_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'

const PIE_OPTION = (data, title) => ({
  color: ['#2d8cf0', '#19be6b', '#ff9900', '#ed4014', '#9a66e4', '#00a8a8', '#f56c6c', '#515a6e', '#5cadff', '#ffb08a', '#8bc34a'],
  tooltip: {
    trigger: 'item',
    formatter: '{b}: {c} ({d}%)'
  },
  legend: {
    type: 'scroll',
    orient: 'vertical',
    right: 10,
    top: 24,
    bottom: 24
  },
  series: [{
    name: title,
    type: 'pie',
    radius: ['38%', '66%'],
    center: ['38%', '50%'],
    data,
    label: {
      formatter: '{b}\n{d}%'
    },
    emphasis: {
      itemStyle: {
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowColor: 'rgba(0, 0, 0, 0.28)'
      }
    }
  }]
})

const BAR_OPTION = (data) => ({
  color: ['#2d8cf0'],
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  grid: { left: '3%', right: '12%', bottom: '3%', containLabel: true },
  xAxis: {
    type: 'value',
    minInterval: 1
  },
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
      PIE_TOP_COUNT,
      activeTab: 'browser',
      currentMonth: moment().format('YYYY-MM'),
      lastUpdatedAt: '',
      isRefreshing: false,
      chartInstances: {},
      loading: {
        browser: false,
        browserVersion: false,
        os: false,
        device: false,
        runtime: false
      },

      browserList: [],
      selectedBrowser: '',
      browserPieRawData: [],
      browserVersionRawData: [],
      browserRankColumns: [
        { title: '排名', type: 'index', align: 'center', width: 70 },
        { title: '浏览器', key: 'browser', align: 'center' },
        { title: '数量', key: 'total_count', align: 'center', sortable: true },
        { title: '占比', key: 'percent', align: 'center', width: 100 }
      ],
      browserRankData: [],

      osPieRawData: [],
      osColumns: [
        { title: '排名', type: 'index', align: 'center', width: 70 },
        { title: '系统', key: 'os', align: 'center' },
        { title: '版本', key: 'os_version', align: 'center' },
        { title: '数量', key: 'total_count', align: 'center', sortable: true },
        { title: '占比', key: 'percent', align: 'center', width: 100 }
      ],
      osTableData: [],

      devicePieRawData: [],
      deviceColumns: [
        { title: '排名', type: 'index', align: 'center', width: 70 },
        { title: '厂商', key: 'device_vendor', align: 'center' },
        { title: '型号', key: 'device_model', align: 'center' },
        { title: '数量', key: 'total_count', align: 'center', sortable: true },
        { title: '占比', key: 'percent', align: 'center', width: 100 }
      ],
      deviceTableData: [],

      runtimePieRawData: [],
      runtimeColumns: [
        { title: '排名', type: 'index', align: 'center', width: 70 },
        { title: '版本', key: 'runtime_version', align: 'center' },
        { title: '数量', key: 'total_count', align: 'center', sortable: true },
        { title: '占比', key: 'percent', align: 'center', width: 100 }
      ],
      runtimeTableData: []
    }
  },

  computed: {
    browserTotal () {
      return this.sumBy(this.browserRankData, 'total_count')
    },
    osTotal () {
      return this.sumBy(this.osTableData, 'total_count')
    },
    deviceTotal () {
      return this.sumBy(this.deviceTableData, 'total_count')
    },
    runtimeTotal () {
      return this.sumBy(this.runtimeTableData, 'total_count')
    },
    browserPieData () {
      return this.toTopPieData(this.browserPieRawData)
    },
    osPieData () {
      return this.toTopPieData(this.osPieRawData)
    },
    devicePieData () {
      return this.toTopPieData(this.devicePieRawData)
    },
    runtimePieData () {
      return this.toTopPieData(this.runtimePieRawData)
    }
  },

  async mounted () {
    await this.refreshAll()
  },

  methods: {
    sumBy (list, key) {
      return list.reduce((total, item) => total + Number(item[key] || 0), 0)
    },
    appendPercent (list, valueKey) {
      const total = this.sumBy(list, valueKey)
      return list.map(item => ({
        ...item,
        percent: total > 0 ? `${(Number(item[valueKey] || 0) * 100 / total).toFixed(2)}%` : '0.00%'
      }))
    },
    toTopPieData (list) {
      const sortedList = list
        .map(item => ({ name: item.name, value: Number(item.value || 0) }))
        .sort((a, b) => b.value - a.value)
      if (sortedList.length <= PIE_TOP_COUNT) return sortedList
      const topList = sortedList.slice(0, PIE_TOP_COUNT)
      const otherValue = sortedList.slice(PIE_TOP_COUNT).reduce((total, item) => total + item.value, 0)
      if (otherValue > 0) {
        topList.push({ name: '其他', value: otherValue })
      }
      return topList
    },
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
      if (data.length === 0) {
        chart.clear()
        return
      }
      chart.setOption(PIE_OPTION(data, title), true)
      chart.resize()
    },
    renderBarChart (refName, data) {
      const chart = this.getOrInitChart(refName)
      if (!chart) return
      if (data.length === 0) {
        chart.clear()
        return
      }
      chart.setOption(BAR_OPTION(data), true)
      chart.resize()
    },
    renderActiveTab () {
      this.$nextTick(() => {
        if (this.activeTab === 'browser') {
          this.renderPieChart('browserPieChart', this.browserPieData, '浏览器')
          this.renderBarChart('browserVersionChart', this.browserVersionRawData)
        } else if (this.activeTab === 'os') {
          this.renderPieChart('osPieChart', this.osPieData, '操作系统')
        } else if (this.activeTab === 'device') {
          this.renderPieChart('devicePieChart', this.devicePieData, '设备厂商')
        } else if (this.activeTab === 'runtime') {
          this.renderPieChart('runtimePieChart', this.runtimePieData, '业务版本')
        }
      })
    },
    async refreshAll () {
      this.isRefreshing = true
      await Promise.all([
        this.loadBrowserData(),
        this.loadOsData(),
        this.loadDeviceData(),
        this.loadRuntimeData()
      ])
      this.lastUpdatedAt = moment().format(DISPLAY_TIME_FORMAT)
      this.isRefreshing = false
      this.renderActiveTab()
    },
    onMonthChange (month) {
      this.currentMonth = month || moment().format('YYYY-MM')
      this.selectedBrowser = ''
      this.refreshAll()
    },
    onTabChange () {
      this.renderActiveTab()
    },
    async loadBrowserData () {
      const params = { month: this.currentMonth }
      this.$set(this.loading, 'browser', true)
      try {
        const [listRes, allRes] = await Promise.all([
          getBrowserList(params),
          getBrowserDistributionByVersion(params)
        ])
        this.browserList = _.get(listRes, ['data'], [])
        if (this.browserList.indexOf(this.selectedBrowser) < 0) {
          this.selectedBrowser = this.browserList[0] || ''
        }

        const allList = _.get(allRes, ['data'], [])
        const browserMap = {}
        for (let item of allList) {
          const browser = item.browser || '未知'
          browserMap[browser] = (browserMap[browser] || 0) + Number(item.total_count || 0)
        }

        this.browserPieRawData = Object.keys(browserMap)
          .map(name => ({ name, value: browserMap[name] }))
          .sort((a, b) => b.value - a.value)

        this.browserRankData = this.appendPercent(this.browserPieRawData
          .map(item => ({ browser: item.name, total_count: item.value })), 'total_count')

        if (this.selectedBrowser) {
          await this.loadBrowserVersionData(this.selectedBrowser)
        } else {
          this.browserVersionRawData = []
        }
      } catch (err) {
        this.browserList = []
        this.browserPieRawData = []
        this.browserVersionRawData = []
        this.browserRankData = []
        this.$Message.error('浏览器分布加载失败')
      } finally {
        this.$set(this.loading, 'browser', false)
      }
    },
    async onBrowserChange (browser) {
      this.selectedBrowser = browser
      await this.loadBrowserVersionData(browser)
      this.renderActiveTab()
    },
    async loadBrowserVersionData (browser) {
      this.$set(this.loading, 'browserVersion', true)
      try {
        const res = await getBrowserDistribution({ month: this.currentMonth, q: browser })
        const list = _.get(res, ['data'], [])
        this.browserVersionRawData = list
          .map(item => ({ name: String(item.key || '未知'), value: Number(item.value || 0) }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      } catch (err) {
        this.browserVersionRawData = []
        this.$Message.error('浏览器版本加载失败')
      } finally {
        this.$set(this.loading, 'browserVersion', false)
      }
    },
    async loadOsData () {
      this.$set(this.loading, 'os', true)
      try {
        const res = await getOsDistribution({ month: this.currentMonth })
        const list = _.get(res, ['data'], [])
        const osMap = {}
        for (let item of list) {
          const osName = item.type || '未知'
          osMap[osName] = (osMap[osName] || 0) + Number(item.value || 0)
        }

        this.osPieRawData = Object.keys(osMap)
          .map(name => ({ name, value: osMap[name] }))
          .sort((a, b) => b.value - a.value)

        const tableData = list
          .map(item => ({
            os: item.type || '未知',
            os_version: item.key || '未知',
            total_count: Number(item.value || 0)
          }))
          .sort((a, b) => b.total_count - a.total_count)
        this.osTableData = this.appendPercent(tableData, 'total_count')
      } catch (err) {
        this.osPieRawData = []
        this.osTableData = []
        this.$Message.error('操作系统分布加载失败')
      } finally {
        this.$set(this.loading, 'os', false)
      }
    },
    async loadDeviceData () {
      this.$set(this.loading, 'device', true)
      try {
        const res = await getDeviceDistribution({ month: this.currentMonth })
        const list = _.get(res, ['data'], [])
        const vendorMap = {}
        for (let item of list) {
          const vendor = item.type || '未知'
          vendorMap[vendor] = (vendorMap[vendor] || 0) + Number(item.value || 0)
        }

        this.devicePieRawData = Object.keys(vendorMap)
          .map(name => ({ name, value: vendorMap[name] }))
          .sort((a, b) => b.value - a.value)

        const tableData = list
          .map(item => ({
            device_vendor: item.type || '未知',
            device_model: item.key || '未知',
            total_count: Number(item.value || 0)
          }))
          .sort((a, b) => b.total_count - a.total_count)
        this.deviceTableData = this.appendPercent(tableData, 'total_count')
      } catch (err) {
        this.devicePieRawData = []
        this.deviceTableData = []
        this.$Message.error('设备分布加载失败')
      } finally {
        this.$set(this.loading, 'device', false)
      }
    },
    async loadRuntimeData () {
      this.$set(this.loading, 'runtime', true)
      try {
        const res = await getRuntimeVersionDistribution({ month: this.currentMonth })
        const list = _.get(res, ['data'], [])
        this.runtimePieRawData = list
          .map(item => ({ name: item.type || '未知', value: Number(item.value || 0) }))
          .sort((a, b) => b.value - a.value)
        const tableData = this.runtimePieRawData
          .map(item => ({ runtime_version: item.name, total_count: item.value }))
        this.runtimeTableData = this.appendPercent(tableData, 'total_count')
      } catch (err) {
        this.runtimePieRawData = []
        this.runtimeTableData = []
        this.$Message.error('版本分布加载失败')
      } finally {
        this.$set(this.loading, 'runtime', false)
      }
    }
  },

  beforeDestroy () {
    Object.values(this.chartInstances).forEach(chart => {
      if (chart) chart.dispose()
    })
  }
}
</script>

<style lang="less" scoped>
.system-overview-page {
  .page-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;

    h3 {
      margin: 0 0 4px;
      color: #17233d;
      font-size: 18px;
      font-weight: 600;
    }

    p {
      margin: 0;
      color: #808695;
    }
  }

  .toolbar-actions {
    display: flex;
    align-items: center;

    .ivu-btn {
      margin-left: 8px;
    }
  }

  .summary-row,
  .content-card,
  .table-panel {
    margin-top: 16px;
  }

  .summary-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;

    span {
      color: #808695;
    }

    strong {
      color: #17233d;
      font-size: 24px;
      font-weight: 600;
    }
  }

  .content-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .updated-at {
    color: #808695;
    font-size: 12px;
    font-weight: 400;
  }

  .panel {
    padding: 12px 0 0;
  }

  .panel-title {
    display: flex;
    align-items: center;
    min-height: 32px;
    margin-bottom: 8px;
    color: #17233d;
    font-size: 14px;
    font-weight: 600;
  }

  .selector-title {
    justify-content: space-between;
  }

  .chart-shell {
    position: relative;
    min-height: 360px;
  }

  .chart {
    height: 360px;
  }

  .empty-state {
    position: absolute;
    top: 50%;
    left: 0;
    width: 100%;
    color: #808695;
    text-align: center;
    transform: translateY(-50%);
  }

  .tab-alert {
    margin-bottom: 12px;
  }
}
</style>
