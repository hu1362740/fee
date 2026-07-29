import type { ReactNode } from 'react'
import { Typography } from 'antd'

export default function PageHeading({
  title,
  description,
  icon,
  extra
}: {
  title: string
  description: string
  icon?: ReactNode
  extra?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <Typography.Title level={3}>{title}</Typography.Title>
        <Typography.Text type="secondary">{description}</Typography.Text>
      </div>
      {extra ?? (icon ? <div className="page-heading-icon">{icon}</div> : null)}
    </div>
  )
}
