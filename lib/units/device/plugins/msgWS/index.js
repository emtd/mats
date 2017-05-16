var syrup = require('stf-syrup')
var http=require('http')
var socketio = require('socket.io')
var Promise=require('bluebird')


var cookieSession = require('./middleware/cookie-session')
var ip = require('./middleware/remote-ip')
var auth = require('./middleware/auth')
var logger = require('../../../../util/logger')
var lifecycle = require('../../../../util/lifecycle')

var adbkit=require('adbkit')
var promiseutil=require('../../../../util/promiseutil')

var pathutil=require('../../../../util/pathutil')
var fileutil=require('../../../../util/fileutil')
var fs=require('fs')
var path=require('path')
var appium=require('appium')
var proChild=require('child_process')
module.exports = syrup.serial()
  .dependency(require('./debug'))
  .dependency(require('../util/identity'))
  .dependency(require('../util/debugScreenControl'))
  .define(function(options,debug,identity,dsc) {
    var log = logger.createLogger('device:plugins:msgWebSocket')
    log.info('%s-%s-%s',options.msgPort,options.msgWsUrlPattern,options.appiumHttpPort)

    var server = http.createServer()
    var io = socketio.listen(server, {
      serveClient: false
      , transports: ['websocket']
    })
    var appiumState=false;
    var soc=null;

    io.use(cookieSession({
      name: options.ssid
      , keys: [options.secret]
    }))
    io.use(ip({
      trust: function() {
        return true
      }
    }))
    io.use(auth)

    io.on('connection', function(socket) {
      soc=socket;
      var child=null;
      var req = socket.request
      var user = req.user

      user.ip = socket.handshake.query.uip || req.ip
      socket.emit('socket.ip', user.ip)

      new Promise(function (resolve) {
        socket.on('disconnect', resolve)
          .on('debug.start', function (data) {
            debugStart(data)
          })
          .on('debug.appui', function (data) {
            getAppUI()
          })
          .on('debug.stop', function (data) {
            log.info('debug.stop:', data);
            if(child){
              child.kill('SIGHUP');
              socket.emit('debug.stop.return',{success:true,desc:''})
            }else{
              socket.emit('debug.stop.return',{success:true,desc:'已经停止'})
            }
            //debug.tryStopDebug()
          })

        function getAppUI() {
          log.info('enter getAppUI');
          var data = {img: '', xml: ''}

          var adb = adbkit.createClient({
            host: '127.0.0.1'
            , port: 5037
          })

          function ensureBootComplete() {
            return promiseutil.periodicNotify(
              adb.waitBootComplete(options.serial)
              , 1000
            )
              .progressed(function () {
                log.info('Waiting for boot to complete')
              })
              .timeout(60000)
          }

          ensureBootComplete()
            .then(function () {
              //发送禁止屏幕响应的事件
              dsc.event.emit(dsc.option.screenFlag, false);
              //截图
              var img = new Promise(function (resolve, reject) {
                adb.screencap(options.serial)
                  .then(adbkit.util.readAll)
                  .then(function (screencap) {
                    resolve(screencap);
                  })
                  .catch(function (err) {
                    log.error('img error:', err)
                    reject('img error:' + err.toString())
                  })
              })
              var xml = new Promise(function (resolve, reject) {
                var file = '/data/local/tmp/tmp.xml'
                adb.shell(options.serial, 'uiautomator dump ' + file)
                  .then(adbkit.util.readAll)
                  .then(function () {
                    return adb.stat(options.serial, file)
                  })
                  .then(function (stats) {
                    if (stats.size === 0) {
                      throw new Error('Empty screenshot; possibly secure screen?')
                    }
                    return adb.pull(options.serial, file)
                      .then(adbkit.util.readAll)
                      .then(function (transfer) {
                        resolve(transfer)
                      })
                  })
                  .catch(function (err) {
                    log.error('xml error:', err)
                    reject('xml error:' + err.toString())
                  })
              })
              Promise.all([img, xml])
                .spread(function (idata, xdata) {
                  /*console.log('---');
                   console.log(idata);
                   fs.writeFile('/home/mat/test00.png',idata,function(data){
                   console.log('---',data)
                   })*/
                  var imgdata = idata.toString('base64');
                  /*console.log('---==--');
                   console.log(new Buffer(imgdata,'base64'));
                   fs.writeFile('/home/mat/testestiii0.png',new Buffer(imgdata,'base64'),function(data){
                   console.log('+++++',data)
                   })*/
                  var data = {img: imgdata, xml: xdata.toString()}
                  socket.emit('debug.appui', data)
                })
                .catch(function (err) {
                  log.error('appui error:', err)
                  socket.emit('debug.appui', null)
                })
            })
        }

        function debugStart(data) {
          log.info('enter debugStart')
          var scriptName = data.script.name;
          var suffixIndex = scriptName.lastIndexOf('.');
          if (suffixIndex < 0) {
            return socket.emit('debug.start.return', {success: false, desc: '脚本必须有后缀!'})
          }
          if (scriptName.substring(suffixIndex + 1) != 'py') {
            return socket.emit('debug.start.return', {success: false, desc: '只支持python脚本!'})
          }
          console.log(data.img.constructor.name)
          var imgList = data.img;
          console.log(imgList.constructor.name)
          if (imgList.constructor.name != 'Array') {
            return socket.emit('debug.start.return', {success: false, desc: '参数错误!图片不是数组类型'})
          }

          //发送禁止屏幕响应的事件
          dsc.event.emit(dsc.option.screenFlag, false);
          //接收文件并写文件,启动appium执行脚本
          var userId = user.email;
          var serial = options.serial;

          var resPath = pathutil.root(process.env.debugPath + '/' + userId + '/' + serial + '/res')
          var capPath = path.resolve(resPath, '../capture');
          var devLogPath = path.resolve(resPath, '../' + process.env.devLogName);
          var logPath = path.resolve(resPath, '../log');
          var scriptPath = path.resolve(resPath, '../' + scriptName)

          var makeRes = new Promise(function (resolve, reject) {
            if (fs.existsSync(resPath)) {
              fileutil.rmFilesByPath(resPath)
                .then(function () {
                  resolve()
                })
                .catch(function (err) {
                  reject(err)
                })
            } else {
              fileutil.mkdirs(resPath)
                .then(function () {
                  resolve()
                })
                .catch(function (err) {
                  reject(err)
                })
            }
          })
          makeRes
            .then(function () {
              var makeIMG = new Promise(function (resolve, reject) {
                var proList=[]
                imgList.forEach(function (item) {
                  var dataBuffer = new Buffer(item.data.replace(/^data:image\/\w+;base64,/,""), 'base64');
                  var mkPro=new Promise(function(resolve,reject){
                    fs.writeFile(resPath + '/' + item.name, dataBuffer, function (err) {
                      if (err) {
                        reject(err);
                      } else {
                        resolve();
                      }
                    })
                  })
                  proList.push(mkPro)
                })
                Promise.all(proList)
                  .then(function(){
                    resolve()
                  })
                  .catch(function(err){
                    reject(err)
                  })
              })
              var makeScript = new Promise(function (resolve, reject) {
                fs.writeFile(scriptPath, data.script.data, function (err) {
                  if (err) {
                    reject(err);
                  } else {
                    resolve();
                  }
                })
              })
              var makeCap = new Promise(function (resolve, reject) {
                if (fs.existsSync(capPath)) {
                  //删除截图目录下的所有文件
                  fileutil.rmFilesByPath(capPath)
                    .then(function () {
                      resolve()
                    })
                    .catch(function (er) {
                      reject(err)
                    })
                }
                else {
                  //创建截图目录
                  fileutil.mkdirs(capPath)
                    .then(function () {
                      resolve()
                    })
                    .catch(function (err) {
                      reject(err)
                    })
                }

              })
              var makeLog = new Promise(function (resolve, reject) {
                if (fs.existsSync(logPath)) {
                  //删除日志文件
                  fs.unlink(logPath, function (err) {
                    if (err) {
                      reject(err);
                    } else {
                      resolve()
                    }
                  })
                } else {
                  resolve()
                }
              })
              var makedevLog = new Promise(function (resolve, reject) {
                if (fs.existsSync(devLogPath)) {
                  //删除截图目录下的所有文件
                  fileutil.rmFilesByPath(devLogPath)
                    .then(function () {
                      resolve()
                    })
                    .catch(function (er) {
                      reject(err)
                    })
                }
                else {
                  //创建截图目录
                  fileutil.mkdirs(devLogPath)
                    .then(function () {
                      resolve()
                    })
                    .catch(function (err) {
                      reject(err)
                    })
                }
              })

              Promise.all([makeIMG, makeScript, makeCap, makeLog, makedevLog])
                .spread(function () {
                  return new Promise(function (resolve, reject) {
                    if (appiumState) {
                      resolve(true)
                    } else {
                      appium.main({
                        port: options.appiumPorts.aport,
                        bootstrap: options.appiumPorts.bport,
                        chromedriverPort: options.appiumPorts.cport,
                        selendroidPort: options.appiumPorts.sport,
                        udid: options.serial,
                        log: logPath,
                        sessionOverride: true,
                        webhook: 'localhost:' + options.appiumHttpPort
                      })
                        .then(function () {
                          appiumState = true;
                          resolve(true);
                        })
                        .catch(function (err) {
                          log.error(err)
                          resolve(false)
                        })
                    }
                  })
                })
                .then(function (flag) {
                  socket.emit('debug.start.return', {success: true, desc: '脚本生成成功,启动调试...'})
                  appiumState = flag;
                  if (!appiumState) {
                    return Promise.reject('appium start error!')
                  }
                  runPython();
                })
                .catch(function (err) {
                  log.error(err);
                  socket.emit('debug.start.return', {success: false, desc: '错误:' + err.toString()})
                })

              function runPython() {
                log.info('debug runPython')
                var env = {
                  UDID: options.serial,
                  VERSION: identity.version,
                  APPIUMPORT: options.appiumPorts.aport,
                  CAPTUREPATH: capPath,
                  DEVLOGPATH: devLogPath
                }
                if (data.env) {
                  Object.keys(data.env).forEach(function (index) {
                    env[index] = data.env[index]
                  })
                }
                var envStr = getEnvStr(env);
                log.info('runPython command');
                Promise.try(function () {
                  child = proChild.exec(envStr + 'python ' + scriptPath, function (err, stdout, stderr) {
                    //stopLog();
                    if (err) {
                      log.info('error:', err)
                      socket.emit('debug.log', 'error:' + err.toString())
                    }
                    if (stdout) {
                      log.info('stdout:', stdout)
                      socket.emit('debug.log', stdout)
                    }
                    if (stderr) {
                      log.info('stderr:', stderr)
                      socket.emit('debug.log', stderr)
                    }
                    log.info('python script execute over successfully');
                    socket.emit('debug.log', '脚本执行完毕!')
                    dsc.event.emit(dsc.option.screenFlag, true);
                  })
                })
                  .catch(function (err) {
                    log.error('script exacute over,proChild.exec error:', err)
                    socket.emit('debug.start.return', {success: false, desc: '错误:' + err.toString()})
                    dsc.event.emit(dsc.option.screenFlag, true);
                  })

                function getEnvStr(env) {
                  var envStr = ''
                  if (env && typeof(env) == 'object') {
                    for (key in env) {
                      envStr += ('export ' + key + '=\"' + env[key] + '\";')
                    }
                  }
                  return envStr;
                }
              }
            })
        }
      })


    })
    server.listen(options.msgPort)
    log.info('device msgwebsocket Listening on port %d', options.msgPort)

    //用于appium日志转发
    var appiumServer = http.createServer(function (req, res) {
      //var pathName = url.parse(req.url).pathname;
      var body = ''
      req.on('data', function (data) {
        body += data;
      })
      req.on('end', function () {
        var bodyObj = JSON.parse(body)
        if(soc){
          soc.emit('debug.log',bodyObj.params.message)
        }
      })
    })
    appiumServer.listen(options.appiumHttpPort)
    log.info('appiumServer Listening on port %d', options.appiumHttpPort)


    lifecycle.observe(function() {
     /* [push, sub].forEach(function(sock) {
        try {
          sock.close()
        }
        catch (err) {
          // No-op
        }
      })*/
    })
  })
