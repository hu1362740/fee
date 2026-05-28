import axios from '@/libs/api.request'

export const getPVCount = (params) => {
  return axios.request({
    url: '/api/pv/count',
    method: 'get',
    params
  })
}

export const getPVTrend = (params) => {
  return axios.request({
    url: '/api/pv/trend',
    method: 'get',
    params
  })
}
