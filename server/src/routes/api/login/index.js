import _ from 'lodash'
import RouterConfigBuilder from '~/src/library/utils/modules/router_config_builder'
import API_RES from '~/src/constants/api_res'
import Auth from '~/src/library/auth'
import MUser from '~/src/model/project/user'
import http from '~/src/library/http'
import ucConfig from '~/src/configs/user_center'
import Logger from '~/src/library/logger'
import moment from 'moment'
import UC from '~/src/library/uc'
import commonConfig from '~/src/configs/common'

// 从配置文件获取登录类型，默认为 'normal'
const LOGIN_TYPE = _.get(commonConfig, ['loginType'], 'normal')

/**
 * 站点直接登录接口（预留/测试用，当前user对象为空，实际不可用）
 */
let siteLogin = RouterConfigBuilder.routerConfigBuilder('/api/login/site', RouterConfigBuilder.METHOD_TYPE_POST, async (req, res) => {
  let user = {}
  let token = Auth.generateToken(user.ucid, user.name, user.account)
  res.cookie('fee_token', token, { maxAge: 100 * 86400 * 1000, httpOnly: false })
  res.cookie('ucid', user.ucid, { maxAge: 100 * 86400 * 1000, httpOnly: false })
  res.cookie('name', user.name, { maxAge: 100 * 86400 * 1000, httpOnly: false })
  res.cookie('account', user.account, { maxAge: 100 * 86400 * 1000, httpOnly: false })
  res.send(API_RES.showResult({ ucid: user.ucid, name: user.name, account: user.account }))
},
false, // 不需要项目权限
false  // 不需要登录检查
)

/**
 * UC统一认证登录接口
 */
let ucLogin = RouterConfigBuilder.routerConfigBuilder('/api/login/uc', RouterConfigBuilder.METHOD_TYPE_POST, async (req, res) => {
  await handleUCLogin(req, res)
},
false,
false
)

/**
 * 普通账号密码登录接口
 */
let normalLogin = RouterConfigBuilder.routerConfigBuilder('/api/login/normal', RouterConfigBuilder.METHOD_TYPE_POST, async (req, res) => {
  await handleNormalLogin(req, res)
}, false, false)

/**
 * 获取当前系统配置的登录类型
 */
let getLoginType = RouterConfigBuilder.routerConfigBuilder('/api/login/type', RouterConfigBuilder.METHOD_TYPE_GET, async (req, res) => {
  res.send(API_RES.showResult(LOGIN_TYPE))
}, false, false)

/**
 * 通用登录入口，根据配置自动路由到 UC 或 Normal 登录处理
 */
let login = RouterConfigBuilder.routerConfigBuilder('/api/login', RouterConfigBuilder.METHOD_TYPE_POST, async (req, res) => {
  switch (LOGIN_TYPE) {
    case 'uc':
      await handleUCLogin(req, res)
      break
    case 'normal':
      await handleNormalLogin(req, res)
      break
    default:
      res.send(API_RES.showError('请确认登录方式'))
  }
}, false, false)

/**
 * 登出接口，清除相关Cookie
 */
let logout = RouterConfigBuilder.routerConfigBuilder('/api/logout', RouterConfigBuilder.METHOD_TYPE_GET, async (req, res) => {
  res.clearCookie('fee_token')
  res.clearCookie('ucid')
  res.clearCookie('nickname')
  res.clearCookie('account')
  res.send(API_RES.showResult({}))
},
false,
false
)

/**
 * 处理普通账号密码登录逻辑
 * @param {Object} req 
 * @param {Object} res 
 */
const handleNormalLogin = async (req, res) => {
  const body = _.get(req, ['body'], {})
  const account = _.get(body, ['account'], '')
  const password = _.get(body, ['password'], '')

  // 根据账号查询用户信息
  const rawUser = await MUser.getSiteUserByAccount(account)
  // 检查用户是否存在或已被删除
  if (_.isEmpty(rawUser) || rawUser.is_delete === 1) {
    res.send(API_RES.showError('未注册'))
    return
  }
  
  // 验证密码：对比MD5哈希值
  const savePassword = _.get(rawUser, ['password_md5'], '')
  const passwordMd5 = MUser.hash(password)
  if (savePassword === passwordMd5) {
    // 密码正确，提取用户信息
    let nickname = _.get(rawUser, ['nickname'], '')
    let ucid = _.get(rawUser, ['ucid'], '')
    let avatarUrl = _.get(rawUser, ['avatar_url'], MUser.DEFAULT_AVATAR_URL)
    let registerType = _.get(rawUser, ['register_type'], MUser.REGISTER_TYPE_SITE)
    
    // 生成认证Token
    let token = Auth.generateToken(ucid, account, nickname)

    // 设置Cookie，有效期100天
    res.cookie('fee_token', token, { maxAge: 100 * 86400 * 1000, httpOnly: false })
    res.cookie('ucid', ucid, { maxAge: 100 * 86400 * 1000, httpOnly: false })
    res.cookie('nickname', nickname, { maxAge: 100 * 86400 * 1000, httpOnly: false })
    res.cookie('account', account, { maxAge: 100 * 86400 * 1000, httpOnly: false })
    
    // 返回登录成功信息及用户资料
    res.send(API_RES.showResult({ ucid, nickname, account, avatarUrl, registerType }))
  } else {
    res.send(API_RES.showError('密码错误'))
  }
}

