var syrup = require('stf-syrup')
var path = require('path')
var fs=require('fs')

var logger = require('../../../util/logger')
var wire = require('../../../wire')
var wireutil = require('../../../wire/util')
var pathutil=require('../../../util/pathutil');
var dateutil=require('../../../util/dateutil');
var fileutil=require('../../../util/fileutil');


module.exports = syrup.serial()
  .dependency(require('../support/adb'))
  .dependency(require('../support/router'))
  .dependency(require('../support/push'))
  .dependency(require('../support/storage'))
  .define(function(options, adb, router, push, storage) {
    var log = logger.createLogger('device:plugins:filesystem')
    var plugin = Object.create(null)

    plugin.retrieve = function(file) {
      log.info('Retrieving file "%s"', file)

      return adb.stat(options.serial, file)
        .then(function(stats) {
          return adb.pull(options.serial, file)
            .then(function(transfer) {
              // We may have add new storage plugins for various file types
              // in the future, and add proper detection for the mimetype.
              // But for now, let's just use application/octet-stream for
              // everything like it's 2001.
              return storage.store('blob', transfer, {
                filename: path.basename(file)
              , contentType: 'application/octet-stream'
              , knownLength: stats.size
              })
            })
        })
    }

    router.on(wire.FileSystemGetMessage, function(channel, message) {
      var reply = wireutil.reply(options.serial)
      plugin.retrieve(message.file)
        .then(function(file) {
          push.send([
            channel
          , reply.okay('success', file)
          ])
        })
        .catch(function(err) {
          log.warn('Unable to retrieve "%s"', message.file, err.stack)
          push.send([
            channel
          , reply.fail(err.message)
          ])
        })
    })

    router.on(wire.FileSystemListMessage, function(channel, message) {
      var reply = wireutil.reply(options.serial)
      adb.readdir(options.serial, message.dir)
        .then(function(files) {
          push.send([
            channel
          , reply.okay('success', files)
          ])
        })
        .catch(function(err) {
          log.warn('Unable to list directory "%s"', message.dir, err.stack)
          push.send([
            channel
          , reply.fail(err.message)
          ])
        })
    })

    router.on(wire.FileSystemPullMessage, function(channel, message) {
      log.info('receive FileSystemPullMessage:',message.dir)
      var reply = wireutil.reply(options.serial)
      adb.stat(options.serial, message.dir)
        .then(function(stats){
          //先判断是否是路径
          if(!stats.isDirectory()){
            push.send([
              channel
              , reply.fail('fail','请输入目录,而不是文件路径或其他!')
            ])
          }else{
            var devlogdir=pathutil.logPath(dateutil.dateToStr(),options.serial,process.env.devLogName);
            fileutil.mkdirs(devlogdir)
              .then(function(){
                retriveFile(message.dir,devlogdir)
                push.send([
                  channel
                  ,reply.okay('success',devlogdir)
                ])
              })
              .catch(function(err){
                log.error('FileSystemPullMessage mkdirs error:',err)
              })
          }
        })
        .catch(function(err){
          if(err.code=='ENOENT'){
            push.send([
              channel
              , reply.fail('fail','指定目录不存在')
            ])
          }else{
            push.send([
              channel
              , reply.fail('fail',err)
            ])
          }
        })

      function retriveFile(dir,target){
        adb.readdir(options.serial, dir)
          .then(function(statList) {
            statList.forEach(function(value,index,array){
              var file=dir+'/'+value.name
              adb.stat(options.serial,file)
                .then(function(stats){
                  if(stats.isFile()){
                    adb.pull(options.serial,file)
                      .then(function(transfer){
                        var ws=fs.createWriteStream(target+'/'+value.name);
                        transfer.pipe(ws);
                      })
                  }
                  if(stats.isDirectory()){
                    var devlogdir=target+'/'+value.name
                    fileutil.mkdirs(devlogdir)
                      .then(function(){
                        retriveFile(file,devlogdir)
                      })
                  }
                })
            })
          })
          .catch(function(err) {
            log.error('Unable to list directory', err.stack)
          })
      }
    })

    return plugin
  })
