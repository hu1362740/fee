import axios from '@/libs/api.request'

export const getProjectList = () => {
  return axios.request({
    url: '/api/project/item/list',
    method: 'get'
  })
}

export const addProject = (data) => {
  return axios.request({
    url: '/api/project/item/add',
    method: 'post',
    data
  })
}

export const updateProject = (data) => {
  return axios.request({
    url: '/api/project/item/update',
    method: 'post',
    data
  })
}

export const deleteProject = (data) => {
  return axios.request({
    url: '/api/project/item/delete',
    method: 'post',
    data
  })
}