/**
 * 处理UC统一认证登录逻辑
 * 1. 调用UC接口验证账号密码
 * 2. 获取UC用户详细信息
 * 3. 在本地系统中同步/注册用户
 * 4. 生成本地Token并登录
 * @param {Object} req 
 * @param {Object} res 
 */
const handleUCLogin = async (req, res) => {
  let { account, password } = req.body
  let ts = moment().unix() * 1000
  const appId = ucConfig.appID
  const appkey = ucConfig.appkey
  
  // 构造UC登录请求参数
  let formData = {
    cid: appId,
    un: account,
    pw: password
  }
  let headers = {
    ts,
    appId
  }
  
  // 生成签名并调用UC登录接口
  let sign = await UC.getSign(formData, headers, appkey)
  headers.sign = sign
  let loginResponse = await http.postForm(ucConfig.api + '/security/login', formData, {
    headers
  }).catch(err => {
    Logger.warn('登录接口响应异常 err =>', _.get(err, ['response', 'data'], {}))
    return _.set(
      {},
      ['data', 'msg'],
      _.get(err, ['response', 'data'], {})
    )
  })
  
  // 解析UC返回的UID
  let ucid = _.get(loginResponse, ['data', 'data', 'uid'], 0)
  let LoginErrorResponse = _.get(loginResponse, ['data', 'msg'], '登录失败')
  
  // 如果UID为0，表示登录失败
  if (ucid === 0) {
    if (LoginErrorResponse === 'USER_NOT_EXIST') {
      LoginErrorResponse = '用户名不存在'
    } else {
      if (LoginErrorResponse === 'PWD_INCORRECT') {
        LoginErrorResponse = '密码错误'
      }
    }
    res.send(API_RES.showError(LoginErrorResponse, 10001))
    return
  }
  
  // 登录成功后，进一步获取用户详细信息
  ts = moment().unix() * 1000
  const params = {
    ids: ucid
  }
  headers = {
    ts,
    appId
  }
  sign = UC.getSign(params, headers, appkey)
  headers.sign = sign
  
  // 调用UC用户信息查询接口
  let userInfoResponse = await http.get(ucConfig.api + '/ehr/user/agent', {
    params,
    headers
  }).catch(err => {
    Logger.warn('用户信息接口响应异常 err =>', _.get(err, ['response', 'data'], {}))
    return _.set(
      {},
      ['data', 'msg'],
      _.get(err, ['response', 'data'], {})
    )
  })
  
  let userInfo = _.get(userInfoResponse, ['data', 'data', 0], {})
  let userInfoError = _.get(userInfoResponse, ['data'], {})
  
  // 检查是否成功获取用户信息
  if (_.isEmpty(userInfo)) {
    res.send(API_RES.showError('用户信息获取失败, 请稍后再试', 10002, { userInfoError, ucid: ucid }))
    return
  }
  
  // 从UC返回结果中提取字段，并处理null值
  let mobile = _.get(userInfo, ['mobile'], '') // 手机号
  let nickname = _.get(userInfo, ['name'], '') // 昵称
  let email = _.get(userInfo, ['email'], `${account}@qq.com`) // 邮箱
  let avatarUrl = _.get(userInfo, ['avatar'], MUser.DEFAULT_AVATAR_URL) // 头像

  if (_.isNil(mobile)) {
    mobile = ''
  }
  if (_.isNil(nickname)) {
    nickname = ''
  }
  if (_.isNil(email)) {
    email = `${account}@qq.com`
  }
  if (_.isNil(avatarUrl)) {
    avatarUrl = MUser.DEFAULT_AVATAR_URL
  }

  // 检查本地系统是否存在该用户
  let user = await MUser.getByAccount(account)
  if (_.isEmpty(user) === true || user.is_delete === 1) {
    // 首次登录或用户被删，自动在本地系统中进行注册/恢复
    let isRegisterSuccess = await MUser.register(account, {
      account,
      mobile,
      ucid,
      nickname,
      email,
      avatarUrl
    })
    if (isRegisterSuccess === false) {
      res.send(API_RES.showError('uc登录失败, 请稍后再试'))
      return
    }
    // 重新获取注册后的用户信息
    user = await MUser.getByAccount(account)
  }

  // 提取最终用户信息用于生成Token
  account = _.get(user, ['account'], '')
  nickname = _.get(user, ['nickname'], '')
  ucid = _.get(user, ['ucid'], '')
  avatarUrl = _.get(user, ['avatar_url'], MUser.DEFAULT_AVATAR_URL)
  let registerType = _.get(user, ['register_type'], MUser.REGISTER_TYPE_SITE)
  
  // 生成本地认证Token
  let token = Auth.generateToken(ucid, account, nickname)
  
  // 设置Cookie
  res.cookie('fee_token', token, { maxAge: 100 * 86400 * 1000, httpOnly: false })
  res.cookie('ucid', ucid, { maxAge: 100 * 86400 * 1000, httpOnly: false })
  res.cookie('nickname', nickname, { maxAge: 100 * 86400 * 1000, httpOnly: false })
  res.cookie('account', account, { maxAge: 100 * 86400 * 1000, httpOnly: false })
  
  // 返回登录成功信息
  res.send(API_RES.showResult({ ucid, nickname, account, avatarUrl, registerType }))
}

export default {
  ...siteLogin,
  ...ucLogin,
  ...logout,
  ...normalLogin,
  ...getLoginType,
  ...login
}