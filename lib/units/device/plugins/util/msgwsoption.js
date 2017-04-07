var syrup = require('stf-syrup')
var _ = require('lodash')
var logger = require('../../../../util/logger')
module.exports = syrup.serial()
  .define(function(options) {
    var log = logger.createLogger('device:plugins:display')
    var plugin = Object.create(null)
    plugin.msgWsPort = options.msgPort;
    plugin.msgWSUrl= _.template(options.msgWsUrlPattern)({
      publicIp: options.publicIp
      , publicPort: options.msgPort
    })
log.info('msgWebSocket port is %s,url is %s',options.msgPort,plugin.msgWSUrl)
    return plugin
  })