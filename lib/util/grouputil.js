var util = require('util')

var Promise = require('bluebird')
var semver = require('semver')
var minimatch = require('minimatch')

var wire = require('../wire');
var dbapi=require('../db/api');

function RequirementMismatchError(name) {
  Error.call(this)
  this.name = 'RequirementMismatchError'
  this.message = util.format('Requirement mismatch for "%s"', name)
  Error.captureStackTrace(this, RequirementMismatchError)
}

util.inherits(RequirementMismatchError, Error)

module.exports.RequirementMismatchError = RequirementMismatchError

//lgl start
function OwnMsgError(){
  Error.call(this)
  this.name = 'OwnMsgError'
  this.message = 'Do not have permission to use'
  Error.captureStackTrace(this, OwnMsgError)
}
util.inherits(OwnMsgError, Error)
module.exports.OwnMsgError = OwnMsgError
//lgl end

function AlreadyGroupedError() {
  Error.call(this)
  this.name = 'AlreadyGroupedError'
  this.message = 'Already a member of another group'
  Error.captureStackTrace(this, AlreadyGroupedError)
}

util.inherits(AlreadyGroupedError, Error)

module.exports.AlreadyGroupedError = AlreadyGroupedError

function NoGroupError() {
  Error.call(this)
  this.name = 'NoGroupError'
  this.message = 'Not a member of any group'
  Error.captureStackTrace(this, NoGroupError)
}

util.inherits(NoGroupError, Error)

module.exports.NoGroupError = NoGroupError

module.exports.match = Promise.method(function(capabilities, requirements,ownMsg) {
  return new Promise(function(resolve,reject) {
    requirements.every(function (req) {
      var capability = capabilities[req.name]

      if (!capability) {
        throw new RequirementMismatchError(req.name)
      }

      switch (req.type) {
        case wire.RequirementType.SEMVER:
          if (!semver.satisfies(capability, req.value)) {
            throw new RequirementMismatchError(req.name)
          }
          break
        case wire.RequirementType.GLOB:
          if (!minimatch(capability, req.value)) {
            throw new RequirementMismatchError(req.name)
          }
          break
        case wire.RequirementType.EXACT:
          if (capability !== req.value) {
            throw new RequirementMismatchError(req.name)
          }
          break
        default:
          throw new RequirementMismatchError(req.name)
      }
      //增加emtc设备占用的检测
      dbapi.loadDevice(capability)
        .then(function (device) {
          require('./fileutil').endWrite('/tmp/0001',new Date().toString()+',token match,token:'+device.token+',own:'+ownMsg.email)
          console.log('match device:token:', device.token,' owner:', device.owner,'ownMsg:',ownMsg)
          if ((ownMsg != null && device.token == ownMsg.email) || (ownMsg == null && device.owner != null)) {
            resolve(true)

          } else {
            reject(new OwnMsgError())
          }
        })
        .catch(function (err) {
          reject(err);
        })

      //return true
    })
  })
})
