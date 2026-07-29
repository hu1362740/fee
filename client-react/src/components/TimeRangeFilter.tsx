import { CalendarOutlined } from '@ant-design/icons'
import { DatePicker, Segmented, Space } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import type { FilterBy } from '@/types/api'
import { rangeToValue, todayRange, type TimeRangeValue } from '@/utils/time'

const { RangePicker } = DatePicker

interface TimeRangeFilterProps {
  onChange: (value: TimeRangeValue) => void
  showFilterBy?: boolean
  disableMinute?: boolean
  disableThirty?: boolean
  maxDays?: number
}

export default function TimeRangeFilter({
  onChange,
  showFilterBy = false,
  disableMinute = false,
  disableThirty = false,
  maxDays
}: TimeRangeFilterProps) {
  const [range, setRange] = useState<[Dayjs, Dayjs]>(todayRange())
  const [filterBy, setFilterBy] = useState<FilterBy>('hour')
  const quickOptions = useMemo(() => [
    { label: '今天', value: 'today' },
    { label: '昨天', value: 'yesterday' },
    { label: '最近七天', value: 'seven' },
    ...(!disableThirty ? [{ label: '最近30天', value: 'thirty' }] : [])
  ], [disableThirty])

  const emit = (nextRange: [Dayjs, Dayjs], nextFilter = filterBy) => {
    setRange(nextRange)
    onChange(rangeToValue(nextRange, nextFilter))
  }

  const handleQuick = (value: string | number) => {
    const today = dayjs()
    if (value === 'yesterday') {
      emit([today.subtract(1, 'day').startOf('day'), today.subtract(1, 'day').endOf('day')])
    } else if (value === 'seven') {
      emit([today.subtract(6, 'day').startOf('day'), today.endOf('day')])
    } else if (value === 'thirty') {
      emit([today.subtract(29, 'day').startOf('day'), today.endOf('day')])
    } else {
      emit(todayRange())
    }
  }

  const filterOptions = [
    { label: '按分', value: 'minute', disabled: disableMinute },
    { label: '按时', value: 'hour' },
    { label: '按日', value: 'day', disabled: range[1].diff(range[0], 'day') < 1 },
    { label: '按周', value: 'week', disabled: range[1].diff(range[0], 'day') < 7 },
    { label: '按月', value: 'month', disabled: range[1].diff(range[0], 'day') < 30 }
  ]

  return (
    <div className="time-filter">
      <Space wrap size={12}>
        <Segmented options={quickOptions} defaultValue="today" onChange={handleQuick} />
        <RangePicker
          allowClear={false}
          value={range}
          suffixIcon={<CalendarOutlined />}
          disabledDate={date => {
            if (date.isAfter(dayjs(), 'day')) return true
            if (maxDays && date.isBefore(dayjs().subtract(maxDays, 'day'), 'day')) return true
            return false
          }}
          onChange={value => {
            if (value?.[0] && value[1]) emit([value[0], value[1]])
          }}
        />
        {showFilterBy && (
          <Segmented
            options={filterOptions}
            value={filterBy}
            onChange={value => {
              const next = value as FilterBy
              setFilterBy(next)
              onChange(rangeToValue(range, next))
            }}
          />
        )}
      </Space>
    </div>
  )
}

