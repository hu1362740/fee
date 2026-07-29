import { Alert, Button, Empty, Skeleton } from 'antd'

export function PageLoading({ rows = 5 }: { rows?: number }) {
  return <Skeleton active paragraph={{ rows }} />
}

export function PageError({ message = '数据加载失败', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      title={message}
      action={onRetry ? <Button size="small" onClick={onRetry}>重试</Button> : undefined}
    />
  )
}

export function EmptyChart({ description = '暂无数据' }: { description?: string }) {
  return (
    <div className="empty-chart">
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description} />
    </div>
  )
}

