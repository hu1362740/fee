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
                  <ve-pie
                    :data="browserPieData"
                    :settings="pieSettings"
                    height="360px"
                  ></ve-pie>
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
                  <ve-bar
                    :data="browserVersionData"
                    :settings="browserVersionBarSettings"
                    :extend="barExtend"
                    height="360px"
                  ></ve-bar>
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
                  <ve-pie
                    :data="osPieData"
                    :settings="pieSettings"
                    height="360px"
                  ></ve-pie>
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
                  <ve-pie
                    :data="devicePieData"
                    :settings="pieSettings"
                    height="360px"
                  ></ve-pie>
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
import VePie from 'v-charts/lib/pie.common'
import VeBar from 'v-charts/lib/bar.common'
import {
  getOsDistribution,
  getBrowserList,
  getBrowserDistribution,
  getBrowserDistributionByVersion,
  getDeviceDistribution
} from '@/api/system'

export default {
  name: 'system',
  components: {
    VePie,
    VeBar
  },
  data () {
    return {
      activeTab: 'browser',
      currentMonth: moment().format('YYYY-MM'),

      pieSettings: {
        roseType: false,
        radius: '60%',
        offsetY: '50%'
      },

      barExtend: {
        xAxis: {
          axisLabel: { show: true, interval: 0 }
        }
      },

      browserVersionBarSettings: {
        metrics: ['数量'],
        dimension: ['版本']
      },

      // 浏览器
      browserList: [],
      selectedBrowser: '',
      browserPieData: { columns: ['名称', '数量'], rows: [] },
      browserVersionData: { columns: ['版本', '数量'], rows: [] },
      browserRankColumns: [
        { title: '排名', type: 'index', align: 'center', width: 70 },
        { title: '浏览器', key: 'browser', align: 'center' },
        { title: '数量', key: 'total_count', align: 'center', sortable: true }
      ],
      browserRankData: [],

      // 操作系统
      osPieData: { columns: ['系统', '数量'], rows: [] },
      osColumns: [
        { title: '排名', type: 'index', align: 'center', width: 70 },
        { title: '系统', key: 'os', align: 'center' },
        { title: '版本', key: 'os_version', align: 'center' },
        { title: '数量', key: 'total_count', align: 'center', sortable: true }
      ],
      osTableData: [],

      // 设备
      devicePieData: { columns: ['厂商', '数量'], rows: [] },
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
    onMonthChange (month) {
      this.currentMonth = month
      this.loadTabData(this.activeTab)
    },

    onTabChange (name) {
      this.loadTabData(name)
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

      // 1. 获取浏览器列表
      const listRes = await getBrowserList(params)
      this.browserList = _.get(listRes, ['data'], [])
      if (this.browserList.length > 0 && !this.selectedBrowser) {
        this.selectedBrowser = this.browserList[0]
      }

      // 2. 获取全部浏览器版本数据，聚合成浏览器占比饼图 + 排名表
      const allRes = await getBrowserDistributionByVersion(params)
      const allList = _.get(allRes, ['data'], [])

      const browserMap = {}
      for (let item of allList) {
        const browser = item.browser || '未知'
        browserMap[browser] = (browserMap[browser] || 0) + Number(item.total_count)
      }

      this.browserPieData = {
        columns: ['名称', '数量'],
        rows: Object.keys(browserMap)
          .map(name => ({ '名称': name, '数量': browserMap[name] }))
          .sort((a, b) => b['数量'] - a['数量'])
      }

      this.browserRankData = Object.keys(browserMap)
        .map(name => ({ browser: name, total_count: browserMap[name] }))
        .sort((a, b) => b.total_count - a.total_count)

      // 3. 加载当前选中浏览器的版本分布
      if (this.selectedBrowser) {
        await this.loadBrowserVersionData(this.selectedBrowser)
      }
    },

    async onBrowserChange (browser) {
      this.selectedBrowser = browser
      await this.loadBrowserVersionData(browser)
    },

    async loadBrowserVersionData (browser) {
      const res = await getBrowserDistribution({ month: this.currentMonth, q: browser })
      const list = _.get(res, ['data'], [])
      this.browserVersionData = {
        columns: ['版本', '数量'],
        rows: list
          .map(item => ({ '版本': item.name || String(item.key || ''), '数量': Number(item.value || 0) }))
          .sort((a, b) => b['数量'] - a['数量'])
      }
    },

    async loadOsData () {
      const params = { month: this.currentMonth }
      const res = await getOsDistribution(params)
      const list = _.get(res, ['data'], [])

      // 按 OS 类型聚合饼图
      const osMap = {}
      for (let item of list) {
        const osName = item.type || '未知'
        osMap[osName] = (osMap[osName] || 0) + Number(item.value)
      }
      this.osPieData = {
        columns: ['系统', '数量'],
        rows: Object.keys(osMap)
          .map(name => ({ '系统': name, '数量': osMap[name] }))
          .sort((a, b) => b['数量'] - a['数量'])
      }

      // 表格展示 OS + 版本明细
      this.osTableData = list
        .map(item => ({
          os: item.type || '未知',
          os_version: item.key || '',
          total_count: Number(item.value)
        }))
        .sort((a, b) => b.total_count - a.total_count)
    },

    async loadDeviceData () {
      const params = { month: this.currentMonth }
      const res = await getDeviceDistribution(params)
      const list = _.get(res, ['data'], [])

      // 按设备厂商聚合饼图
      const vendorMap = {}
      for (let item of list) {
        const vendor = item.type || '未知'
        vendorMap[vendor] = (vendorMap[vendor] || 0) + Number(item.value)
      }
      this.devicePieData = {
        columns: ['厂商', '数量'],
        rows: Object.keys(vendorMap)
          .map(name => ({ '厂商': name, '数量': vendorMap[name] }))
          .sort((a, b) => b['数量'] - a['数量'])
      }

      // 表格展示厂商 + 型号明细
      this.deviceTableData = list
        .map(item => ({
          device_vendor: item.type || '未知',
          device_model: item.key || '',
          total_count: Number(item.value)
        }))
        .sort((a, b) => b.total_count - a.total_count)
    }
  },

  async mounted () {
    await this.loadBrowserData()
  }
}
</script>

<style lang="less" scoped>
.ivu-card-no-border {
  box-shadow: none;
}
</style>
