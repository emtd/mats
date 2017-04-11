var EventEmitter = require('eventemitter3')
var syrup = require('stf-syrup')
var logger = require('../../../../util/logger')

module.exports = syrup.serial()
  .define(function(options) {
    var log = logger.createLogger('device:plugins:debugScreenControl')
    var plugin = Object.create(null)
    plugin.event = new EventEmitter();
    plugin.option={
      screenFlag:'screenFlag'
    }
    return plugin;
  })
