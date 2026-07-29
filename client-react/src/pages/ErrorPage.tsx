import { Button, Result } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import error401 from '@/assets/error-401.svg'
import error404 from '@/assets/error-404.svg'
import error500 from '@/assets/error-500.svg'
import { useAppState } from '@/context/AppContext'

const config = {
  401: { title: '401', subTitle: '您没有浏览这个页面的权限', image: error401 },
  404: { title: '404', subTitle: '您访问的页面不存在或已经离开', image: error404 },
  500: { title: '500', subTitle: '服务经历了一点波折，请稍后重试', image: error500 }
}

export default function ErrorPage({ code }: { code: 401 | 404 | 500 }) {
  const navigate = useNavigate()
  const { currentProjectId } = useAppState()
  const [seconds, setSeconds] = useState(5)
  const page = config[code]

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(value => value - 1), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (seconds <= 0) navigate(-1)
  }, [navigate, seconds])

  return (
    <div className="error-page">
      <Result
        icon={<img className="error-illustration" src={page.image} alt="" />}
        title={page.title}
        subTitle={page.subTitle}
        extra={[
          <Button
            type="primary"
            key="home"
            onClick={() => navigate(currentProjectId ? `/project/${currentProjectId}/home` : '/')}
          >
            返回首页
          </Button>,
          <Button key="back" onClick={() => navigate(-1)}>返回上一页（{Math.max(seconds, 0)}s）</Button>
        ]}
      />
    </div>
  )
}

