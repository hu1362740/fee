import axios from '@/libs/api.request'
import { getProjectId } from '@/libs/util'

export const getUVCount = (params) => {
  return axios.request({
    url: `project/${getProjectId()}/api/uv/count`,
    method: 'get',
    params: {
      ...params
    }
  })
}

export const getUVTrend = (params) => {
  return axios.request({
    url: `project/${getProjectId()}/api/uv/trend`,
    method: 'get',
    params: {
      ...params
    }
  })
}
