var appium=require('appium');
var pathutil=require('../../util/pathutil')
var dateutil=require('../../util/dateutil')

appium.main({
  sessionOverride: true,
  //port: 4724,
  //launch: true,//在第一个 session 前，预启动应用 (iOS 需要 –app 参数，Android 需要 –app-pkg 和 –app-activity)
  //shell: [],//REPL模式--log-timestamp,将日志输出到指定文件
  webhook: '127.0.0.1:7109',
  //logTimestamp:true,
  log:pathutil.root('appium_log/'+dateutil.dateToStr()+'_'+new Date().getHours())
  //newCommandTimeout
  //
});
