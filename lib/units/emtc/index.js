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

  var bufReceive=[]
  var childList={}
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
          case support.postPath.occupyDevice:
            occupyDevice(true);
            break;
          case support.postPath.releaseDevice:
            occupyDevice(false);
            break;
          case support.postPath.scriptRun:
            scriptRun()
            break;
          case support.postPath.stopScriptRun:
            stopScriptRun()
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

        function stopScriptRun(){
          log.info('enter emtc stopScriptRun')
          var token=data.token;
          var taskList = data.tasks;
          var resObj = {
            success: false,//true时所有任务都开始执行,
            faillist:[],
            description: ''//success为false时的描述:post data error!,no tasks!(任务列表长度为0),The script no suffix!(脚本无后缀),no python scripts(不是python脚本),token error!(token不合法),server error!,The script will be called successfully!
          }

          //参数必须是指定的格式
          if (!taskList || !token||taskList.constructor.name != 'Array'||typeof(token)!='string') {
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

          var user = jwtutil.decode(token, options.secret);
          if (!user) {
            resObj.success = false;
            resObj.faillist=taskList;
            resObj.description = 'token error!'
            return returnRes(resObj)
          }
          taskList.forEach(function(item){
            console.log('---enter map')
            var serial = item.serial;
            var taskId = item.taskId;
            /*if(!serial||taskId==null ||serial.constructor.name!='String'||taskId.constructor.name!='Number'){
              resObj.success = false;
              resObj.description = 'post data error!';
              return returnRes(resObj)
            }*/
            if(childList[serial]!=null&&childList[serial].task==taskId){
              childList[serial].childPro.kill('SIGHUP');
              delete childList[serial];
            }else {
              resObj.faillist.push(item);
            }
          })

          if(resObj.faillist.length==0){
            resObj.success=true;
          }else{
            resObj.success=false;
            resObj.description='some task data inconsistencies!'
          }
          returnRes(resObj)
        }

        function scriptRun() {
          log.info('enter emtc scriptRun')
          var taskList = data.tasks;
          var scriptName = data.spath;
          var env = data.env;
          var token=data.token;

          var resObj = {
            success: false,//true时所有任务都开始执行,
            noExist:[],//找不到的设备
            noAvailable:[],//不可用的设备,包括设备不在线或设备被其他人占用等
            description: ''//success为false时的描述:post data error!,no tasks!(任务列表长度为0),The script no suffix!(脚本无后缀),no python scripts(不是python脚本),token error!(token不合法),server error!,The script will be called successfully!
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
            resObj.description = 'The script no suffix!'
            return returnRes(resObj)
          }

          //必须是指定类型的脚本
          var type = scriptName.substring(suffix + 1);
          if (type != support.scriptType.python) {
            resObj.success = false;
            resObj.description = 'no python scripts';
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

          Promise.map(taskList, function (item) {
            return new Promise(function (resolve, reject) {
              if (typeof(item) != 'object') {
                argErrList.push(item);
                return resolve();
              }
              var serial = item.serial;
              var taskId = item.taskId;

              var loadDevice = dbapi.loadDevice(serial);

              var capPath = pathutil.logPath(dateutil.dateToStr(new Date()), serial, process.env.autoCapName)+'/'+dateutil.timeToStr()
              var devLog = pathutil.logPath(dateutil.dateToStr(new Date()), serial, process.env.devLogName)+'/'+dateutil.timeToStr()

              var mkCaptureDir=fileutil.mkdirs(capPath)

              Promise.all([loadUser, loadDevice,mkCaptureDir])
                .spread(function (dbUser, dev) {
                  user = dbUser;
                  if (!dev) {
                    noExist.push(serial)
                    return resolve();
                  }
                  if(!dbUser){
                    log.error('the user '+user.email+' is not exit')
                    return resolve();
                  }
                  user = dbUser;
                  datautil.normalize(dev, user);
                  var fields = 'serial,present,ready,using,owner,token';
                  var responseDevice = _.pick(dev, fields.split(','))
                  console.log('responseDevice:',responseDevice)
                  if (!responseDevice.present || !responseDevice.ready ||  responseDevice.token != user.email) {//||
                    noAvailable.push(serial)
                    log.warn(serial, ' is not available')
                    return resolve();
                  }
                  resolve();

                  joinGroup()
                    .then(function(){
                      //发送禁止响应屏幕的消息给device/service.js和touch.js
                      push.send([
                        dev.channel
                        , wireutil.envelope(new wire.ScreenResponseMessage(false))
                      ])
                      //准备appium参数

                      var aport=options.appiumPorts.shift();//appium端口
                      var bport=options.appiumPorts.shift();//bootstrap
                      var cport=options.appiumPorts.shift();//chromedriverPort
                      var sport = options.appiumPorts.shift();//selendroidPort
                      var appiumPath=pathutil.root('appium_log/'+dateutil.dateToStr()+dateutil.timeToStr()+'_'+serial);
                      var arg={
                        aport:aport,
                        bport:bport,
                        cport:cport,
                        sport:sport,
                        appiumPath:appiumPath,
                        scriptsPath:scriptsPath,
                        serial:dev.serial,
                        channel:dev.channel,
                        version:dev.version,
                        pushPort:options.endpoints.push,
                        task:taskId,
                        capPath:capPath,
                        devLog:devLog,
                        env:env
                      }
                      //启动appium,[aport,bport,cport,sport,appiumPath,scriptsPath,dev.serial,dev.channel,dev.version,options.endpoints.push,taskId,capPath,devLog]
                      var child=proChild.fork('./appium.js',[JSON.stringify(arg)],{
                        cwd:__dirname
                      })
                      childList[serial]={task:taskId,childPro:child}
                      //脚本运行结束,释放端口.
                      child.on('message',function(data){
                        push.send([dev.channel, wireutil.envelope(new wire.ScreenResponseMessage(true))])
                        dbapi.setDeviceUsage(dev.serial,null);
                        //释放端口
                        if(data&&data.constructor.name=='Array'){
                          data.forEach(function(item){
                            var port=parseInt(item);
                            if(port&&port.constructor.name=='Number'){
                              options.appiumPorts.push(item);
                            }
                          })
                        }
                        setTimeout(function(){
                          child.kill('SIGHUP');
                        },10000)
                      })
                    })

                  function joinGroup() {
                    return new Promise(function (resolve, reject) {
                      log.info('enter scriptRun joinGroup')
                      var responseChannel = 'txn_' + uuid.v4()
                      sub.subscribe(responseChannel);
                      log.info('sub subscribe '+responseChannel)
                      // Timer will be called if no JoinGroupMessage is received till 5 seconds
                      var responseTimer = setTimeout(function () {
                        sub.unsubscribe(responseChannel)
                        reject('Device is not responding')
                      }, 10000)

                      sub.on('message', wirerouter()
                        .on(wire.TransactionDoneMessage, function (channel, message) {
                          log.info('receive JoinGroup TransactionDoneMessage')
                          clearTimeout(responseTimer)
                          sub.unsubscribe(responseChannel)
                          if (!message.success) {
                            reject('join group failed:',message.body)
                          }else{
                            resolve()
                          }
                        })
                        .on(wire.JoinGroupMessage, function (channel, message) {
                          log.info('receive JoinGroupMessage')
                          if (message.serial === serial && message.owner.email === user.email) {
                            clearTimeout(responseTimer)
                            dev.owner = message.owner;
                            //resolve()
                          }
                        })
                        .handler())

                      var usage = 'automation'
                      log.info('send GroupMessage')
                      push.send([
                        dev.channel
                        , wireutil.transaction(
                          responseChannel,
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
                resObj.noExist=noExist;
                resObj.noAvailable=noAvailable;
                return returnRes(resObj)
              }
              else {
                returnRes({
                  success: true
                  , description: 'The script will be called successfully!'
                })
              }
            })
        }

        function getDevState() {
          log.info('enter emtc getDevState')
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
          log.info('enter emtc getDevices')
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
          log.info('enter %s::',flag?'occupyDevice':'releaseDevice');
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
              var fields = 'serial,present,ready,owner,token,usage';
              var responseDevice = _.pick(device, fields.split(','))
              console.log('-----------------responseDevice:',responseDevice)
              //占用设备
              if (flag) {
                var occupyFlag = responseDevice.present && responseDevice.ready && !responseDevice.token && !responseDevice.owner;//设备在线且已准备好,他token为null没人占用,owner为null没人使用
                if (!occupyFlag) {//不具备占用条件
                  returnObj.device = responseDevice;
                  return returnRes(returnObj)
                }
                console.log('---------------------occupy device token')
                updateToken(device.serial, user.email)
              }
              //释放设备
              else {
                if (!responseDevice.token) {//已经释放过了
                  returnObj.description = 'device ' + data.serial + ' double released!'//has releaseed before,no need release again
                  return returnRes(returnObj)
                }
                if (responseDevice.usage=='automation') {//
                  returnObj.description = 'device ' + data.serial + ' is running script!'
                  return returnRes(returnObj)
                }

                datautil.normalize(device, user)
                if (!device.using) {
                  console.log('---------------------release device token directly')
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
                    console.log('---------------------release device token,group.kick')
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
        pushQueue(pathName+' RESPONSE:' + temp);
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

  server.listen(options.port)
  log.info('Listening on port %d', options.port)
}