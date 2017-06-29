var syrup = require('stf-syrup')
var _ = require('lodash')
var logger = require('../../../../util/logger')
module.exports = syrup.serial()
  .define(function(options) {
    var log = logger.createLogger('device:plugins:display')
    var plugin = Object.create(null)
    plugin.msgPort = options.msgPort;
    plugin.msgUrl= _.template(options.msgUrlPattern)({
      publicIp: options.publicIp
      , publicPort: options.msgPort
    })
log.info('msgWebSocket port is %s,url is %s',options.msgPort,plugin.msgUrl)
    return plugin
  })
