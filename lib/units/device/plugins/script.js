/**
 * Created by mat on 17-7-2.
 */
var http=require('http')
var fs=require('fs')
var proChild=require('child_process')
var path=require('path')

var syrup = require('stf-syrup')
var appium=require('appium');
var adbkit=require('adbkit');
var images=require('images');
var socketio = require('socket.io')
var Promise=require('bluebird')

var pathutil=require('../../../util/pathutil')
var dateutil=require('../../../util/dateutil')
var fileutil=require('../../../util/fileutil')
var promiseutil=require('../../../util/promiseutil')
var logger = require('../../../util/logger')
var wireutil = require('../../../wire/util')
var wire = require('../../../wire')
module.exports = syrup.serial()
  .dependency(require('../support/push'))
  .dependency(require('../support/router'))
  .dependency(require('./util/identity'))
  .dependency(require('./util/debugScreenControl'))
  .dependency(require('./logcat'))
  .define(function(options,push,router,identity,dsc,logcat) {
    var log = logger.createLogger('device:plugins:script')
    var appiumState=false;//标示appium是否正常启动
    var soc = null;
    //收到自动化请求或脚本调试请求的时候启动appium，
    //1.启动appium，
    //2.监听自动化请求
    //3.提供脚本调试接口

    router
      .on(wire.ScriptStartMessage, function(channel, message) {
        console.log('-------------------------ScriptStartMessage:',message)
        dsc.event.emit(dsc.option.screenFlag, false);//发送禁止屏幕响应事件
        var scriptsPath = pathutil.root('script/' + message.scriptPath);

        //截图路径
        var capPath = pathutil.logPath(dateutil.dateToStr(new Date()), options.serial, process.env.autoCapName)+'/'+dateutil.timeToStr()
        //日志拉取路径
        var devLog = pathutil.logPath(dateutil.dateToStr(new Date()), options.serial, process.env.devLogName)+'/'+dateutil.timeToStr()

        //日志记录
        var path = {
          datePath: dateutil.dateToStr(new Date()),
          logName: message.taskId + '_' + Date.now()+ '_' + 'tasklogs.json',
          perName: message.taskId + '_' + Date.now()+ '_' + 'taskperformances.json'
        }
        var logPath = pathutil.logPath(path.datePath, options.serial, process.env.logName);
        var perPath = pathutil.logPath(path.datePath, options.serial, process.env.perName);

        logcat.logdir=logPath+'/'+path.logName;
        logcat.perdir=perPath+'/'+path.perName;
        logcat.start([],message.packageName)

        getAppium()
          .then(function() {
            runPython(false, JSON.parse(message.env), capPath, devLog, scriptsPath,message.taskId)
          })
      })
      .on(wire.ScriptCheckMessage, function(channel, message) {
        console.log('device receive ScriptCheckMessage')
        var scriptsPath = pathutil.root('script/' + message.scriptName);
        console.log(fs.existsSync(scriptsPath))
        push.send([
          wireutil.global,
          wireutil.envelope(new wire.ScriptExistMessage(options.serial,message.scriptName,fs.existsSync(scriptsPath)))
        ])
      })

    //msg socket server
    var server = http.createServer()
    var io = socketio.listen(server, {
      serveClient: false
      , transports: ['websocket']
    })
    io.on('connection', function (socket){
      var child = null;
      soc = socket;
      socket.on('disconnect', function(){
        log.info('msg socket disconnect')
      })
        .on('debug.start', function (data) {
          debugStart(data)
        })
        .on('debug.appui', function (data) {
          getAppUI()
        })
        .on('debug.stop', function (data) {
          if (child) {
            child.kill('SIGHUP');
            socket.emit('debug.stop.return', {success: true, desc: ''})
          } else {
            socket.emit('debug.stop.return', {success: true, desc: '已经停止'})
          }
        })
        .on('image.match', function (data) {
          /*data={
           name:'xx.png',
           data:'xxxx',
           region:0,0,0,0/null
           }*/
          if (screen.dir == '') {
            log.warn('请先截图')
            return;
          }
          //图片生成到本地，
          var resPath = screen.dir + '/' + data.name;
          console.log(resPath)
          var dataBuffer = new Buffer(data.data.replace(/^data:image\/\w+;base64,/, ""), 'base64');
          fs.writeFile(resPath, dataBuffer, function (err) {
          })
          //使用screenPath指定的图片和目标图片对比，返回对比结果
          var pyPath = pathutil.root('python_lib/verify.py')
          var regionstr = ''
          /*if(data.region!=''){
           screen.region=data.region.split(',');
           for(i in screen.region){
           if(i%2==0){
           screen.region[i]=screen.region[i]*screen.width;
           }else{
           screen.region[i]=screen.region[i]*screen.height;
           }
           }
           regionstr=screen.region.join(',')
           }else{
           screen.region=data.region;
           }*/
          screen.region = data.region;
          var cmd = 'python ' + pyPath + ' ' + resPath + ' ' + screen.dir + '/screen.png ' + regionstr
          console.log(cmd)
          var child = proChild.exec(cmd, function (err, stdout, stderr) {
            console.log('stdout:', stdout);
            /*'stdout: using brisk\
             img1 - 231 features, img2 - 659 features\
             matching...\
             68 / 79  inliers/matched'
             */
            /*3 matches found, not enough for homography estimation*/
            var value = {
              img: data.name,
              result: ''
            }
            var i = stdout.indexOf('matching...')
            if (i != -1) {
              var sub = stdout.substring(i + 12)
              var j = sub.indexOf('inliers/matched');
              if (j != -1) {
                value.result = sub.substring(0, j).replace(/\s/ig, '');
              } else {
                value.result = '<4';
              }
            } else {
              value.result = stdout;
            }
            socket.emit('image.match.return', value)
          })
        })
        //.on('image.match.return',function)
        //截图完毕，清除截图缓存
        .on('screenshot.end', function () {
          console.log('screenshot.end:', screen.dir)
          //删除screenPath指定的文件
          if (screen.dir != '') {
            fileutil.rmFilesByPath(screen.dir)
              .then(function () {
                fs.rmdir(screen.dir, function (err) {
                  console.log(err)
                });
              })
          }
        })

      //禁止屏幕响应，并从设备中拉取图片和xml
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
                  //将截图生成到本地，用于图像比对
                  screen.width = '', screen.height = ''
                  screen.dir = pathutil.root('script_debug') + '/' + Date.now().toString()
                  fileutil.mkdirs(screen.dir)
                    .then(function () {
                      fs.writeFile(screen.dir + '/screen.png', screencap, function (err) {
                        if (err) {
                          console.log(err)
                        }
                      });
                    })
                  var img = images(screencap)
                  screen.width = img.width()
                  screen.height = img.height()
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
        /*data={
         user:'703'
         script:{name:'',data:''},
         img:[{name:'',data:''}]
         }*/
        log.info('enter debugStart')
        var scriptName = data.script.name;
        var suffixIndex = scriptName.lastIndexOf('.');
        if (suffixIndex < 0) {
          return socket.emit('debug.start.return', {success: false, desc: '脚本必须有后缀!'})
        }
        if (scriptName.substring(suffixIndex + 1) != 'py') {
          return socket.emit('debug.start.return', {success: false, desc: '只支持python脚本!'})
        }
        var imgList = data.img;
        if (imgList.constructor.name != 'Array') {
          return socket.emit('debug.start.return', {success: false, desc: '参数错误!图片不是数组类型'})
        }

        //发送禁止屏幕响应的事件
        dsc.event.emit(dsc.option.screenFlag, false);
        //接收文件并写文件,启动appium执行脚本
        var serial = options.serial;

        var resPath = pathutil.root(process.env.debugPath + '/' + data.user + '/' + serial + '/res')
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
              var proList = []
              imgList.forEach(function (item) {
                var dataBuffer = new Buffer(item.data.replace(/^data:image\/\w+;base64,/, ""), 'base64');
                var mkPro = new Promise(function (resolve, reject) {
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
                .then(function () {
                  resolve()
                })
                .catch(function (err) {
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
                //清空日志内容
                fs.writeFile(logPath, '', function (err) {
                  if (err) {
                    reject(err)
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
                getAppium();
              })
              .then(function (flag) {
                socket.emit('debug.start.return', {success: true, desc: '脚本生成成功,启动调试...'})
                appiumState = flag;
                if (!appiumState) {
                  return Promise.reject('appium start error!')
                }
                runPython(true,data.env,capPath,devLogPath,scriptPath);
              })
              .catch(function (err) {
                log.error(err);
                socket.emit('debug.start.return', {success: false, desc: '错误:' + err.toString()})
              })


          })
      }
    })
    server.listen(options.msgPort)
    log.info('device msgwebsocket Listening on port %d', options.msgPort)



    function getAppium(){
      return new Promise(function(resolve,reject){
        var logPath='../../../../appium_log/'+Date.now()
        if(appiumState){
          resolve(true)
        }else{
          appium.main({
            port: options.appiumPorts.aport,
            bootstrap: options.appiumPorts.bport,
            chromedriverPort: options.appiumPorts.cport,
            selendroidPort: options.appiumPorts.sport,
            udid: options.serial,
            log: pathutil.root('appium_log/'+options.serial+'_'+dateutil.datetimeToStr()),
            sessionOverride: true,
            webhook: 'localhost:' + options.appiumHttpPort
          })
            .then(function(){
              appiumState = true;
              resolve(true);
            })
        }
      })
    }

    //参数taskId用于自动化执行时结果返回
    function runPython(isDebug,envData,capPath,devLogPath,scriptPath,taskId) {
      console.log('-------------------scriptPath:',scriptPath)
      //如果时自动化脚本执行，开始前禁止屏幕响应，执行完后开启屏幕响应
      log.info('debug runPython')
      var env = {
        UDID: options.serial,
        VERSION: identity.version,
        APPIUMPORT: options.appiumPorts.aport,
        CAPTUREPATH: capPath,
        DEVLOGPATH: devLogPath,
        SCRIPTRESPATH: path.resolve(scriptPath, '../res/')
      }
      if (envData) {
        Object.keys(envData).forEach(function (index) {
          env[index] = envData[index]
        })
      }
      var envStr = getEnvStr(env);
      log.info('runPython command');
      Promise.try(function () {
        child = proChild.exec(envStr + 'python ' + scriptPath, function (err, stdout, stderr) {
          //stopLog();
console.log(err)
          console.log(stdout)
          console.log(stderr)
          log.info('python script execute over successfully');
          if(isDebug){//脚本调试
            soc.emit('debug.log', '脚本执行完毕!')
            dsc.event.emit(dsc.option.screenFlag, true);
            if (err) {
              log.info('error:', err)
              soc.emit('debug.log', 'error:' + err.toString())
            }
            if (stdout) {
              log.info('stdout:', stdout)
              soc.emit('debug.log', stdout)
            }
            if (stderr) {
              log.info('stderr:', stderr)
              soc.emit('debug.log', stderr)
            }
          }
          else{//自动化执行脚本
            //停止日志
            logcat.stop()
            var testResult = {
              error: '',//错误对象
              total: 0,//脚本总数
              fail: 0,//执行失败的脚本数
              tasklogurl: '',//日志文件
              taskperformanceurl: '',//性能文件
              images: '',//截图路径
              serial: options.serial,//设备序列号
              task_id: taskId,//任务ID
              device_log: devLogPath,
              reportcontent: ''//,结果描述,富文本
            }
            var dataStr = 'data/'
            testResult.tasklogurl = logcat.logdir.substring(logcat.logdir.indexOf(dataStr) + dataStr.length)
            testResult.taskperformanceurl = logcat.perdir.substring(logcat.perdir.indexOf(dataStr) + dataStr.length)

            if (err) {
              testResult.error = err.toString();
            }
            if (stdout) {
              log.info('stdout:', stdout)
              //生成执行成功的脚本数,失败的脚本数,富文本描述
              testResult.total = 0;
              testResult.fail = 0;
              testResult.reportcontent = stdout + '\r\n';
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
               */
              /* test_add_function (__main__.CaculatorTests) ... ok
               ----------------------------------------------------------------------
               Ran 1 test in 33.953s
               OK
               _function (__main__.CaculatorTests*/
              /*stderr: test_add_function (__main__.CaculatorTests) ... ERROR

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
              testResult.total = isNaN(total) ? -1 : total;

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
            fs.readdir(capPath, function (err, files) {
              if (files && files.length > 0) {
                //利用冒泡算法按修改时间排序
                var list = [];
                files.forEach(function (item) {
                  var temp = Object.create(null);
                  temp.key = item;
                  temp.stat = fs.statSync(capPath + '/' + item);
                  list.push(temp)
                })

                bubbleSort(list)

                function bubbleSort(array) {
                  /*给每个未确定的位置做循环fdff*/
                  for (var unfix = array.length - 1; unfix > 0; unfix--) {
                    /*给进度做个记录，比到未确定位置*/
                    for (var i = 0; i < unfix; i++) {

                      if (array[i].stat.mtime.getTime() > array[i + 1].stat.mtime.getTime()) {
                        var temp = array[i];
                        array.splice(i, 1, array[i + 1]);
                        array.splice(i + 1, 1, temp);
                      }
                    }
                  }
                }


                var path = capPath.substring(capPath.indexOf(dataStr) + dataStr.length)
                var pathList = '';
                list.forEach(function (item) {
                  pathList += path + '/' + item.key + ',';
                })
                testResult.images = pathList == '' ? '' : pathList.substring(0, pathList.length - 1);
              }
              push.send([
                wireutil.global
                , wireutil.envelope(new wire.ScriptResultMessage(
                  testResult.error,
                  testResult.total,
                  testResult.fail,
                  testResult.tasklogurl,
                  testResult.taskperformanceurl,
                  testResult.images,
                  testResult.serial,
                  testResult.task_id,
                  testResult.device_log,
                  testResult.reportcontent
                ))
              ])
              log.info('python script execute over successfully');

            })
          }

        })
      })
        .catch(function (err)  {
          log.error('script exacute over,proChild.exec error:', err)
          if(isDebug){
            soc.emit('debug.start.return', {success: false, desc: '错误:' + err.toString()})
            dsc.event.emit(dsc.option.screenFlag, true);
          }
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


    //用于appium日志转发
    var appiumLogServer = http.createServer(function (req, res) {
      //var pathName = url.parse(req.url).pathname;
      var body = ''
      req.on('data', function (data) {
        body += data;
      })
      req.on('end', function () {
        var bodyObj = JSON.parse(body)
        if (soc) {
          soc.emit('debug.log', bodyObj.params.message)
        }
      })
    })
    appiumLogServer.listen(options.appiumHttpPort)
    log.info('appiumLogServer Listening on port %d', options.appiumHttpPort)
  })
