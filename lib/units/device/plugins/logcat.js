var syrup = require('stf-syrup')
var Promise = require('bluebird')

var logger = require('../../../util/logger')
var wire = require('../../../wire')
var wireutil = require('../../../wire/util')
var lifecycle = require('../../../util/lifecycle')
var dateutil=require('../../../util/dateutil');
var fileutil=require('../../../util/fileutil');
var pathutil=require('../../../util/pathutil')

module.exports = syrup.serial()
  .dependency(require('../support/adb'))
  .dependency(require('../support/router'))
  .dependency(require('../support/push'))
  .dependency(require('./group'))
  .define(function(options, adb, router, push, group) {
    var log = logger.createLogger('device:plugins:logcat')
    var plugin = Object.create(null)
    var activeLogcat = null

    //变量
    plugin.logdir='';
    plugin.perdir='';
    var time;
    var groupTimer;
    var keyPoint=0;//标示关键点

    plugin.start = function(filters,packageName) {
      groupTimer=setInterval(function(){
        group.keepalive()
      },options.groupTimeout-60)
      return group.get()
        .then(function(group) {
          return plugin.stop()
            .then(function() {
              log.info('Starting logcat')
              //lgl性能开始
              time = setInterval(function () {
                adb.openPerformanceInfo(options.serial,packageName)
                  .then(function (result) {
                    push.send([
                      group.group
                      , wireutil.envelope(new wire.PerformanceEntryMessage(
                        options.serial
                        , JSON.stringify(result)
                      ))
                    ]);
                    var split = '|#|'

                    var data = [result.time
                      , result.cpus.User.toString().replace('%', '')
                      , (1 - (result.memorys.MemFree / result.memorys.MemTotal).toFixed(2)) * 100
                      , isNaN(result.flows.flowup) ? 0 : result.flows.flowup
                      , isNaN(result.flows.flowdown) ? 0 : result.flows.flowdown
                      , result.batterys.temperature / 10
                      , result.active//当前active
                      ,result.frame//帧率
                      ,keyPoint]//是否关键点，0/1
                    fileutil.pushQueue(plugin.perdir,data.join(split) + split + '\r\n')
                    if(keyPoint!=0){//标示关键点
                      keyPoint=0
                    }
                  })
                  .catch(function (err) {
                    console.error('openPerformanceInfo error:', err)
                  })
              }, Number(process.env.perRate))
              //性能结束
              return adb.openLogcat(options.serial, {
                clear: true
              })
            })
            .timeout(10000)
            .then(function(logcat) {
              activeLogcat = logcat

              function entryListener(entry) {
                var timestr=dateutil.datetimeToStr(entry.date,'-',' ',':');
                /*push.send([
                  group.group
                , wireutil.envelope(new wire.DeviceLogcatEntryMessage(
                    options.serial
                  , entry.date.getTime() / 1000
                  , entry.pid
                  , entry.tid
                  , entry.priority
                  , entry.tag
                  , entry.message
                  ))
                ])*/
                var split = '|#|'
                var data = [entry.priority, timestr, entry.pid, entry.tid, null, removeStr(entry.tag), removeStr(entry.message)]
                var temp = data.join(split) + split + '\r\n';
                fileutil.pushQueue(plugin.logdir,temp);
                var sData={
                  type:'log',
                  data:data
                }
              }
              function removeStr(str){
                return str.replace(/\r\n/g,'<br/>').replace(/\n/g,'<br/>').replace(/\r/g,'<br/>')
              }

              logcat.on('entry', entryListener)

              return plugin.reset(filters)
            })
        })
    }

    plugin.stop = Promise.method(function() {
      if (plugin.isRunning()) {
        log.info('Stopping logcat')
        activeLogcat.end()
        activeLogcat = null
        if(time){//
          clearInterval(time);
        }
        if(plugin.logdir){
          fileutil.endWrite(plugin.logdir);
          plugin.logdir=''
        }
        if(plugin.perdir){
          fileutil.endWrite(plugin.perdir);
          plugin.perdir=''
        }
        if(groupTimer){
          clearInterval(groupTimer)
        }
      }
    })

    plugin.reset = Promise.method(function(filters) {
      if (plugin.isRunning()) {
        activeLogcat
          .resetFilters()

        if (filters.length) {
          activeLogcat.excludeAll()
          filters.forEach(function(filter) {
            activeLogcat.include(filter.tag, filter.priority)
          })
        }
      }
      else {
        throw new Error('Logcat is not running')
      }
    })

    plugin.isRunning = function() {
      return !!activeLogcat
    }

    lifecycle.observe(plugin.stop)
    group.on('leave', plugin.stop)

    router
      .on(wire.LogcatStartMessage, function(channel, message) {
        log.info('logcat receive LogcatStartMessage:',message)
        var reply = wireutil.reply(options.serial)
        if (!message || !message.datePath || !message.logName || !message.performanceName) {
          log.info('logcat argument error')
          return;
        }
        var datePath = message.datePath;
        var logName = message.logName;
        var perName = message.performanceName;
        var logPath = pathutil.logPath(datePath, options.serial, process.env.logName);
        var perPath = pathutil.logPath(datePath, options.serial, process.env.perName);
        plugin.logdir=logPath+'/'+logName;
        plugin.perdir=perPath+'/'+perName;

        plugin.start(message.filters,message.packageName)
          .then(function() {
            push.send([
              channel
            , reply.okay('success')
            ])
          })
          .catch(function(err) {
            log.error('Unable to open logcat', err.stack)
            push.send([
              channel
            , reply.fail('fail')
            ])
          })
      })
      .on(wire.LogcatApplyFiltersMessage, function(channel, message) {
        var reply = wireutil.reply(options.serial)
        plugin.reset(message.filters)
          .then(function() {
            push.send([
              channel
            , reply.okay('success')
            ])
          })
          .catch(function(err) {
            log.error('Failed to apply logcat filters', err.stack)
            push.send([
              channel
            , reply.fail('fail')
            ])
          })
      })
      .on(wire.LogcatStopMessage, function(channel) {
        var reply = wireutil.reply(options.serial)
        plugin.stop()
          .then(function() {
            push.send([
              channel
            , reply.okay('success')
            ])
          })
          .catch(function(err) {
            log.error('Failed to stop logcat', err.stack)
            push.send([
              channel
            , reply.fail('fail')
            ])
          })
      })
      .on(wire.PerKeyPointMessage, function(channel) {
        keyPoint=1;
        var reply = wireutil.reply(options.serial)
        push.send([
          channel
          , reply.okay('success')
        ])
      })

    return plugin
  })
