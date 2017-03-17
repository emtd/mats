var http = require('http');
var url=require('url');
var proChild=require('child_process');
var events=require('events');
var fs=require('fs')
var path=require('path')

var Promise=require('bluebird');
var _=require('lodash');
var uuid=require('uuid');

var dbapi=require('../../db/api');
var logger = require('../../util/logger');
var wireutil = require('../../wire/util');
var wirerouter = require('../../wire/router');
var wire = require('../../wire')
var pathutil=require('../../util/pathutil');
var datautil=require('../../util/datautil');
var dateutil=require('../../util/dateutil');
var jwtutil=require('../../util/jwtutil');
var zmqutil=require('../../util/zmqutil');
var fileutil=require('../../util/fileutil')
var deviceutil=require('../../util/deviceutil')
var srv = require('../../util/srv');
var lifecycle = require('../../util/lifecycle');
var support=require('./support');

module.exports = function(options) {
  var log = logger.createLogger('emtc');

  // Input
  var sub = zmqutil.socket('sub')
  Promise.map(options.endpoints.sub, function (endpoint) {
    return srv.resolve(endpoint).then(function (records) {
      return srv.attempt(records, function (record) {
        log.info('Receiving input from "%s"', record.url)
        sub.connect(record.url)
        return Promise.resolve(true)
      })
    })
  })
    .catch(function (err) {
      log.fatal('Unable to connect to sub endpoint', err)
      lifecycle.fatal()
    })

  // Establish always-on channels
  ;
  [wireutil.global].forEach(function (channel) {
    log.info('Subscribing to permanent channel "%s"', channel)
    sub.subscribe(channel)
  })

  //sub.subscribe('TKsuZTI/eDt6MlpbIf76UbclaF4=')

  // Output
  var push = zmqutil.socket('push')
  Promise.map(options.endpoints.push, function (endpoint) {
    return srv.resolve(endpoint).then(function (records) {
      return srv.attempt(records, function (record) {
        log.info('Sending output to "%s"', record.url)
        push.connect(record.url)
        return Promise.resolve(true)
      })
    })
  })
    .catch(function (err) {
      log.fatal('Unable to connect to push endpoint', err)
      lifecycle.fatal()
    })

  sub.on('message', wirerouter()
    .on(wire.DeviceIntroductionMessage, function (channel, message) {
      var msg = {
        serial: message.serial,
        status: message.status,
        present: false,
        ready: false
      }
      support.sendDevState(msg)
    })
    .on(wire.DevicePresentMessage, function (channel, message) {
      support.sendDevState({serial: message.serial, present: true})
    })
    .on(wire.DeviceStatusMessage, function (channel, message) {
      support.sendDevState({serial: message.serial, status: message.status})
    })
    .on(wire.DeviceReadyMessage, function (channel, message) {
      support.sendDevState({serial: message.serial, ready: true})
    })
    .on(wire.DeviceAbsentMessage, function (channel, message) {
      support.sendDevState({serial: message.serial, present: false})
    })
    .handler())
  /*sub.on('message', function (channel, data) {
    channelRouter.emit(channel.toString(), channel, data)
  })*/

  var scriptType = {
    python: 'py',
    ruby: 'rb',
    php: 'php',
    nodejs: 'js'
  }
  var bufReceive=[]
  var server = http.createServer(function (req, res) {
    var pathName = url.parse(req.url).pathname;
    var body = ''
    req.on('data', function (data) {
      body += data;
    })
    req.on('end', function () {
      Promise.try(function () {
        var data = JSON.parse(body);
        console.log('data:', data)
        if (pathName != '/') {
          pushQueue(pathName + ' ' + body);
        }

        switch (pathName) {
          case '/'://appium服务启动
            if (data.method = 'collect') {
              //[Appium] Appium REST http interface listener started on
              if (data.params.message.indexOf('listener started on') != -1 || data.params.message.indexOf('The requested port may already be in use') != -1) {
                appiumState = true;
                pushQueue('appiumState = true;')
              }
              //[Appium] Received SIGINT - shutting down
              else if (data.params.message.indexOf('shutting down') != -1) {
                appiumState = false;
                startAppium();
                pushQueue('appiumState = false;reboot appium...');
              }
              //error时,需要关闭,重启
            }
            break;
          case support.postPath.occupyDevice:
            occupyDevice(true);
            break;
          case support.postPath.releaseDevice:
            occupyDevice(false);
            break;
          case support.postPath.scriptRun:
            scriptRun()
            break;
          case support.postPath.getDevices:
            getDevices();
            break;
          case support.postPath.getDevState:
            getDevState();
            break;
          default:
            break;
        }

        function scriptRun() {
          log.info('you have enter emtc scriptRun')
          var taskList = data.tasks;
          var scriptName = data.spath;
          var env = data.env;
          var token=data.token;

          var resObj = {
            success: false,
            description: ''
          }

          //参数必须是指定的格式
          if (!taskList || !scriptName || !env || !token||taskList.constructor.name != 'Array' || typeof(scriptName) != 'string' || typeof(env) != 'object'||typeof(token)!='string') {
            resObj.success = false;
            resObj.description = 'post data error!';
            return returnRes(resObj)
          }

          //增加serial序列号长度不能为0的验证
          if (taskList.length == 0) {
            resObj.success = false;
            resObj.description = 'no tasks!'
            return returnRes(resObj)
          }

          //脚本必须是带后缀的文件
          var suffix = scriptName.lastIndexOf('.')//判断是否带后缀
          if (suffix == -1) {
            resObj.success = false;
            resObj.description = 'The script must be a file with a suffix!'
            return returnRes(resObj)
          }

          //必须是指定类型的脚本
          var type = scriptName.substring(suffix + 1);
          if (type != scriptType.python) {
            resObj.success = false;
            resObj.description = 'only supports python scripts';
            return returnRes(resObj)
          }

          //脚本文件是否存在
          var scriptsPath = pathutil.root('script/' + scriptName);
          if (!fs.existsSync(scriptsPath)) {
            resObj.success = false;
            resObj.description = 'the script file can not be find!'
            return returnRes(resObj)
          }

          var user = jwtutil.decode(token, options.secret);
          if (!user) {
            resObj.success = false;
            resObj.description = 'token error!'
            return returnRes(resObj)
          }
          user.email = user.sub.toString()
          user.name = user.email;

          var loadUser = new Promise(function (resolve, reject) {
            dbapi.loadUser(user.email)
              .then(function (u) {
                if (u) {
                  resolve(u);
                } else {
                  dbapi.saveUserAfterLogin({
                    email: user.email,
                    name: user.name,
                    ip: require('my-local-ip')()
                  })
                    .then(function (stats) {
                      dbapi.loadUser(user.email)
                        .then(function (us) {
                          resolve(us)
                        })
                    })
                }
              })
          })
          loadUser.catch(function () {
            log.error('user error!')
            resObj.success = false;
            resObj.description = 'server error!';
            return returnRes(JSON.stringify(resObj));
          })

          //返回哪些设备是不可用的,哪些是找不到的,
          var argErrList = [];
          var noExist = [];
          var noAvailable = [];
          var capDirList = [];

          Promise.map(taskList, function (item) {
            return new Promise(function (resolve, reject) {
              if (typeof(item) != 'object') {
                argErrList.push(item);
                return resolve();
              }
              var serial = item.serial;
              var taskId = item.taskId;

              var loadDevice = dbapi.loadDevice(serial);
              //如果没有设备,也会创建文件夹,
              env.CAPTUREPATH = pathutil.logPath(dateutil.dateToStr(new Date()), serial, process.env.autoCapName)
              capDirList.push(env.CAPTUREPATH);
              Promise.all([loadUser, loadDevice])
                .spread(function (dbUser, dev) {
                  user = dbUser;
                  if (!dev) {
                    noExist.push(serial)
                    return resolve();
                  }

                  datautil.normalize(dev, user);
                  var fields = 'serial,present,ready,using,owner,token';
                  var responseDevice = _.pick(dev, fields.split(','))
                  console.log('responseDevice:',responseDevice)
                  if (!responseDevice.present || !responseDevice.ready || (responseDevice.token && responseDevice.token != user.email)) {//||
                    noAvailable.push(serial)
                    log.warn(serial, ' is not available')
                    return resolve();
                  }
                  resolve();
                  //向websocket发送默认不接受屏幕输入的信息
                  push.send([
                    dev.channel
                    , wireutil.envelope(new wire.ScreenResponseMessage(false))
                  ])

                  joinGroup()
                    .then(function(){
                      appiumCheck();
                    })

                  function joinGroup() {
                    return new Promise(function (resolve, reject) {
                      log.info('enter scriptRun joinGroup')
                      sub.subscribe(dev.channel);
                      log.info('sub subscribe '+dev.channel)
                      var messageListener = wirerouter()
                        .on(wire.TransactionDoneMessage, function (channel, message) {
                          log.info('receive JoinGroup TransactionDoneMessage')
                          clearTimeout(responseTimer)
                          sub.unsubscribe(dev.channel)
                          channelEvent.removeListener(dev.channel, messageListener)
                          if (!message.success) {
                            reject('join group failed')
                          }else{
                            resolve()
                          }
                        })
                        .on(wire.JoinGroupMessage, function (channel, message) {
                          log.info('receive JoinGroupMessage')
                          if (message.serial === serial && message.owner.email === user.email) {
                            clearTimeout(responseTimer)
                            channelEvent.removeListener(wireutil.global, messageListener)
                            dev.owner = message.owner;
                            resolve()
                          }
                        })
                        .handler()

                      var channelEvent = new events.EventEmitter();
                      channelEvent.on(dev.channel,messageListener);
                      channelEvent.on(wireutil.global, messageListener);

                      sub.on('message', function (channel, data) {
                        channelEvent.emit(channel.toString(), channel, data)
                      })

                      // Timer will be called if no JoinGroupMessage is received till 5 seconds
                      var responseTimer = setTimeout(function () {
                        channelEvent.removeListener(wireutil.global, messageListener)
                        sub.unsubscribe(dev.channel)
                        reject('Device is not responding')
                      }, 10000)

                      var usage = 'automation'
                      log.info('send GroupMessage')
                      push.send([
                        dev.channel
                        , wireutil.envelope(
                          new wire.GroupMessage(
                            new wire.OwnerMessage(
                              user.email
                              , user.name
                              , user.group//lgl
                            )
                            , options.groupTimeout || null
                            , wireutil.toDeviceRequirements({
                              serial: {
                                value: serial
                                , match: 'exact'
                              }
                            })
                            , usage
                          )
                        )
                      ])
                    })
                  }

                  function appiumCheck() {
                    log.info('appiumCheck:', appiumState)
                    if (appiumState) {
                      startScript();
                    } else {
                      setTimeout(function () {
                        appiumCheck()
                      }, 3000)
                    }
                  }

                  function startScript() {
                    log.info('enter scriptRun startScript')
                    return new Promise(function (resolve, reject) {
                      var type = scriptsPath.substring(scriptsPath.lastIndexOf('.') + 1);
                      switch (type) {
                        case scriptType.ruby:
                          runRuby()
                            .then(function () {//运行结束,断开链接
                              log.info('ruby script execute over successfully');
                              //resolve()
                            })//!*!/
                          break;
                        case scriptType.python:
                          runPython()
                            .then(function () {//运行结束,断开链接
                              resolve()
                              log.info('python script execute over successfully');
                            })
                          break;
                        case scriptType.nodejs:
                          break;
                        case scriptType.php:
                          break;
                        default:
                          break;
                      }
                    })
                      .finally(function () {
                        disconnect(true);//正常结束
                      })
                  }

                  function runPython(){
                    log.info('enter runPython')
                    var testResult = {
                      error: null,//错误对象
                      total: 0,//脚本总数
                      fail: 0,//执行失败的脚本数
                      tasklogurl: '',//日志文件
                      taskperformanceurl: '',//性能文件
                      images: '',//截图路径
                      serial: serial,//设备序列号
                      task_id: taskId,//任务ID
                      reportcontent: ''//,结果描述,富文本
                    }
                    return new Promise(function (resolve, reject) {
                      mkCaptureDir
                        .then(function () {
                          var path = getLogName();
                          startLog(path)
                          env.UDID = dev.serial;
                          env.VERSION = dev.version;
                          env.DEVNAME=dev.model;
                          log.info('runPython command');
                          proChild.exec(getEnvStr() +'python ' + scriptsPath, function (err, stdout, stderr) {
                            stopLog();
                            var splitStr = 'data/'
                            var logPath = pathutil.logPath(path.datePath, serial, process.env.logName) + '/' + path.logName;//日志文件
                            testResult.tasklogurl = logPath.substring(logPath.indexOf(splitStr) + splitStr.length)
                            var perPath = pathutil.logPath(path.datePath, serial, process.env.perName) + '/' + path.perName;
                            testResult.taskperformanceurl = perPath.substring(perPath.indexOf(splitStr) + splitStr.length)
                            if (err) {
                              testResult.error = err;
                            }
                            if (stdout) {
                              log.info('stdout:', stdout)
                              //生成执行成功的脚本数,失败的脚本数,富文本描述
                              testResult.total = 0;
                              testResult.fail = 0;
                              testResult.reportcontent = stdout+ '\r\n';
                            }
                            if (stderr) {
                              //stderr = stderr.replace('\'', '\\\'')
                              log.info('stderr:', stderr)
                              /*stderr: test_add_function (__main__.CaculatorTests) ... FAIL

                               ======================================================================
                               FAIL: test_add_function (__main__.CaculatorTests)
                               ----------------------------------------------------------------------
                               Traceback (most recent call last):
                               File "/home/mat/myfolder/project/STF/1stfTest/stf0105/lib/units/api/controllers/autoTest/python/scripts/hello_appium.py", line 27, in test_add_function
                               self.assertEqual('16001', self.driver.find_element_by_id("com.sec.android.app.popupcalculator:id/txtCalc").text)
                               AssertionError: '16001' != u'15,995+6\n=16,001. \u6b63\u5728\u7f16\u8f91\u3002'

                               ----------------------------------------------------------------------
                               Ran 1 test in 33.814s

                               FAILED (failures=1)
                               *!/
                               /!* test_add_function (__main__.CaculatorTests) ... ok
                               ----------------------------------------------------------------------
                               Ran 1 test in 33.953s
                               OK
                               _function (__main__.CaculatorTests*!/
                               /!*stderr: test_add_function (__main__.CaculatorTests) ... ERROR

                               ======================================================================
                               ERROR: test_add_function (__main__.CaculatorTests)
                               ----------------------------------------------------------------------
                               Traceback (most recent call last):
                               File "/home/mat/myfolder/project/STF/1stfTest/stf/script/hello_appium.py", line 15, in setUp
                               self.driver = webdriver.Remote('http://localhost:4723/wd/hub', desired_caps)
                               File "build/bdist.linux-x86_64/egg/appium/webdriver/webdriver.py", line 36, in __init__
                               super(WebDriver, self).__init__(command_executor, desired_capabilities, browser_profile, proxy, keep_alive)
                               File "/usr/local/lib/python2.7/dist-packages/selenium-3.0.2-py2.7.egg/selenium/webdriver/remote/webdriver.py", line 92, in __init__
                               self.start_session(desired_capabilities, browser_profile)
                               File "/usr/local/lib/python2.7/dist-packages/selenium-3.0.2-py2.7.egg/selenium/webdriver/remote/webdriver.py", line 179, in start_session
                               response = self.execute(Command.NEW_SESSION, capabilities)
                               File "/usr/local/lib/python2.7/dist-packages/selenium-3.0.2-py2.7.egg/selenium/webdriver/remote/webdriver.py", line 236, in execute
                               self.error_handler.check_response(response)
                               File "/usr/local/lib/python2.7/dist-packages/selenium-3.0.2-py2.7.egg/selenium/webdriver/remote/errorhandler.py", line 192, in check_response
                               raise exception_class(message, screen, stacktrace)
                               WebDriverException: Message: An unknown server-side error occurred while processing the command. Original error: Screen did not unlock successfully, retrying


                               ----------------------------------------------------------------------
                               Ran 1 test in 277.691s

                               FAILED (errors=1)
                               */
                              testResult.reportcontent += stderr;
                              var ran = stderr.substring(stderr.indexOf('Ran'));
                              var total = Number(ran.substring(3, ran.indexOf('test in')))//.replace(/\ +/g, ''));
                              testResult.total = isNaN(total) ? null : total;

                              var errIndex = ran.indexOf('errors');
                              if (errIndex != -1) {
                                var err = Number(ran.substring(errIndex + 'errors'.length + 1, ran.indexOf(')')))//.replace(/\ +/g, ''));
                                testResult.fail = isNaN(err) ? null : err;
                                testResult.error = stderr;
                              }

                              var failIndex = ran.indexOf('failures');
                              if (failIndex != -1) {
                                var fail = Number(ran.substring(failIndex + 'failures'.length + 1, ran.indexOf(')')).replace(/\ +/g, ''));
                                testResult.fail = isNaN(fail) ? null : fail;
                              }

                              var okIndex = ran.indexOf('OK')
                              if (okIndex != -1) {
                                testResult.fail = 0;
                              }
                            }

                            //设置截图路径:
                            fs.readdir(env.CAPTUREPATH, function (err, files) {
                              if (!files || files.length == 0) {
                                support.sendTestResult_script(testResult)
                                resolve();
                                return;
                              }
                              var path = env.CAPTUREPATH.substring(env.CAPTUREPATH.indexOf(splitStr) + splitStr.length)
                              var pathList = '';
                              for (var i = 0; i < files.length; i++) {
                                pathList += path + '/' + files[i] + ',';
                              }
                              testResult.images = pathList == '' ? '' : pathList.substring(0, pathList.length - 2);
                              resolve()
                              support.sendTestResult_script(testResult)
                            })
                          })
                        })
                        .catch(function (err) {
                          log.error('catch0:', err)
                          disconnect(false)//异常结束
                        })
                    })
                      .catch(function (err) {
                        log.error('catch1:', err)
                      })
                  }

                  function runRuby(){
                    log.info('enter runRuby')
                  }

                  function disconnect(flag){
                    log.info('enter emtc scriptRun disconnect')
                    push.send([dev.channel,wireutil.envelope(new wire.ScriptAutoEndMessage(dev.serial,flag))])
                    /*return new Promise(function (resolve, reject) {
                      var channelEvent = new events.EventEmitter();
                      var messageListener = wirerouter()
                        .on(wire.LeaveGroupMessage, function (channel, message) {
                          if (message.serial === serial && message.owner.email === user.email) {
                            log.info('receive LeaveGroupMessage')
                            clearTimeout(responseTimer)
                            channelEvent.removeListener(wireutil.global, messageListener)
                            resolve()
                          }
                        })
                        .handler()
                      channelEvent.on(wireutil.global, messageListener)
                      sub.on('message', function (channel, data) {
                        channelEvent.emit(channel.toString(), channel, data)
                      })
                      // Timer will be called if no JoinGroupMessage is received till 5 seconds
                      var responseTimer = setTimeout(function () {
                        channelEvent.removeListener(wireutil.global, messageListener)
                      }, 5000)

                      push.send([
                        dev.channel
                        , wireutil.envelope(
                          new wire.UngroupMessage(
                            wireutil.toDeviceRequirements({
                              serial: {
                                value: serial
                                , match: 'exact'
                              }
                            })
                          )
                        )
                      ])
                    })
                      .then(function () {
                        log.info('setToken null')
                        dbapi.setDeviceToken(serial, null)
                      })*/
                  }

                  function getLogName() {
                    var path = {
                      datePath: dateutil.dateToStr(new Date()),
                      logName: taskId + '_' + Date.now() + 'tasklogs.json',
                      perName: taskId + '_' + Date.now() + 'taskperformances.json'
                    }
                    return path;
                  }

                  function getEnvStr() {
                    var envStr = ''
                    if (env && typeof(env) == 'object') {
                      for (key in env) {
                        envStr += ('export ' + key + '=\"' + env[key] + '\";')
                      }
                    }
                    return envStr;
                  }

                  function startLog(path) {
                    log.info('startLog:',path)
                    push.send([
                      dev.channel
                      , wireutil.transaction(
                        logChannel
                        , new wire.LogcatStartMessage([], path.datePath, path.logName, path.perName)//filter,date,tasklog,taskperformance
                      )
                    ])
                  }

                  function stopLog() {
                    log.info('stopLog')
                    push.send([
                      dev.channel
                      , wireutil.transaction(
                        logChannel
                        , new wire.LogcatStopMessage()//filter,date,tasklog,taskperformance
                      )
                    ])
                  }

                  var logChannel = 'txs_' + uuid.v4();

                })
            })
          })
            .then(function () {
              if (argErrList.length > 0) {
                resObj.success = false;
                resObj.description = 'post data error:' + argErrList;
                return returnRes(resObj);
              }
              if (noExist.length > 0 || noAvailable.length > 0) {
                resObj.success = false;
                resObj.description = (noExist.length > 0 ? 'devices ' + noExist.join(',') + ' is not find.' : '') + (noAvailable.length > 0 ? 'devices ' + noAvailable.join(',') + ' is not available.' : '');
                return returnRes(resObj)
              }
              else {
                returnRes({
                  success: true
                  , description: 'The script will be called successfully!'
                })
              }
            })
          var mkCaptureDir = new Promise(function (resolve, reject) {
            function mkDir() {
              var item = capDirList.pop()
              if (item) {
                fileutil.mkdirs(item)
                  .then(function () {
                    mkDir()
                  })
              } else {
                resolve()
              }
            }
            mkDir()
          })

        }

        function getDevState() {
          log.info('you have enter emtc getDevState')
          if (!data || !data.serial || data.serial.constructor.name != 'Array') {
            return returnRes({
              success: false,
              description: 'post data error!'
            })
          }

          var fields = 'serial,present,ready,status,ip';
          if (data.serial.length == 0) {
            log.info('all device state')
            dbapi.loadDevices()
              .then(function (cursor) {
                return Promise.promisify(cursor.toArray, cursor)()
                  .then(function (list) {
                    return returnRes({
                      success: true,
                      data: getStateList(list)
                    })
                  })
              })
              .catch(function (err) {
                console.warn('emtc support get devices error:', err)
                return returnRes({
                  success: true,
                  data: null
                });
              })
          }
          else if (data.serial.length == 1) {
            log.info('single device state')
            dbapi.loadDevice(data.serial[0])
              .then(function (device) {
                if (device == null) {
                  return returnRes({
                    success: true,
                    data: [null]
                  })
                }
                var stateDev = _.pick(device, fields.split(','))
                return returnRes({
                  success: true,
                  data: [getState(stateDev)]
                })
              })
              .catch(function (err) {
                console.warn('emtc support GetDeviceInfo error:', err)
                return returnRes({
                  success: true,
                  data: null
                })
              })
          }
          else {
            log.info('multy device state')
            dbapi.loadDevicesBySerials(data.serial)
              .then(function (cursor) {
                return Promise.promisify(cursor.toArray, cursor)()
                  .then(function (list) {
                    return returnRes({
                      success: true,
                      data: getStateList(list)
                    })
                  })
              })
              .catch(function (err) {
                return returnRes({
                  success: true,
                  data: null
                })
              })
          }

          function getState(dev) {
            var data = {
              serial: dev.serial,
              ip: dev.ip,
              detail: dev,
              state: support.devState.absent
            }
            if (dev.present) {
              if (dev.status != null && dev.status != 3) {
                data.state = dev.status;//status[]
              }
              else if (dev.status != null) {
                if (dev.ready) {
                  data.state = support.devState.ready;
                } else {
                  data.state = support.devState.prepare;
                }
              }
            }
            else {
              if (dev.status && dev.status != 3) {
                data.state = dev.status
              }
            }
            return data;
          }

          function getStateList(list) {
            return _.map(list, function (dev) {
              var tempDev = _.pick(dev, fields.split(','));
              return getState(tempDev);
            })
          }
        }

        function getDevices() {
          log.info('you have enter emtc getDevices')
          if (!data || !data.serial || data.serial.constructor.name != 'Array') {
            return returnRes({
              success: false,
              description: 'post data error!'
            })
          }

          if (data.serial.length == 0) {
            log.info('all device')
            dbapi.loadDevices()
              .then(function (cursor) {
                return Promise.promisify(cursor.toArray, cursor)()
                  .then(function (list) {
                    return returnRes({
                      success: true,
                      data: list
                    })
                  })
              })
              .catch(function (err) {
                console.warn('emtc support get devices error:', err)
                return returnRes({
                  success: true,
                  data: null
                });
              })
          }
          else if (data.serial.length == 1) {
            log.info('one device')
            dbapi.loadDevice(data.serial[0])
              .then(function (device) {
                return returnRes({
                  success: true,
                  data: [device]
                })
              })
              .catch(function (err) {
                console.warn('emtc support GetDeviceInfo error:', err)
                return returnRes({
                  success: true,
                  data: null
                })
              })
          }
          else {
            log.info('multy device')
            dbapi.loadDevicesBySerials(data.serial)
              .then(function (cursor) {
                return Promise.promisify(cursor.toArray, cursor)()
                  .then(function (list) {
                    return returnRes({
                      success: true,
                      data: list
                    })
                  })
              })
              .catch(function (err) {
                return returnRes({
                  success: true,
                  data: null
                })
              })
          }
        }

        function occupyDevice(flag) {
          log.info('you have enter occupyDevice');
          //返回对象,设备占用正常后,sucess为true,其他为null,设备无法占用时,device不为空,其他异常时,device为空,description不为空.
          var returnObj = {
            succes: false,
            device: null,
            description: null
          }
          //参数错误
          if (!data || !data.serial || !data.token || typeof(data.serial) != "string" || typeof(data.token) != "string") {//
            returnObj.description = 'argument error!';
            return returnRes(returnObj)
          }
          //用户token错误
          var user = jwtutil.decode(data.token, options.secret);
          if (!user) {
            returnObj.description = 'token error!'
            return returnRes(returnObj)
          }
          user.email = user.sub.toString()
          user.name = user.email;
          dbapi.loadDevice(data.serial)
            .then(function (device) {
              //device不存在,返回
              if (!device) {
                returnObj.description = 'Device not found'
                return returnRes(returnObj)
              }
              var fields = 'serial,present,ready,owner,token';
              var responseDevice = _.pick(device, fields.split(','))
              //占用设备
              if (flag) {
                var occupyFlag = responseDevice.present && responseDevice.ready && !responseDevice.token && !responseDevice.owner;
                if (!occupyFlag) {//不具备占用条件
                  returnObj.device = responseDevice;
                  return returnRes(returnObj)
                }
                updateToken(device.serial, user.email)
              }
              //释放设备
              else {
                if (!responseDevice.token) {//已经释放过了
                  returnObj.description = 'device ' + data.serial + ' has releaseed before,no need release again!'
                  return returnRes(returnObj)
                }

                datautil.normalize(device, user)
                if (!device.using) {
                  return updateToken(device.serial, null);
                }

                log.info('device is using,need to kick first')
                var responseChannel = 'txn_' + uuid.v4()
                sub.subscribe(responseChannel)

                // Timer will be called if no JoinGroupMessage is received till 5 seconds
                var timer = setTimeout(function () {
                  sub.unsubscribe(responseChannel)
                  log.error('release device,send group.kick,Device is not responding')
                }, 5000)

                sub.on('message', wirerouter()
                  .on(wire.LeaveGroupMessage, function (channel, message) {
                    log.info('emtcService receive LeaveGroupMessage')
                    if (message.serial === device.serial) {
                      clearTimeout(timer)
                    }
                  })
                  .on(wire.TransactionDoneMessage, function (channel, message) {
                    log.info('emtcService receive group.kick TransactionDoneMessage')
                    sub.unsubscribe(responseChannel)
                    if (message.success) {
                      dbapi.unsetDeviceOwner(data.serial)
                      dbapi.unsetDeviceUsage(data.serial)
                    }
                    updateToken(device.serial, null)
                  })
                  .on(wire.TransactionProgressMessage, function (channel, message) {
                    log.info('emtcService receive group.kick TransactionProgressMessage:', message)
                  })
                  .handler())

                log.info('send UngroupMessage')
                //发送group.kick信息
                push.send([
                  device.channel
                  , wireutil.transaction(
                    responseChannel
                    , new wire.UngroupMessage(
                      wireutil.toDeviceRequirements({serial: {value: device.serial, match: 'exact'}})
                    )
                  )
                ])

                //需要弄push吗?发送一个离线的消息给前端
              }

              function updateToken(serial, value) {
                dbapi.setDeviceToken(serial, value)
                  .then(function () {
                    log.info((flag ? 'occupy' : 'release' ) + ' device successfully');
                    returnObj.succes = true;
                    return returnRes(returnObj)
                  })
                  .catch(function (err) {
                    //此处的目的是确认token的更新是否成功.
                    dbapi.loadDevice(serial)
                      .then(function (device) {
                        if (!device) {
                          console.error('error!')
                        }
                        //第一个条件是占用,第二个是释放
                        if ((flag && device.token == user.email) || (!flag && !device.token)) {
                          returnObj.succes = ture;
                        } else {
                          returnObj.device = responseDevice;//此处的device和上面的responseDevice是一样的
                        }
                        return returnRes(returnObj)
                      })
                      .catch(function (err) {
                        returnObj.description = 'Failed to load device ' + data.serial;
                        return returnRes(returnObj);
                      })
                  })
              }
            })
            .catch(function (err) {
              returnObj.description = 'Failed to load device ' + data.serial;
              log.error('occupyDevice error: ', data.serial, err)
              return returnRes(returnObj);
            })
        }

        function scriptRemoteRun() {
          log.info('you have enter emtc scriptRun')
          var taskList = data.tasks;
          var scriptName = data.spath;
          var env = data.env;

          var resObj = {
            success: false,
            description: ''
          }

          //参数必须是指定的格式
          if (!taskList || !scriptName || !env || taskList.constructor.name != 'Array' || typeof(scriptName) != 'string' || typeof(env) != 'object') {
            resObj.success = false;
            resObj.description = 'post data error!';
            return returnRes(resObj)
          }

          //增加serial序列号长度不能为0的验证
          if (taskList.length == 0) {
            resObj.success = false;
            resObj.description = 'no tasks!'
            return returnRes(resObj)
          }

          //脚本必须是带后缀的文件
          var suffix = scriptName.lastIndexOf('.')//判断是否带后缀
          if (suffix == -1) {
            resObj.success = false;
            resObj.description = 'The script must be a file with a suffix!'
            return returnRes(resObj)
          }

          //必须是指定类型的脚本
          var type = scriptName.substring(suffix + 1);
          if (type != scriptType.python) {
            resObj.success = false;
            resObj.description = 'only supports python scripts';
            returnRes(resObj)
          }

          //脚本文件是否存在
          var scriptsPath = pathutil.root('script/' + scriptName);
          if (!fs.existsSync(scriptsPath)) {
            resObj.success = false;
            resObj.description = 'the script file can not be find!'
            returnRes(resObj)
          }

          var user;
          var loadUser = new Promise(function (resolve, reject) {
            dbapi.loadUser(process.env.emtcUserName)
              .then(function (emtcUser) {
                if (emtcUser) {
                  resolve(emtcUser);
                } else {
                  dbapi.saveUserAfterLogin({
                    email: process.env.emtcUserName,
                    name: 'emtc',
                    ip: require('my-local-ip')()
                  })
                    .then(function (stats) {
                      dbapi.loadUser(process.env.emtcUserName)
                        .then(function (emtcUser) {
                          resolve(emtcUser)
                        })
                    })
                }
              })
          })
          loadUser.catch(function () {
            log.error('emtc@pactera.com is not exist!')
            resObj.success = false;
            resObj.description = 'server error!';
            return returnRes(JSON.stringify(resObj));
          })

          //返回哪些设备是不可用的,哪些是找不到的,
          var argErrList = [];
          var noExist = [];
          var noAvailable = [];
          var capDirList = [];

          Promise.map(taskList, function (item) {
            return new Promise(function (resolve, reject) {
              if (typeof(item) != 'object') {
                argErrList.push(item);
                return resolve();
              }
              var serial = item.serial;
              var taskId = item.taskId;

              var loadDevice = dbapi.loadDevice(serial);
              //如果没有设备,也会创建文件夹,
              env.CAPTUREPATH = pathutil.logPath(dateutil.dateToStr(new Date()), serial, process.env.autoCapName)
              capDirList.push(env.CAPTUREPATH);

              Promise.all([loadUser, loadDevice])
                .spread(function (emtcUser, dev) {
                  /*if (!emtcUser) {
                   log.error('emtc@pactera.com is not exist!')
                   resObj.success = false;
                   resObj.description = 'server error!';
                   return returnRes(JSON.stringify(resObj));
                   }*/
                  user = emtcUser;
                  if (!dev) {
                    noExist.push(serial)
                    return resolve();
                  }

                  datautil.normalize(dev, user);
                  var fields = 'serial,present,ready,using,owner,token';
                  var responseDevice = _.pick(dev, fields.split(','))
                  if (!responseDevice.present || !responseDevice.ready || responseDevice.using || responseDevice.owner || (responseDevice.token && responseDevice.token != process.env.emtcUserName)) {
                    noAvailable.push(serial)
                    log.warn(serial, ' is not available')
                    return resolve();
                  }
                  //占用设备
                  log.info('setDeviceToken')
                  dbapi.setDeviceToken(serial, user.email)
                    .then(function () {
                      return joinGroup()
                    })
                    .then(function () {
                      log.info('joinGroup.then')
                      if (!dev.owner) {
                        throw new Error('occupy device failed')
                      }
                      datautil.normalize(dev, user);
                      console.log('device:', dev.present, dev.ready, dev.owner, dev.using)
                      if (!deviceutil.isOwnedByUser(dev, user)) {
                        throw new Error('Device is not owned by you')
                      }
                      return connectRemote()
                    })
                    .then(function (connectUrl) {
                      log.info('connectRemote.then:', connectUrl)
                      if (!connectUrl) {
                        log.error('cannot connect to Device')
                        throw new Error('cannot connect to Device')
                      }

                      appiumCheck(connectUrl);
                    })
                    .catch(function (err) {
                      log.error('spread error:', err)
                      returnRes({
                        succes: false,
                        description: err
                      })
                      //joinGroup reject
                      //occupy device failed
                      //Device is not owned by you
                      //remote connect,Device is not responding
                      //cannot connect to Device
                    })

                  function startScript(connectUrl) {
                    log.info('enter scriptRun startScript')
                    return new Promise(function (resolve, reject) {
                      var type = scriptsPath.substring(scriptsPath.lastIndexOf('.') + 1);
                      switch (type) {
                        case scriptType.ruby:
                          runRuby(connectUrl)
                            .then(function () {//运行结束,断开链接
                              log.info('ruby script execute over successfully');
                              resolve()
                            })//!*!/
                          break;
                        case scriptType.python:
                          runPython(connectUrl)
                            .then(function () {//运行结束,断开链接
                              resolve()
                              log.info('script execute over successfully');
                            })
                          break;
                        case scriptType.nodejs:
                          break;
                        case scriptType.php:
                          break;
                        default:
                          break;
                      }
                    })
                      .finally(function () {
                        disconnect()
                      })
                  }

                  function runPython(connectUrl) {
                    log.info('enter runPython')
                    var testResult = {
                      error: null,//错误对象
                      total: 0,//脚本总数
                      fail: 0,//执行失败的脚本数
                      tasklogurl: '',//日志文件
                      taskperformanceurl: '',//性能文件
                      images: '',//截图路径
                      serial: serial,//设备序列号
                      task_id: taskId,//任务ID
                      reportcontent: ''//,结果描述,富文本
                    }
                    //FAILED (errors=1)
                    return new Promise(function (resolve, reject) {
                      mkCaptureDir
                        .then(function () {
                          var path = getLogName();
                          startLog(path)
                          env.UDID = connectUrl;
                          env.VERSION = dev.version;
                          log.info('runPython command')
                          proChild.exec(getEnvStr() + 'adb connect ' + connectUrl + ';python ' + scriptsPath, function (err, stdout, stderr) {
                            stopLog()
                            var splitStr = 'data/'
                            var logPath = pathutil.logPath(path.datePath, serial, process.env.logName) + '/' + path.logName;//日志文件
                            testResult.tasklogurl = logPath.substring(logPath.indexOf(splitStr) + splitStr.length)
                            var perPath = pathutil.logPath(path.datePath, serial, process.env.perName) + '/' + path.perName;
                            testResult.taskperformanceurl = perPath.substring(perPath.indexOf(splitStr) + splitStr.length)
                            if (err) {
                              testResult.error = err;
                            }
                            if (stdout) {
                              log.info('stdout:', stdout)
                              //生成执行成功的脚本数,失败的脚本数,富文本描述
                              testResult.total = 0;
                              testResult.fail = 0;
                              testResult.reportcontent = stdout;
                            }
                            if (stderr) {
                              stderr = stderr.replace('\'', '\\\'')
                              log.info('stderr:', stderr)
                              /*stderr: test_add_function (__main__.CaculatorTests) ... FAIL

                               ======================================================================
                               FAIL: test_add_function (__main__.CaculatorTests)
                               ----------------------------------------------------------------------
                               Traceback (most recent call last):
                               File "/home/mat/myfolder/project/STF/1stfTest/stf0105/lib/units/api/controllers/autoTest/python/scripts/hello_appium.py", line 27, in test_add_function
                               self.assertEqual('16001', self.driver.find_element_by_id("com.sec.android.app.popupcalculator:id/txtCalc").text)
                               AssertionError: '16001' != u'15,995+6\n=16,001. \u6b63\u5728\u7f16\u8f91\u3002'

                               ----------------------------------------------------------------------
                               Ran 1 test in 33.814s

                               FAILED (failures=1)
                               *!/
                               /!* test_add_function (__main__.CaculatorTests) ... ok
                               ----------------------------------------------------------------------
                               Ran 1 test in 33.953s
                               OK
                               _function (__main__.CaculatorTests*!/
                               /!*stderr: test_add_function (__main__.CaculatorTests) ... ERROR

                               ======================================================================
                               ERROR: test_add_function (__main__.CaculatorTests)
                               ----------------------------------------------------------------------
                               Traceback (most recent call last):
                               File "/home/mat/myfolder/project/STF/1stfTest/stf/script/hello_appium.py", line 15, in setUp
                               self.driver = webdriver.Remote('http://localhost:4723/wd/hub', desired_caps)
                               File "build/bdist.linux-x86_64/egg/appium/webdriver/webdriver.py", line 36, in __init__
                               super(WebDriver, self).__init__(command_executor, desired_capabilities, browser_profile, proxy, keep_alive)
                               File "/usr/local/lib/python2.7/dist-packages/selenium-3.0.2-py2.7.egg/selenium/webdriver/remote/webdriver.py", line 92, in __init__
                               self.start_session(desired_capabilities, browser_profile)
                               File "/usr/local/lib/python2.7/dist-packages/selenium-3.0.2-py2.7.egg/selenium/webdriver/remote/webdriver.py", line 179, in start_session
                               response = self.execute(Command.NEW_SESSION, capabilities)
                               File "/usr/local/lib/python2.7/dist-packages/selenium-3.0.2-py2.7.egg/selenium/webdriver/remote/webdriver.py", line 236, in execute
                               self.error_handler.check_response(response)
                               File "/usr/local/lib/python2.7/dist-packages/selenium-3.0.2-py2.7.egg/selenium/webdriver/remote/errorhandler.py", line 192, in check_response
                               raise exception_class(message, screen, stacktrace)
                               WebDriverException: Message: An unknown server-side error occurred while processing the command. Original error: Screen did not unlock successfully, retrying


                               ----------------------------------------------------------------------
                               Ran 1 test in 277.691s

                               FAILED (errors=1)
                               */
                              testResult.reportcontent = stderr;
                              var ran = stderr.substring(stderr.indexOf('Ran'));
                              var total = Number(ran.substring(3, ran.indexOf('test in')).replace(/\ +/g, ''));
                              testResult.total = isNaN(total) ? null : total;

                              var errIndex = ran.indexOf('errors');
                              if (errIndex != -1) {
                                var err = Number(ran.substring(errIndex + 'errors'.length + 1, ran.indexOf(')')).replace(/\ +/g, ''));
                                testResult.fail = isNaN(err) ? null : err;
                                testResult.error = new Error(stderr);
                              }

                              var failIndex = ran.indexOf('failures');
                              if (failIndex != -1) {
                                var fail = Number(ran.substring(failIndex + 'failures'.length + 1, ran.indexOf(')')).replace(/\ +/g, ''));
                                testResult.fail = isNaN(fail) ? null : fail;
                              }

                              var okIndex = ran.indexOf('OK')
                              if (okIndex != -1) {
                                testResult.fail = 0;
                              }
                            }

                            //设置截图路径:
                            fs.readdir(env.CAPTUREPATH, function (err, files) {
                              if (!files || files.length == 0) {
                                support.sendTestResult_script(testResult)
                                resolve();
                                return;
                              }
                              var path = env.CAPTUREPATH.substring(env.CAPTUREPATH.indexOf(splitStr) + splitStr.length)
                              var pathList = '';
                              for (var i = 0; i < files.length; i++) {
                                pathList += path + '/' + files[i] + ',';
                              }
                              testResult.images = pathList == '' ? '' : pathList.substring(0, pathList.length - 2);
                              resolve()
                              support.sendTestResult_script(testResult)
                            })
                          })
                        })
                        .catch(function (err) {
                          log.error('catch0:', err)
                          disconnect()
                        })
                    })
                      .catch(function (err) {
                        log.error('catch1:', err)
                      })
                  }

                  function appiumCheck(connectUrl) {
                    log.info('appiumCheck:', appiumState)
                    if (appiumState) {
                      startScript(connectUrl);
                    } else {
                      setTimeout(function () {
                        appiumCheck(connectUrl)
                      }, 3000)
                    }
                  }

                  function joinGroup() {
                    return new Promise(function (resolve, reject) {
                      log.info('enter emtc scriptRun joinGroup')
                      var channelEvent = new events.EventEmitter();
                      var messageListener = wirerouter()
                        .on(wire.JoinGroupMessage, function (channel, message) {
                          log.info('receive JoinGroupMessage')
                          if (message.serial === serial && message.owner.email === user.email) {
                            clearTimeout(responseTimer)
                            channelEvent.removeListener(wireutil.global, messageListener)
                            dev.owner = message.owner;
                            resolve()
                          }
                        })
                        .on(wire.TransactionDoneMessage, function (channel, message) {
                          log.info('receive TransactionDoneMessage')
                          if (!message.success) {
                            channelEvent.removeListener(wireutil.global, messageListener)
                            reject('Device is not responding')
                          }
                        })
                        .handler()


                      channelEvent.on(wireutil.global, messageListener)
                      sub.on('message', function (channel, data) {
                        channelEvent.emit(channel.toString(), channel, data)
                      })

                      // Timer will be called if no JoinGroupMessage is received till 5 seconds
                      var responseTimer = setTimeout(function () {
                        channelEvent.removeListener(wireutil.global, messageListener)
                        reject('Device is not responding')
                      }, 5000)

                      var usage = 'automation'
                      log.info('send GroupMessage')
                      push.send([
                        dev.channel
                        , wireutil.envelope(
                          new wire.GroupMessage(
                            new wire.OwnerMessage(
                              user.email
                              , user.name
                              , user.group//lgl
                            )
                            , options.groupTimeout || null
                            , wireutil.toDeviceRequirements({
                              serial: {
                                value: serial
                                , match: 'exact'
                              }
                            })
                            , usage
                          )
                        )
                      ])
                    })
                  }

                  function connectRemote() {
                    return new Promise(function (resolve, reject) {
                      var responseChannel = 'txn_' + uuid.v4()
                      sub.subscribe(responseChannel)

                      // Timer will be called if no JoinGroupMessage is received till 5 seconds
                      var timer = setTimeout(function () {
                        sub.unsubscribe(responseChannel)
                        throw new Error('remote connect,Device is not responding')
                      }, 5000)

                      sub.on('message', wirerouter()
                        .on(wire.ConnectStartedMessage, function (channel, message) {
                          log.info('emtcService receive ConnectStartedMessage')
                          if (message.serial === serial) {
                            clearTimeout(timer)
                            sub.unsubscribe(responseChannel)
                            resolve(message.url);
                          }
                        })
                        .handler())

                      push.send([
                        dev.channel
                        , wireutil.transaction(
                          responseChannel
                          , new wire.ConnectStartMessage()
                        )
                      ])
                    })
                  }

                  function disconnect() {
                    return new Promise(function (resolve, reject) {
                      log.info('enter emtc scriptRun disconnect')
                      var channelEvent = new events.EventEmitter();
                      var messageListener = wirerouter()
                        .on(wire.LeaveGroupMessage, function (channel, message) {
                          if (message.serial === serial && message.owner.email === user.email) {
                            clearTimeout(responseTimer)
                            channelEvent.removeListener(wireutil.global, messageListener)
                            resolve()
                          }
                        })
                        .handler()
                      channelEvent.on(wireutil.global, messageListener)
                      sub.on('message', function (channel, data) {
                        channelEvent.emit(channel.toString(), channel, data)
                      })
                      // Timer will be called if no JoinGroupMessage is received till 5 seconds
                      var responseTimer = setTimeout(function () {
                        channelEvent.removeListener(wireutil.global, messageListener)
                      }, 5000)


                      push.send([
                        dev.channel
                        , wireutil.envelope(
                          new wire.UngroupMessage(
                            wireutil.toDeviceRequirements({
                              serial: {
                                value: serial
                                , match: 'exact'
                              }
                            })
                          )
                        )
                      ])
                    })
                      .then(function () {
                        log.info('setToken null')
                        dbapi.setDeviceToken(serial, null)
                      })
                  }

                  function getLogName() {
                    var path = {
                      datePath: dateutil.dateToStr(new Date()),
                      logName: taskId + '_' + Date.now() + 'tasklogs.json',
                      perName: taskId + '_' + Date.now() + 'taskperformances.json'
                    }
                    return path;
                  }

                  function getEnvStr() {
                    var envStr = ''
                    if (env && typeof(env) == 'object') {
                      for (key in env) {
                        envStr += ('export ' + key + '=\"' + env[key] + '\";')
                      }
                    }
                    return envStr;
                  }

                  function startLog(path) {
                    push.send([
                      dev.channel
                      , wireutil.transaction(
                        logChannel
                        , new wire.LogcatStartMessage([], path.datePath, path.logName, path.perName)//filter,date,tasklog,taskperformance
                      )
                    ])
                  }

                  function stopLog() {
                    push.send([
                      dev.channel
                      , wireutil.transaction(
                        logChannel
                        , new wire.LogcatStopMessage()//filter,date,tasklog,taskperformance
                      )
                    ])
                  }

                  var logChannel = 'txs_' + uuid.v4();
                })
            })
          })
            .then(function () {
              if (argErrList.length > 0) {
                resObj.success = false;
                resObj.description = 'post data error:' + argErrList;
                return returnRes(resObj);
              }
              if (noExist.length > 0 || noAvailable.length > 0) {
                resObj.success = false;
                resObj.description = (noExist.length > 0 ? 'devices ' + noExist.join(',') + ' is not find.' : '') + (noAvailable.length > 0 ? 'devices ' + noAvailable.join(',') + ' is not available.' : '');
                return returnRes(resObj)
              }
              else {
                returnRes({
                  success: true
                  , description: 'The script will be called successfully!'
                })
              }
            })

          var mkCaptureDir = new Promise(function (resolve, reject) {
            function mkDir() {
              var item = capDirList.pop()
              if (item) {
                fileutil.mkdirs(item)
                  .then(function () {
                    mkDir()
                  })
              } else {
                resolve()
              }
            }
            mkDir()
          })
        }
      })
        .catch(function (err) {
          log.error('emtcService receive data error:', err)
          returnRes({
            succes: false,
            description: 'data error!'
          })
        })

      function returnRes(value) {
        var temp = JSON.stringify(value);
        res.end(temp)
        pushQueue('HTTP RESPONSE for '+ pathName + ':' + temp);
        var logPath = pathutil.root('log/'+ dateutil.dateToStr(new Date())) ;
        if (bufReceive.length > 0) {
          fileutil.endWrite(logPath+'/'+new Date().getHours().toString(),bufReceive.splice(0, bufReceive.length).join(''))
        }
      }

      function pushQueue(context) {
        bufReceive.push(dateutil.timeToStr(new Date(), ':') + ' ' + context + '\r\n');
      }
    })
  })

  //标识appium服务的运行状态,true表示启动且正常,false表示不正常或关闭,会在http /中接收到appium的启动消息后置为true,退出消息置为false
  var appiumState = false;
  function startAppium() {
    var dir=path.resolve(__dirname,'./appium.js');
    proChild.fork(dir)
  }
  startAppium();

  server.listen(options.port)
  log.info('Listening on port %d', options.port)
}