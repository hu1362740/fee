<template>
  <div class="alarm-log-page">
    <Card shadow>
      <time-bar
        @change="handleQuickDateChange"
        :disabledThirty="true"
      />
    </Card>

    <Row
      :gutter="16"
      class="summary-row"
    >
      <Col span="8">
        <Card shadow>
          <div class="summary-item">
            <span class="summary-label">报警总数</span>
            <span class="summary-value">{{ filteredAlarmLogList.length }}</span>
          </div>
        </Card>
      </Col>
      <Col span="8">
        <Card shadow>
          <div class="summary-item">
            <span class="summary-label">规则数</span>
            <span class="summary-value">{{ configCount }}</span>
          </div>
        </Card>
      </Col>
      <Col span="8">
        <Card shadow>
          <div class="summary-item">
            <span class="summary-label">错误类型</span>
            <span class="summary-value">{{ errorNameCount }}</span>
          </div>
        </Card>
      </Col>
    </Row>

    <Card
      shadow
      class="chart-card"
    >
      <p slot="title">报警趋势</p>
      <StackArea
        :height="420"
        :data="lineData.dataList"
        :scale="lineData.scale"
        :isSpinShow="isLoading.stackArea"
      />
    </Card>

    <Card
      shadow
      class="log-card"
    >
      <div
        slot="title"
        class="log-card-title"
      >
        <span>报警明细</span>
        <div class="log-actions">
          <Input
            v-model="keyword"
            clearable
            icon="ios-search"
            placeholder="搜索错误名、消息或配置ID"
            class="keyword-input"
            @on-change="handleKeywordChange"
            @on-clear="handleKeywordChange"
          />
          <Button
            icon="md-refresh"
            @click="refreshAll"
          >刷新</Button>
        </div>
      </div>
      <Table
        :columns="alarmLogColumns"
        :data="displayAlarmLogList"
        :loading="isLoading.logList"
        :height="430"
      />
      <Page
        v-if="filteredAlarmLogList.length > page.pageSize"
        :current="page.current"
        :total="filteredAlarmLogList.length"
        :page-size="page.pageSize"
        show-total
        class="the-page-position"
        @on-change="handlePageChange"
      />
    </Card>
  </div>
</template>

<script>
import { getAlarmLog, getLineAlarmLog } from '@/api/alarm'
import moment from 'moment'
import StackArea from '@/view/components/viser-stack/viser-stack.vue'
import TimeBar from '@/view/components/time-bar'

const DISPLAY_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'

export default {
  name: 'alarm-log',
  components: {
    StackArea,
    TimeBar
  },
  data () {
    return {
      alarmLogList: [],
      keyword: '',
      dateRange: [moment().startOf('day').unix(), moment().endOf('day').unix()],
      page: {
        current: 1,
        pageSize: 10
      },
      isLoading: {
        stackArea: true,
        logList: true
      },
      lineData: {
        dataList: [],
        scale: [
          {
            dataKey: 'value',
            sync: true,
            alias: '次',
            formatter: value => value + ' 次'
          },
          {
            dataKey: 'index',
            tickCount: 12,
            alias: '时间'
          }
        ]
      },
      alarmLogColumns: [
        {
          type: 'expand',
          width: 60,
          render: (h, params) => {
            const message = params.row.message || ''
            return h('pre', {
              class: 'alarm-log-message'
            }, message)
          }
        },
        {
          title: '报警时间',
          key: 'send_at_display',
          width: 170,
          align: 'center'
        },
        {
          title: '配置ID',
          key: 'config_id',
          width: 90,
          align: 'center'
        },
        {
          title: '错误名称',
          key: 'error_name',
          minWidth: 220
        },
        {
          title: '报警内容',
          key: 'message',
          minWidth: 420,
          render: (h, params) => {
            return h('div', {
              class: 'message-brief',
              attrs: {
                title: params.row.message
              }
            }, params.row.message)
          }
        }
      ]
    }
  },
  computed: {
    filteredAlarmLogList () {
      const keyword = this.keyword.trim().toLowerCase()
      if (keyword.length === 0) return this.alarmLogList
      return this.alarmLogList.filter(item => {
        const searchText = [
          item.config_id,
          item.error_name,
          item.message,
          item.send_at_display
        ].join(' ').toLowerCase()
        return searchText.indexOf(keyword) >= 0
      })
    },
    displayAlarmLogList () {
      const start = (this.page.current - 1) * this.page.pageSize
      const end = start + this.page.pageSize
      return this.filteredAlarmLogList.slice(start, end)
    },
    configCount () {
      return new Set(this.filteredAlarmLogList.map(item => item.config_id)).size
    },
    errorNameCount () {
      return new Set(this.filteredAlarmLogList.map(item => item.error_name)).size
    }
  },
  mounted () {
    this.refreshAll()
  },
  methods: {
    async refreshAll () {
      await Promise.all([
        this.getAlarmLog(),
        this.getLineAlarmLog()
      ])
    },
    async getAlarmLog () {
      this.$set(this.isLoading, 'logList', true)
      try {
        const { data: dataList = [] } = await getAlarmLog({
          st: this.dateRange[0] * 1000,
          et: this.dateRange[1] * 1000
        })
        const recordList = dataList.map(item => {
          return {
            ...item,
            send_at_display: moment.unix(item.send_at).format(DISPLAY_TIME_FORMAT)
          }
        })
        this.$set(this, 'alarmLogList', recordList)
        this.resetPageIfNeeded()
      } catch (e) {
        this.$Message.error('报警日志加载失败')
      } finally {
        this.$set(this.isLoading, 'logList', false)
      }
    },
    async getLineAlarmLog () {
      this.$set(this.isLoading, 'stackArea', true)
      try {
        const { data: dataList = [] } = await getLineAlarmLog({
          st: this.dateRange[0],
          et: this.dateRange[1]
        })
        this.$set(this.lineData, 'dataList', dataList)
      } catch (e) {
        this.$Message.error('报警趋势加载失败')
      } finally {
        this.$set(this.isLoading, 'stackArea', false)
      }
    },
    handleQuickDateChange (timeRange) {
      this.dateRange = [
        moment(timeRange.dateRange[0]).unix(),
        moment(timeRange.dateRange[1]).unix()
      ]
      this.page.current = 1
      this.refreshAll()
    },
    handleKeywordChange () {
      this.page.current = 1
    },
    handlePageChange (current) {
      this.page.current = current
    },
    resetPageIfNeeded () {
      const maxPage = Math.max(Math.ceil(this.filteredAlarmLogList.length / this.page.pageSize), 1)
      if (this.page.current > maxPage) {
        this.page.current = maxPage
      }
    }
  }
}
</script>

<style lang="less" scoped>
.alarm-log-page {
  .summary-row,
  .chart-card,
  .log-card {
    margin-top: 16px;
  }

  .summary-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
  }

  .summary-label {
    color: #808695;
    font-size: 14px;
  }

  .summary-value {
    color: #17233d;
    font-size: 24px;
    font-weight: 600;
  }

  .log-card-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .log-actions {
    display: flex;
    align-items: center;
  }

  .keyword-input {
    width: 260px;
    margin-right: 8px;
  }

  .the-page-position {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>

<style lang="less">
.alarm-log-message {
  max-height: 220px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  background: #f8f8f9;
}

.message-brief {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
