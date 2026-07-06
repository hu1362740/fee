import axios from '@/libs/api.request'
import { getProjectId } from '@/libs/util'

export const getOsDistribution = (params) => {
  return axios.request({
    url: `project/${getProjectId()}/api/os`,
    method: 'get',
    params
  })
}

export const getBrowserList = (params) => {
  return axios.request({
    url: `project/${getProjectId()}/api/browser/list`,
    method: 'get',
    params
  })
}

export const getBrowserDistribution = (params) => {
  return axios.request({
    url: `project/${getProjectId()}/api/browser`,
    method: 'get',
    params
  })
}

export const getBrowserDistributionByVersion = (params) => {
  return axios.request({
    url: `project/${getProjectId()}/api/browser/distribution_version`,
    method: 'get',
    params
  })
}

export const getDeviceDistribution = (params) => {
  return axios.request({
    url: `project/${getProjectId()}/api/device`,
    method: 'get',
    params
  })
}

export const getRuntimeVersionDistribution = (params) => {
  return axios.request({
    url: `project/${getProjectId()}/api/runtimeVersion`,
    method: 'get',
    params
  })
}
