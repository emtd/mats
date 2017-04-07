var syrup = require('stf-syrup')
var path=require('path')
var fs=require('fs')
var http=require('http')
var url=require('url')

var Promise=require('bluebird')
var appium=require('appium')
var proChild=require('child_process');

var wire = require('../../../wire')
var pathutil=require('../../../util/pathutil')
var dateutil=require('../../../util/dateutil')
var fileutil=require('../../../util/fileutil')
var logger = require('../../../util/logger')
module.exports = syrup.serial()
  .dependency(require('../support/router'))
  .dependency(require('./util/identity'))
  .dependency(require('./util/msgsocket'))
  .define(function(options, router,identity,msgSocket) {
    //log.info('%s-%s-%s',options.msgPort,options.msgWsUrlPattern,options.appiumHttpPort)
    var log = logger.createLogger('device:plugins:script')
    log.info(options.appiumPorts)
    var appiumState = false
    router.on(wire.ScriptDebugMessage, function (channel, message) {
      log.info('receive ScriptDebugMessage:%s,%s', message, options.serial)
      var envPath = pathutil.root(process.env.debugPath + '/' + message.user + '/' + options.serial) + '/env';

      var capPath = path.resolve(envPath, '../capture');
      var logPath = path.resolve(envPath, '../log');

      function logDeal() {
        return new Promise(function (resolve, reject) {
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
      }

      function capDeal() {
        return new Promise(function (resolve, reject) {
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
      }

      logDeal()
        .then(function () {
          log.info('path generate:', logPath)
          return capDeal()
        })
        .then(function () {
          var envPromise = new Promise(function (resolve, reject) {
            fs.readFile(envPath, 'utf8', function (err, data) {
              if (err) {
                reject(err);
              } else {
                if (data == '') {
                  reject('env null')
                } else {
                  resolve(data)
                }
              }
            })
          })
          var appPromise = new Promise(function (resolve, reject) {
            if (appiumState) {
              return resolve(true)
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
                  resolve(true);
                })
                .catch(function (err) {
                  resolve(false)
                })
            }
          })
          return Promise.all([envPromise, appPromise])
        })
        .then(function (envstr, app) {
          appiumState = app;
          if (!appiumState) {
            return Promise.reject('appium start error!')
          }
          var strList = envstr.split('|#|');
          if (strList.length != 2) {

            return
          }

          var scriptPath
          log.info('appium start successfully')
          var sType = scriptPath.substring(scriptPath.lastIndexOf('.') + 1);//脚本类型
          switch (sType) {
            case 'rb':
              /*runRuby()
               .then(function () {//运行结束,断开链接
               log.info('ruby script execute over successfully');
               //resolve()
               })*/
              break;
            case 'py':
              runPython()
              break;
            case 'js':
              break;
            case 'php':
              break;
            default:
              break;
          }

          function runPython() {
            log.info('debug runPython')
            var devLogPath = pathutil.logPath(dateutil.dateToStr(), options.serial, process.env.devLogName) + dateutil.timeToStr()
            var env = {
              UDID: options.serial,
              VERSION: identity.version,
              APPIUMPORT: options.appiumPorts.aport,
              CAPTUREPATH: capPath,
              //DEVLOGPATH:devLogPath
            }


            //var path = getLogName();
            //startLog(path)

            var envStr = getEnvStr(env);
            log.info('runPython command');
            Promise.try(function () {
              var child = proChild.exec(envStr + 'python ' + scriptPath, function (err, stdout, stderr) {
                //stopLog();
                if (err) {
                  log.info('error:', err)
                }
                if (stdout) {
                  log.info('stdout:', stdout)

                }
                if (stderr) {
                  log.info('stderr:', stderr)
                }
                log.info('python script execute over successfully');

              })
            })
              .catch(function (err) {
                log.error('script exacute over,proChild.exec error:', err)
                //scriptOver();
              })
          }

          function getEnvStr(env) {
            var envStr = ''
            if (env && typeof(env) == 'object') {
              for (key in env) {
                envStr += ('export ' + key + '=\"' + env[key] + '\";')
              }
            }
            return envStr;
          }
        })
        .catch(function (err) {
          log.error(err)
        })
    })

    msgSocket.event.on('debug', function (data, flag) {
      log.info('receive debug message:%s,%s', data, options.serial)
      var user = data;
      var envPath = pathutil.root(process.env.debugPath + '/' + user + '/' + options.serial) + '/env';
      var capPath = path.resolve(envPath, '../capture');
      var logPath = path.resolve(envPath, '../log');

      function logDeal() {
        return new Promise(function (resolve, reject) {
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
      }

      function capDeal() {
        return new Promise(function (resolve, reject) {
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
      }

      logDeal()
        .then(function () {
          log.info('path generate:', logPath)
          return capDeal()
        })
        .then(function () {
          var envPromise = new Promise(function (resolve, reject) {
            fs.readFile(envPath, 'utf8', function (err, data) {
              if (err) {
                reject(err);
              } else {
                if (data == '') {
                  reject('env null')
                } else {
                  resolve(data)
                }
              }
            })
          })
          var appPromise = new Promise(function (resolve, reject) {
            if (appiumState) {
              console.log('-------------1')
              return resolve(true)
            } else {
              console.log('-------------2')
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
                  console.log('-------------3')
                   resolve(true);
                })
                .catch(function (err) {
                  console.log('-------------4')
                  log.error(err)
                   resolve(false)
                })
            }
          })
          return Promise.all([envPromise, appPromise])
        })
        .spread(function (envstr, appFlag) {
          console.log(appFlag)
          appiumState = appFlag;
          if (!appiumState) {
            return Promise.reject('appium start error!')
          }
          var strList = envstr.split('|#|');
          if (strList.length != 2 || strList[1] == '') {
            if (msgSocket.send) {
              var value = {
                success: false
                , type: 'debug'
                , data: 'could not find script!'
              }
              msgSocket.send(JSON.stringify(value))
            }
            return;
          }
          var scriptPath = strList[1]
          var sType = scriptPath.substring(scriptPath.lastIndexOf('.') + 1);//脚本类型
          /*switch (sType) {
            case 'rb':
              /!*runRuby()
               .then(function () {//运行结束,断开链接
               log.info('ruby script execute over successfully');
               //resolve()
               })*!/
              break;
            case 'py':
              runPython()
              break;
            case 'js':
              break;
            case 'php':
              break;
            default:
              break;
          }*/
          if (sType != 'py') {
            if (msgSocket.send) {
              var value = {
                success: false
                , type: 'debug'
                , data: 'script must be python!'
              }
              msgSocket.send(JSON.stringify(value))
            }
            return;
          }
          runPython();

          function runPython() {
            log.info('debug runPython')
            var devLogPath = pathutil.logPath(dateutil.dateToStr(), options.serial, process.env.devLogName) + dateutil.timeToStr()
            var env = {
              UDID: options.serial,
              VERSION: identity.version,
              APPIUMPORT: options.appiumPorts.aport,
              CAPTUREPATH: capPath,
              DEVLOGPATH: devLogPath
            }
            if (strList[0] != '') {
              var data = JSON.parse(strList[0]);
              Object.keys(data).map(function (index) {
                env.index = data[index];
              })
            }

            var envStr = getEnvStr(env);
            log.info('runPython command');
            Promise.try(function () {
              var child = proChild.exec(envStr + 'python ' + scriptPath, function (err, stdout, stderr) {
                //stopLog();
                if (err) {
                  log.info('error:', err)
                }
                if (stdout) {
                  log.info('stdout:', stdout)

                }
                if (stderr) {
                  log.info('stderr:', stderr)
                }
                log.info('python script execute over successfully');

              })
            })
              .catch(function (err) {
                log.error('script exacute over,proChild.exec error:', err)

              })
          }
          function getEnvStr(env) {
            var envStr = ''
            if (env && typeof(env) == 'object') {
              for (key in env) {
                envStr += ('export ' + key + '=\"' + env[key] + '\";')
              }
            }
            return envStr;
          }
        })
    })


    var server = http.createServer(function (req, res) {
      var pathName = url.parse(req.url).pathname;
      var body = ''
      req.on('data', function (data) {
        body += data;
      })
      req.on('end', function () {
        var bodyObj = JSON.parse(body)
        if (msgSocket.send) {
          var data = {
            type: 'debug',
            data: bodyObj.params.message
          }
          msgSocket.send(JSON.stringify(data))
            .catch(function (err) {
              log.error(err)
            })
        }

      })
    })
    server.listen(options.appiumHttpPort)
    log.info('Listening on port %d', options.appiumHttpPort)
  })


