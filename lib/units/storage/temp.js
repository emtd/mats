var http = require('http')
var util = require('util')
var path = require('path')
var fs=require('graceful-fs')

var express = require('express')
var validator = require('express-validator')
var bodyParser = require('body-parser')
var formidable = require('formidable')
var Promise = require('bluebird')

var logger = require('../../util/logger')
var Storage = require('../../util/storage')
var requtil = require('../../util/requtil')
var download = require('../../util/download')
var pathutil=require('../../util/pathutil')
var dateutil=require('../../util/dateutil')
var fileutil=require('../../util/fileutil')

module.exports = function(options) {
  var log = logger.createLogger('storage:temp')
  var app = express()
  var server = http.createServer(app)
  var storage = new Storage()

  app.set('strict routing', true)
  app.set('case sensitive routing', true)
  app.set('trust proxy', true)

  app.use(bodyParser.json())
  app.use(validator())

  storage.on('timeout', function(id) {
    log.info('Cleaning up inactive resource "%s"', id)
  })

  app.post('/s/download/:plugin', function(req, res) {
    requtil.validate(req, function() {
        req.checkBody('url').notEmpty()
      })
      .then(function() {
        return download(req.body.url, {
          dir: options.cacheDir
        })
      })
      .then(function(file) {
        return {
          id: storage.store(file)
        , name: file.name
        }
      })
      .then(function(file) {
        var plugin = req.params.plugin
        res.status(201)
          .json({
            success: true
          , resource: {
              date: new Date()
            , plugin: plugin
            , id: file.id
            , name: file.name
            , href: util.format(
                '/s/%s/%s%s'
              , plugin
              , file.id
              , file.name ? util.format('/%s', path.basename(file.name)) : ''
              )
            }
          })
      })
      .catch(requtil.ValidationError, function(err) {
        res.status(400)
          .json({
            success: false
          , error: 'ValidationError'
          , validationErrors: err.errors
          })
      })
      .catch(function(err) {
        log.error('Error storing resource', err.stack)
        res.status(500)
          .json({
            success: false
          , error: 'ServerError'
          })
      })
  })

  app.post('/s/upload/:plugin', function(req, res) {
    var form = new formidable.IncomingForm()
    form.keepExtensions = true;
    if (options.saveDir) {
      form.uploadDir = options.saveDir
    }
    Promise.promisify(form.parse, form)(req)
      .spread(function(fields, files) {
        return new Promise(function (resolve, reject) {
          var capPath = null;
          if (fields.serial) {
            capPath = pathutil.logPath(dateutil.dateToStr(new Date()), fields.serial, process.env.capName)
            fileutil.mkdirs(capPath)
              .then(function () {
                resolve(genFileList())
              })
          } else {
            resolve(genFileList())
          }


          function genFileList() {
            return Object.keys(files).map(function (field) {
              var file = files[field]
              var newPath = null;
              var subPath = null;
              if (file.type == 'image/jpeg') {
                newPath = capPath + file.path.substring(file.path.lastIndexOf('/')).replace('upload_', '')
                fs.rename(file.path, newPath)
                file.path = newPath;
                subPath = newPath.substring(newPath.indexOf('data/') + 'data/'.length);
              }
              log.info('Uploaded "%s" to "%s"', file.name, file.path)
              return {
                field: field
                , id: storage.store(file)
                , name: file.name
                , subPath: subPath
              }
            })
          }
        })
      })
      .then(function(storedFiles) {
        res.status(201)
          .json({
            success: true
          , resources: (function() {
              var mapped = Object.create(null)
              storedFiles.forEach(function(file) {
                var plugin = req.params.plugin
                mapped[file.field] = {
                  date: new Date()
                , plugin: plugin
                , id: file.id
                , name: file.name
                , href: util.format(
                    '/s/%s/%s%s'
                  , plugin
                  , file.id
                  , file.name ?
                      util.format('/%s', path.basename(file.name)) :
                      ''
                  )+(file.subPath?'?path='+file.subPath:'')
                }
              })
              return mapped
            })()
          })
      })
      .catch(function(err) {
        log.error('Error storing resource', err.stack)
        res.status(500)
          .json({
            success: false
          , error: 'ServerError'
          })
      })
  })

  app.post('/s/upload/debug/:user/:serial/',function(req,res) {
    log.info('/s/upload/debug/%s/%s/', req.params.user, req.params.serial)
    var form = new formidable.IncomingForm()
    form.keepExtensions = true;
    if (options.saveDir) {
      form.uploadDir = options.saveDir
    }
    //保证调试目录存在
    var debugPath = pathutil.root(process.env.debugPath + '/' + req.params.user + '/' + req.params.serial + '/res')
    new Promise(function (resolve, reject) {
      if (fs.existsSync(debugPath)) {
        fileutil.rmFilesByPath(debugPath)
          .then(function () {
            resolve()
          })
          .catch(function (err) {
            reject(err)
          })
      } else {
        fileutil.mkdirs(debugPath)
          .then(function () {
            resolve()
          })
          .catch(function (err) {
            reject(err)
          })
      }
    })
      .then(function () {
        Promise.promisify(form.parse, form)(req)
          .spread(function (fields, files) {
            Object.keys(files).map(function (field) {
              //field:xx.jpg,files[field]:File对象
              var file = files[field]
              if (file.type == 'image/jpeg') {
                var newPath = debugPath + '/' + field
              }
              if (file.type == 'text/plain') {
                var newPath = path.resolve(debugPath, '../' + field)
              }
              fs.rename(file.path, newPath)
              file.path = newPath;
            })
            console.log('rename ...')
          })
          .then(function(){
            console.log('then ....')
          })
      })
  })

  app.get('/s/download/debug/:user/:serial/appui',function(req,res) {///:user/:serial,req.params.user,req.params.serial
    log.info('/s/upload/debug/%s/%s/appui', req.params.user, req.params.serial)
    var adbkit=require('adbkit')
    var promiseutil=require('../../util/promiseutil')
    var adb = adbkit.createClient({
      host: '127.0.0.1'
      , port: 5037
    })
    function ensureBootComplete() {
      return promiseutil.periodicNotify(
        adb.waitBootComplete(req.params.serial)
        , 1000
      )
        .progressed(function() {
          log.info('Waiting for boot to complete')
        })
        .timeout(60000)
    }

    ensureBootComplete()
      .then(function(){
        //截图
        var img = new Promise(function (resolve, reject) {
          adb.screencap(req.params.serial)
            .then(adbkit.util.readAll)
            .then(function (screencap) {
              resolve(screencap);
            })
            .catch(function (err) {
              log.error('img error:', err)
              reject('img error:'+err.toString())
            })
        })
        var xml = new Promise(function (resolve, reject) {
          var file = '/data/local/tmp/tmp.xml'
          adb.shell(req.params.serial, 'uiautomator dump ' + file)
            .then(adbkit.util.readAll)
            .then(function () {
              return adb.stat(req.params.serial, file)
            })
            .then(function (stats) {
              if (stats.size === 0) {
                throw new Error('Empty screenshot; possibly secure screen?')
              }
              return adb.pull(req.params.serial, file)
                .then(adbkit.util.readAll)
                .then(function (transfer) {
                  resolve(transfer)
                })
            })
            .catch(function (err) {
              log.error('xml error:', err)
              reject('xml error:'+err.toString())
            })
        })
        Promise.all([img, xml])
          .spread(function (idata, xdata) {
            /*console.log('---');
             console.log(idata);
             fs.writeFile('/home/mat/test00.png',idata,function(data){
             console.log('---',data)
             })*/
            var imgdata=idata.toString('base64');
            /*console.log('---==--');
             console.log(new Buffer(imgdata,'base64'));
             fs.writeFile('/home/mat/testestiii0.png',new Buffer(imgdata,'base64'),function(data){
             console.log('+++++',data)
             })*/
            var data = {img: imgdata, xml: xdata.toString()}
            res.status(201)
              .json({
                success: true,
                data: data
              });
          })
          .catch(function(err){
            log.error('appui error:',err)
            res.status(500)
              .json({
                success: false,
                data: null
              });
          })
      })
  })

  app.get('/s/download/debug/:user/:serial/capture',function(req,res) {///:user/:serial,req.params.user,req.params.serial
    console.log('-------------------------',req.params.user,req.params.serial)
    //截图接口
    var dir = pathutil.root(process.env.debugPath + '/' + req.params.user + '/' + req.params.serial + '/capture')
    if (fs.existsSync(dir)) {
      fs.readdir(dir, function (err, files) {
        if(files.length>0){
          var proList=[];
          files.forEach(function(item){
            var readF=new Promise(function(resolve,reject) {
              fs.readFile(dir + '/' + item, function (err, data) {
                if(err){
                  reject(err);
                }else{
                  resolve(data)
                }
              })
            })
            proList.push(readF);
          })
          Promise.all(proList)
            .then(function(data){
              res.status(201)
                .json({
                  success: true,
                  data:JSON.stringify(data),
                  description: 'img'
                });
            })
            .catch(function(err){
              res.status(500)
                .json({
                  success: false,
                  data:null,
                  description: 'server error'
                });
            })
        }
      })
    }
    else {
      res.status(201)
        .json({
          success: true,
          description: 'no image'
        });
    }
  })

  app.get('/s/blob/:id/:name', function(req, res) {
    var file = storage.retrieve(req.params.id)
    if (file) {
      if (typeof req.query.download !== 'undefined') {
        res.set('Content-Disposition',
          'attachment; filename="' + path.basename(file.name) + '"')
      }
      res.set('Content-Type', file.type)
      res.sendFile(file.path)
    }
    else {
      res.sendStatus(404)
    }
  })

  server.listen(options.port)
  log.info('Listening on port %d', options.port)
}
