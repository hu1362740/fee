<template>
  <div>
    <Row>
      <Card shadow>
        <time-bar
          :disabledMinute="true"
          :displayTypeItem="true"
          @change="onTimeChange"
        ></time-bar>
      </Card>
    </Row>

    <Row :gutter="16" style="margin-top:16px">
      <Col span="6">
        <Card shadow>
          <div class="stat-card">
            <div class="stat-label">时间段 UV 总量</div>
            <div class="stat-value">
              <Spin v-if="loading.count" size="large"></Spin>
              <span v-else>{{ totalUV.toLocaleString() }}</span>
            </div>
            <div class="stat-desc">独立访客数（按小时去重）</div>
          </div>
        </Card>
      </Col>
      <Col span="18">
        <Card shadow>
          <p slot="title">
            <Icon type="md-trending-up" />
            UV 趋势图
          </p>
          <div style="position:relative;height:300px">
            <Spin v-if="loading.trend" fix size="large"></Spin>
            <v-chart
              v-else
              :forceFit="true"
              :height="300"
              :data="trendData"
              :scale="chartScale"
              :padding="[20, 60, 60, 60]"
            >
              <v-tooltip />
              <v-axis data-key="key" :label="{ rotate: -30, offset: 20 }" />
              <v-axis data-key="value" />
              <v-smooth-line position="key*value" color="#2d8cf0" />
              <v-point position="key*value" shape="circle" color="#2d8cf0" :size="4" />
            </v-chart>
            <div v-if="!loading.trend && trendData.length === 0" class="empty-tip">
              <Icon type="md-analytics" size="40" color="#ccc" />
              <p>暂无数据，请先运行 Parse:UV 和 Summary:UV 命令</p>
            </div>
          </div>
        </Card>
      </Col>
    </Row>

    <Row style="margin-top:16px">
      <Card shadow>
        <p slot="title">
          <Icon type="md-list" />
          UV 明细数据
        </p>
        <Table
          :columns="tableColumns"
          :data="trendData"
          :loading="loading.trend"
          size="small"
        />
      </Card>
    </Row>
  </div>
</template>

<script>
import moment from 'moment'
import _ from 'lodash'
import TimeBar from '@/view/components/time-bar'
import { getUVCount, getUVTrend } from '@/api/uv'

export default {
  name: 'uv-statistics',
  components: {
    TimeBar
  },
  data () {
    return {
      loading: {
        count: false,
        trend: false
      },
      totalUV: 0,
      trendData: [],
      filterBy: 'hour',
      timeParams: {
        st: moment(moment().format('YYYY/MM/DD 00:00:00'), 'YYYY/MM/DD HH:mm:ss').unix() * 1000,
        et: moment(moment().format('YYYY/MM/DD 23:59:59'), 'YYYY/MM/DD HH:mm:ss').unix() * 1000
      },
      chartScale: [
        {
          dataKey: 'value',
          alias: 'UV',
          min: 0
        },
        {
          dataKey: 'key',
          alias: '时间',
          tickCount: 12,
          nice: false
        }
      ],
      tableColumns: [
        {
          title: '时间',
          key: 'key',
          align: 'center'
        },
        {
          title: 'UV 数',
          key: 'value',
          align: 'center',
          sortable: true
        }
      ]
    }
  },
  async mounted () {
    await this.fetchData()
  },
  methods: {
    async onTimeChange ({ dateRange, filterBy }) {
      this.filterBy = filterBy
      this.timeParams = {
        st: +moment(dateRange[0]),
        et: +moment(dateRange[1])
      }
      await this.fetchData()
    },
    async fetchData () {
      await Promise.all([
        this.fetchUVCount(),
        this.fetchUVTrend()
      ])
    },
    async fetchUVCount () {
      this.loading.count = true
      const res = await getUVCount({
        st: this.timeParams.st,
        et: this.timeParams.et
      })
      this.loading.count = false
      this.totalUV = _.get(res, ['data'], 0) || 0
    },
    async fetchUVTrend () {
      this.loading.trend = true
      const res = await getUVTrend({
        st: this.timeParams.st,
        et: this.timeParams.et,
        filterBy: this.filterBy
      })
      this.loading.trend = false
      this.trendData = _.get(res, ['data'], []) || []
    }
  }
}
</script>

<style lang="less" scoped>
.stat-card {
  text-align: center;
  padding: 16px 0;

  .stat-label {
    font-size: 14px;
    color: #808695;
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 40px;
    font-weight: bold;
    color: #2d8cf0;
    line-height: 1.2;
    min-height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stat-desc {
    font-size: 12px;
    color: #c5c8ce;
    margin-top: 8px;
  }
}

.empty-tip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #c5c8ce;

  p {
    margin-top: 8px;
    font-size: 13px;
  }
}
</style>
