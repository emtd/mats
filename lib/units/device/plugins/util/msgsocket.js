var syrup = require('stf-syrup')
var _ = require('lodash')
var util=require('util')
var EventEmitter = require('eventemitter3')
//var on = EventEmitter.prototype.on
var WebSocket = require('ws')
var Promise=require('bluebird')
var logger = require('../../../../util/logger')

module.exports = syrup.serial()
  .define(function(options) {
    var log = logger.createLogger('device:plugins:msgSocket')
    var plugin = Object.create(null)
    plugin.event=new EventEmitter();
    //util.inherits(plugin, EventEmitter)
    function createServer() {
      log.info('Starting msg WebSocket server on port %d', options.msgPort)

      var wss = new WebSocket.Server({
        port: options.msgPort
        , perMessageDeflate: false
      })

      var listeningListener, errorListener
      return new Promise(function(resolve, reject) {
        listeningListener = function() {
          return resolve(wss)
        }

        errorListener = function(err) {
          return reject(err)
        }

        wss.on('listening', listeningListener)
        wss.on('error', errorListener)
      })
        .finally(function() {
          wss.removeListener('listening', listeningListener)
          wss.removeListener('error', errorListener)
        })
    }

    createServer()
      .then(function(wss){
        log.info('msgWebSocket listenning on %s',options.msgPort)
        wss.on('connection', function(ws) {
          log.info('msgWebSocket connection %s',ws)
          plugin.ws=ws

          ws.on('message', function(data, flags) {
            log.info(data,flags)
            //plugin.event.emit('message',data, flags)
          })
          ws.on('close', function() {
            log.info('msg websocket close')
          })

          plugin.send=function(message, options) {
            return new Promise(function(resolve, reject) {
              switch (ws.readyState) {
                case WebSocket.OPENING:
                  // This should never happen.
                  log.warn('Unable to send to OPENING client "%s"', id)
                  break
                case WebSocket.OPEN:
                  // This is what SHOULD happen.
                  ws.send(message, options, function(err) {
                    return err ? reject(err) : resolve()
                  })
                  break
                case WebSocket.CLOSING:
                  // Ok, a 'close' event should remove the client from the set
                  // soon.
                  break
                case WebSocket.CLOSED:
                  // This should never happen.
                  log.warn('Unable to send to CLOSED client "%s"', id)
                  break
              }
            })
          }

        })
      })
return plugin;
  })