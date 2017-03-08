var http = require('http');
var url=require('url')
var proChild=require('child_process');
var events=require('events');

var Promise=require('bluebird')
var _=require('lodash');

var dbapi=require('../../db/api')
var logger = require('../../util/logger')
var pathutil=require('../../util/pathutil')
var dateutil=require('../../util/dateutil')
var jwtutil=require('../../util/jwtutil')
var support=require('./support');

module.exports = function(options) {
  var log = logger.createLogger('emtc');

var bufReceive=[]

  var server = http.createServer(function (req, res) {
    var pathName = url.parse(req.url).pathname;
    var body=''
    req.on('data', function (data) {
      body+=data;
    })
    req.on('end', function () {
      Promise.try(function () {
        var data = JSON.parse(body);
        console.log('data:',data)
        if (pathName != '/') {
          pushQueue(pathName+' '+body);
        }

        switch (pathName) {
          case '/'://appium服务启动
            if (data.method = 'collect') {
              //[Appium] Appium REST http interface listener started on
              if (data.params.message.indexOf('listener started on') != -1||data.params.message.indexOf('The requested port may already be in use')!=-1) {
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

        function scriptRun(){
          log.info('you have enter emtc scriptRun')
          
        }

        function getDevState(){
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
                if(device==null){
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

          function getState(dev){
            var data = {
              serial: dev.serial,
              ip:dev.ip,
              detail: dev,
              state: support.devState.absent
            }
            if (dev.present) {
              if (dev.status!=null && dev.status != 3) {
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
              if (dev.status&&dev.status != 3) {
                data.state = dev.status
              }
            }
            return data;
          }

          function getStateList(list){
            return _.map(list,function(dev){
              var tempDev=_.pick(dev,fields.split(','));
              return getState(tempDev);
            })
          }
        }

        function getDevices(){
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
              var token=null;
              //占用设备
              if (flag) {
                var occupyFlag = responseDevice.present && responseDevice.ready && !responseDevice.token && !responseDevice.owner;
                if (!occupyFlag) {//不具备占用条件
                  returnObj.device = responseDevice;
                  return returnRes(returnObj)
                }
                token = user.email;
              }
              //释放设备
              else{
                if (!responseDevice.token) {//已经释放过了
                  returnObj.description = 'device ' + data.serial + ' has releaseed before,no need release again!'
                  return returnRes(returnObj)
                }
                //token=null;
                //若设备正在被连接,owner不为空,需要更新owner
                dbapi.unsetDeviceOwner(data.serial)
                dbapi.unsetDeviceUsage(data.serial)
                //需要弄push吗?发送一个离线的消息给前端
              }

              dbapi.setDeviceToken(data.serial, token)
                .then(function () {
                  log.info((flag ? 'occupy' : 'release' ) + ' device successfully');
                  returnObj.succes = true;
                  return returnRes(returnObj)
                })
                .catch(function (err) {
                  //此处的目的是确认token的更新是否成功.
                  dbapi.loadDevice(data.serial)
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

            })
            .catch(function (err) {
              returnObj.description = 'Failed to load device ' + data.serial;
              log.error('occupyDevice error: ', data.serial,err)
              return returnRes(returnObj);
            })
        }

        function pushQueue(context) {
          bufReceive.push(dateutil.timeToStr(new Date(),':') + ' ' + context + '\r\n');
        }

        function returnRes(value) {
          var temp = JSON.stringify(value);
          res.end(temp)
          pushQueue('HTTP RESPONSE for ',pathName+':' + temp);
        }
      })
        .catch(function (err) {
          log.error('emtcService receive data error:', err)
          returnRes({
            succes: false,
            description: 'post data error!'
          })
        })
    })
  })

  //标识appium服务的运行状态,true表示启动且正常,false表示不正常或关闭,会在http /中接收到appium的启动消息后置为true,退出消息置为false
  var appiumState = false;
  function startAppium() {
    proChild.fork(pathutil.root('lib/units/emtc/appium.js'),{silent:true})
  }
  startAppium();

  server.listen(options.port)
  log.info('Listening on port %d', options.port)
}