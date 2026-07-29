import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { BrowserRouter } from 'react-router-dom'
import AppRouter from './App'
import { AppProvider } from '@/context/AppContext'
import UiFeedbackBridge from '@/components/UiFeedbackBridge'
import './styles/index.css'

dayjs.locale('zh-cn')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          colorInfo: '#1677ff',
          colorSuccess: '#16a085',
          colorWarning: '#f5a623',
          colorError: '#e34d59',
          colorBgLayout: '#f3f6fa',
          colorText: '#17233d',
          borderRadius: 10,
          fontFamily: "'Inter', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
        },
        components: {
          Layout: {
            siderBg: '#0b1f3a',
            headerBg: '#ffffff'
          },
          Menu: {
            darkItemBg: '#0b1f3a',
            darkSubMenuItemBg: '#07182e',
            darkItemSelectedBg: '#1677ff'
          },
          Card: {
            headerBg: '#ffffff'
          }
        }
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <AppProvider>
            <UiFeedbackBridge />
            <AppRouter />
          </AppProvider>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </StrictMode>
)

