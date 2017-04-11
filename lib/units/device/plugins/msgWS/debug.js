var syrup = require('stf-syrup')
var logger = require('../../../../util/logger')

module.exports = syrup.serial()
  .define(function(options) {
    var log = logger.createLogger('device:plugins:debug')
    var plugin = Object.create(null)
    plugin.makeFileAndRunScript = function () {
      log.info('enter makeFileAndRunScript')
    }

    plugin.getAppUI = function () {
      log.info('enter getAppUI')
    }

    plugin.tryStopDebug = function () {
      log.info('enter tryStopDebug')
    }

    return plugin
  })
