import { App } from 'antd'
import { useEffect } from 'react'
import { subscribeUiEvents } from '@/lib/uiEvents'

export default function UiFeedbackBridge() {
  const { message } = App.useApp()

  useEffect(() => subscribeUiEvents(event => {
    message[event.type](event.content)
  }), [message])

  return null
}

