module.exports.command = 'websocket'

module.exports.describe = 'Start a websocket unit.'

module.exports.builder = function(yargs) {
  return yargs
    .env('STF_WEBSOCKET')
    .strict()
    .option('connect-push', {
      alias: 'c'
    , describe: 'App-side ZeroMQ PULL endpoint to connect to.'
    , array: true
    , demand: true
    })
    .option('connect-sub', {
      alias: 'u'
    , describe: 'App-side ZeroMQ PUB endpoint to connect to.'
    , array: true
    , demand: true
    })
    .option('port', {
      alias: 'p'
    , describe: 'The port to bind to.'
    , type: 'number'
    , default: process.env.PORT || 7110
    })
    .option('secret', {
      alias: 's'
    , describe: 'The secret to use for auth JSON Web Tokens. Anyone who ' +
        'knows this token can freely enter the system if they want, so keep ' +
        'it safe.'
    , type: 'string'
    , default: process.env.SECRET
    , demand: true
    })
    .option('ssid', {
      alias: 'i'
    , describe: 'The name of the session ID cookie.'
    , type: 'string'
    , default: process.env.SSID || 'ssid'
    })
    .option('storage-url', {
      alias: 'r'
    , describe: 'URL to the storage unit.'
    , type: 'string'
    , demand: true
    })
    .option('proxy-mode', {
      describe: 'The agent of the device server and application server'
      , type: 'boolean'
      , default: true
    })
    .option('proxy-max-port', {
      describe: 'Highest port number for device workers to use.'
      , type: 'number'
      , default: 10500
    })
    .option('proxy-min-port', {
      describe: 'Lowest port number for device workers to use.'
      , type: 'number'
      , default: 10000
    })
    .epilog('Each option can be be overwritten with an environment variable ' +
      'by converting the option to uppercase, replacing dashes with ' +
      'underscores and prefixing it with `STF_WEBSOCKET_` (e.g. ' +
      '`STF_WEBSOCKET_STORAGE_URL`).')
}

module.exports.handler = function(argv) {
  function range(from, to) {
    var items = []
    for (var i = from; i <= to; ++i) {
      items.push(i)
    }
    return items
  }
  return require('../../units/websocket')({
    port: argv.port
  , proxyPorts: range(argv.proxyMinPort, argv.proxyMaxPort)
  , secret: argv.secret
  , ssid: argv.ssid
  , storageUrl: argv.storageUrl
  , endpoints: {
      sub: argv.connectSub
    , push: argv.connectPush
    }
  ,proxyMode:argv.proxyMode
  })
}
