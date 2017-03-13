var http = require('http')
var util = require('util')
var path = require('path')
var fs=require('fs')

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
