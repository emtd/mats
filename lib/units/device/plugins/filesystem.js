var syrup = require('stf-syrup')
var path = require('path')
var fs=require('fs')
var Promise=require('bluebird')
var adbkit=require('adbkit')

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
          var devlogdir=pathutil.logPath(dateutil.dateToStr(),options.serial,process.env.devLogName);
          if(stats.isFile()) {
            fileutil.mkdirs(devlogdir)
              .then(function () {
                adb.pull(options.serial, message.dir)
                  .then(function (transfer) {
                    var filename = message.dir.substring(message.dir.lastIndexOf('/') + 1)
                    var ws = fs.createWriteStream(devlogdir + '/' + filename);
                    transfer.pipe(ws);
                    var returnDir=devlogdir.substring(devlogdir.indexOf('data/')+('data/'.length))
                    push.send([
                      channel
                      ,reply.okay('success',returnDir)
                    ])
                  })
                  .catch(function(err){
                    log.error('error1:',err)
                    push.send([
                      channel
                      ,reply.fail('fail',err)
                    ])
                  })
              })
          }
          //路径
          if(stats.isDirectory()){
            //最后以'/'结束,将文件夹内部的文件包括文件夹拉上,不以'/'结尾,直接将文件夹拉上来
            if(message.dir[message.dir.length-1]!='/') {
              var tempList = message.dir.split('/');
              var foldname = tempList[tempList.length - 1];
              devlogdir=devlogdir+'/'+foldname
            }
            fileutil.mkdirs((devlogdir))
                .then(function(){
                  retriveFile(message.dir,devlogdir)
                  var returnDir=devlogdir.substring(devlogdir.indexOf('data/')+('data/'.length))
                  push.send([
                    channel
                    ,reply.okay('success',returnDir)
                  ])
                })
                .catch(function(err){
                  log.error('error0:',err)
                  push.send([
                    channel
                    ,reply.fail('fail',err)
                  ])
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

    router.on(wire.DeviceAppUIGetMessage, function(channel, message) {
      log.info('receive DeviceAppUIGetMessage:', message)
      var reply = wireutil.reply(options.serial)
      //var data = {img: null, xml: null}
      //用adb获取文件后,store并post到storage的temp中,
      //截图
      var img = new Promise(function (resolve, reject) {
        adb.screencap(options.serial)
          .then(adbkit.util.readAll)
          .then(function (screencap) {
            //console.log(screencap)
            /*var ws=fs.createWriteStream('./test.png');
             screencap.pipe(ws);*/
            //data.img=screencap.toString('base64');
            resolve(screencap);
          })
          .catch(function (err) {
            console.log('截图失败,错误:', err)
            reject(err)
          })
      })
      var xml = new Promise(function (resolve, reject) {
        var file = '/data/local/tmp/tmp.xml'
        adb.shell(options.serial, 'adb shell uiautomator dump ' + file)
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
                console.log('-------------------transfer:', transfer.constructor.name)
                resolve(transfer)
                //data.xml=transfer.toString();resolve();
                /*var ws=fs.createWriteStream('./test.xml');
                 transfer.pipe(ws);*/
              })
          })
          .catch(function (err) {
            console.log('error:', err)
            reject(err)
          })
      })
      Promise.all([img, xml])
        .spread(function (idata, xdata) {
          console.log('-------------------enter spread')
          var data = {img: idata, xml: xdata}
          push.send([
            channel
            , reply.okay('success', data)
          ])
          console.log('send---')
        })
        .catch(function(err){
          console.log('-------------------enter catch:',err)
          push.send([
            channel
            , reply.fail('fail',err)
          ])
        })

    })

    return plugin
  })
