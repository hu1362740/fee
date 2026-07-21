import env from '~/src/configs/env'

// 开发环境配置
const development = {
  loginType: 'normal', // 登录类型，uc(内部uc登录)/normal(普通登录)
  use: {
    kafka: false, // 是否使用kafka。如果没有kafka，设为false，并且指定下面的nginxLogFilePath
    alarm: false // 是否使用报警功能。如果启用，请在alarm配置里指定报警网址
  },
  nginxLogFilePath: 'D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/' // ngnix日志文件根路径，此路径下面的日志文件命名格式请参照readme
}
const testing = {
  loginType: 'normal', // 登录类型，uc(内部uc登录)/normal(普通登录)
  use: {
    kafka: false, // 是否使用kafka。如果没有kafka，设为false，并且指定下面的nginxLogFilePath
    alarm: false // 是否使用报警功能。如果启用，请在alarm配置里指定报警网址
  },
	nginxLogFilePath: '/var/log/nginx/' // ngnix日志文件根路径，此路径下面的日志文件命名格式请参照readme
}

const production = {
  loginType: 'normal', // 登录类型，uc(内部uc登录)/normal(普通登录)
  use: {
    kafka: false, // 是否使用kafka。如果没有kafka，设为false，并且指定下面的nginxLogFilePath
    alarm: false // 是否使用报警功能。如果启用，请在alarm配置里指定报警网址
  },
  nginxLogFilePath: 'D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/' // ngnix日志文件根路径，此路径下面的日志文件命名格式请参照readme
}

const config = {
  development,
  testing,
  production
}
export default config[env]
