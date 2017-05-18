var appium=require('appium');
var fs=require('fs');
var uuid=require('uuid');
var Promise=require('bluebird');
var proChild=require('child_process')

var support=require('./support');
var pathutil=require('../../util/pathutil');
var dateutil=require('../../util/dateutil');
var wireutil = require('../../wire/util');
var wire = require('../../wire')
var logger = require('../../util/logger');
var zmqutil=require('../../util/zmqutil');
var srv = require('../../util/srv');
var lifecycle = require('../../util/lifecycle');


var scriptType=support.scriptType;

var arg=JSON.parse(process.argv[2]);

var log = logger.createLogger('emtc:appium:'+arg.serial);

// Output
var push = zmqutil.socket('push')
Promise.map(arg.pushPort, function (endpoint) {
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

appium.main({
  port: arg.aport,
  bootstrap: arg.bport,
  udid: arg.serial,
  chromedriverPort: arg.cport,
  selendroidPort:arg.sport ,
  log: arg.appiumLogPath,
  sessionOverride: true,
  //noReset:true,//为false时,会清空缓存数据重新启动.可能存在卸载安装包的隐患
  commandTimeout:30
})
  .then(function(){
    var logChannel = 'txs_' + uuid.v4();
    var sType = arg.scriptsPath.substring(arg.scriptsPath.lastIndexOf('.') + 1);//脚本类型
    switch (sType){
      case scriptType.ruby:
        /*runRuby()
          .then(function () {//运行结束,断开链接
            log.info('ruby script execute over successfully');
            //resolve()
          })*/
        break;
      case scriptType.python:
        runPython()
        break;
      case scriptType.nodejs:
        break;
      case scriptType.php:
        break;
      default:
        break;
    }

    function runPython() {
      log.info('enter runPython')
      var testResult = {
        error: null,//错误对象
        total: 0,//脚本总数
        fail: 0,//执行失败的脚本数
        tasklogurl: '',//日志文件
        taskperformanceurl: '',//性能文件
        images: '',//截图路径
        serial: arg.serial,//设备序列号
        task_id: arg.task,//任务ID
        device_log: arg.devLog,
        reportcontent: ''//,结果描述,富文本
      }
      /*var env = arg.env;
      env.UDID = arg.serial;
      env.VERSION = arg.version;
      env.APPIUMPORT = arg.aport;
      env.CAPTUREPATH = arg.capPath;
      env.DEVLOGPATH = arg.devLog;*/

      var path = getLogName();
      startLog(path)

      var envStr = getEnvStr(arg.env);
      console.log(envStr)
      log.info('runPython command');
      Promise.try(function () {
        var child = proChild.exec(envStr + 'python ' + arg.scriptsPath, function (err, stdout, stderr) {
          stopLog();
          var splitStr = 'data/'
          var logPath = pathutil.logPath(path.datePath, arg.serial, process.env.logName) + '/' + path.logName;//日志文件
          testResult.tasklogurl = logPath.substring(logPath.indexOf(splitStr) + splitStr.length)
          var perPath = pathutil.logPath(path.datePath, arg.serial, process.env.perName) + '/' + path.perName;
          testResult.taskperformanceurl = perPath.substring(perPath.indexOf(splitStr) + splitStr.length)
          if (err) {
            testResult.error = err;
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
          fs.readdir(arg.capPath, function (err, files) {
            if (files && files.length > 0) {
              //利用冒泡算法按修改时间排序
              var list = [];
              files.forEach(function (item) {
                var temp = Object.create(null);
                temp.key = item;
                temp.stat = fs.statSync(arg.capPath + '/' + item);
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


              var path = env.CAPTUREPATH.substring(env.CAPTUREPATH.indexOf(splitStr) + splitStr.length)
              var pathList = '';
              list.forEach(function (item) {
                pathList += path + '/' + item.key + ',';
              })
              /*for (var i = 0; i < files.length; i++) {
               pathList += path + '/' + files[i] + ',';
               }*/
              testResult.images = pathList == '' ? '' : pathList.substring(0, pathList.length - 1);
            }
            support.sendTestResult_script(testResult)
            log.info('python script execute over successfully');
            scriptOver();
          })
        })
      })
        .catch(function (err) {
          log.error('script exacute over,proChild.exec error:', err)
          scriptOver();
        })
    }

    function getLogName() {
      var path = {
        datePath: dateutil.dateToStr(new Date()),
        logName: arg.task + '_' + Date.now() + 'tasklogs.json',
        perName: arg.task + '_' + Date.now() + 'taskperformances.json'
      }
      return path;
    }

    function startLog(path) {
      log.info('startLog:',path)
      push.send([
        arg.channel
        , wireutil.transaction(
          logChannel
          , new wire.LogcatStartMessage([], path.datePath, path.logName, path.perName)//filter,date,tasklog,taskperformance
        )
      ])
    }

    function stopLog() {
      log.info('stopLog')
      push.send([
        arg.channel
        , wireutil.transaction(
          logChannel
          , new wire.LogcatStopMessage()//filter,date,tasklog,taskperformance
        )
      ])
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

    //true时正常退出,false异常退出
    function scriptOver(){
      log.info('enter emtc scriptOver')
      process.send([arg.aport,arg.bport,arg.cport,arg.sport]);
    }
  })

process.on('uncaughtException', function(err) {
  log.error('uncaughtException:'+err)
});

var unhandledRejections = new Map();
process.on('unhandledRejection', function(reason, p) {
  log.error('unhandledRejection:'+reason,p)
  unhandledRejections.set(p, reason);
});
process.on('rejectionHandled', function(p){
  log.error('rejectionHandled:'+p)
  unhandledRejections.delete(p);
});
