import axios from '@/libs/api.request'
import { getProjectId } from '@/libs/util'

export const getPVCount = (params) => {
  return axios.request({
    url: `project/${getProjectId()}/api/pv/count`,
    method: 'get',
    params: {
      ...params
    }
  })
}

export const getPVTrend = (params) => {
  return axios.request({
    url: `project/${getProjectId()}/api/pv/trend`,
    method: 'get',
    params: {
      ...params
    }
  })
}
