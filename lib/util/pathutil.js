var path = require('path')
var fs = require('fs')
var util = require('util')

// Export
module.exports.root = function(target) {
  return path.resolve(__dirname, '../..', target)
}

// Export
module.exports.resource = function(target) {
  return path.resolve(__dirname, '../../res', target)
}

// Export
module.exports.vendor = function(target) {
  return path.resolve(__dirname, '../../vendor', target)
}

// Export
module.exports.module = function(target) {
  return path.resolve(__dirname, '../../node_modules', target)
}

// Export
module.exports.requiredMatch = function(candidates) {
  for (var i = 0, l = candidates.length; i < l; ++i) {
    if (fs.existsSync(candidates[i])) {
      return candidates[i]
    }
  }

  throw new Error(util.format(
    'At least one of these paths should exist: %s'
  , candidates.join(', ')
  ))
}

//lgl type:process.env.logName,perName,capName,autoCapName:
module.exports.logPath=function(date,serial,type){
  return process.env.dataPath+'/'+date+'/'+serial+'/'+type
}

// Export
module.exports.data = function(target) {
  return path.resolve(__dirname, '../../data', target)
}
