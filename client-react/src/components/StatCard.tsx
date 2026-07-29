import { Card, Statistic } from 'antd'
import type { ReactNode } from 'react'

export default function StatCard({
  title,
  value,
  suffix,
  prefix,
  color = '#1677ff',
  loading = false
}: {
  title: string
  value: number | string
  suffix?: ReactNode
  prefix?: ReactNode
  color?: string
  loading?: boolean
}) {
  return (
    <Card className="stat-card" loading={loading}>
      <Statistic
        title={title}
        value={value}
        suffix={suffix}
        prefix={prefix}
        valueStyle={{ color, fontWeight: 700 }}
      />
    </Card>
  )
}

