var util = require('util')
var fs=require('fs')

var syrup = require('stf-syrup')
var adbkit = require('adbkit')

var logger = require('../../../../util/logger')
var wire = require('../../../../wire')
var wireutil = require('../../../../wire/util')
var fileutil=require('../../../../util/fileutil')
var pathutil=require('../../../../util/pathutil')

module.exports = syrup.serial()
  .dependency(require('../../support/adb'))
  .dependency(require('../../support/router'))
  .dependency(require('../../support/push'))
  .dependency(require('../../support/storage'))
  .dependency(require('../../resources/minicap'))
  .dependency(require('../util/display'))
  .define(function(options, adb, router, push, storage, minicap, display) {
    var log = logger.createLogger('device:plugins:screen:capture')
    var plugin = Object.create(null)

    function projectionFormat() {
      return util.format(
        '%dx%d@%dx%d/%d'
      , display.properties.width
      , display.properties.height
      , display.properties.width
      , display.properties.height
      , display.properties.rotation
      )
    }

    plugin.capture = function(msg) {
      log.info('Capturing screenshot')

      var file = util.format('/data/local/tmp/minicap_%d.jpg', Date.now())
      return minicap.run(util.format(
          '-P %s -s >%s', projectionFormat(), file))
        .then(adbkit.util.readAll)
        .then(function() {
          return adb.stat(options.serial, file)
        })
        .then(function(stats) {
          if (stats.size === 0) {
            throw new Error('Empty screenshot; possibly secure screen?')
          }

          return adb.pull(options.serial, file)
            .then(function(transfer) {
              //增加在设备服务器端生成截图的功能，
              //生成文件夹，文件夹路径由mat发起screen.capture时带入。路径值参考log和performance,日期文件夹和图片名称
              var imgPath=pathutil.root('data/'+msg.datePath+'/'+options.serial+'/screenCapture')
              fileutil.mkdirs(imgPath)
                .then(function(){
                  var ws = fs.createWriteStream(imgPath + '/' + msg.imgName);
                  transfer.pipe(ws);
                })
              return storage.store('image', transfer, {
                filename: util.format('%s.jpg', options.serial)
              , contentType: 'image/jpeg'
              , knownLength: stats.size
              })
            })
        })
        .finally(function() {
          return adb.shell(options.serial, ['rm', '-f', file])
            .then(adbkit.util.readAll)
        })
    }

    router.on(wire.ScreenCaptureMessage, function(channel,message) {
      var reply = wireutil.reply(options.serial)
      plugin.capture(message)
        .then(function(file) {
          push.send([
            channel
          , reply.okay('success', file)
          ])
        })
        .catch(function(err) {
          log.error('Screen capture failed', err.stack)
          push.send([
            channel
          , reply.fail(err.message)
          ])
        })
    })

    return plugin
  })
