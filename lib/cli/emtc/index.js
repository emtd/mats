module.exports.command = 'emtc';

module.exports.describe = 'Start an emtc unit.'

module.exports.builder = function(yargs) {
  return yargs
    .env('STF_EMTC')
    .strict()
    .option('port',{
      //alias:'p',
       describe:'port of emtc service'
      , type:Number
      //, demand: true
      , default:7109
    })
    .option('secret',{
      //alias: 'a',
       describe: 'port of emtc service'
      , type: String
      , default:process.env.SECRET
    })
    .option('connect-push',{
      //alias: 'c',
       describe:  'push endpoint'
      , array: true
      , demand: true
    })
     .option('connect-sub',{
      //alias:'u',
       describe: 'sub endpoint'
      , array: true
      , demand: true
    })
     .option('group-timeout',{
      //alias:'t',
       describe:'group timeout'
      , type:Number
      , default:900
    })
    .epilog('Each option can be be overwritten with an environment variable ' +
      'by converting the option to uppercase, replacing dashes with ' +
      'underscores and prefixing it with `STF_EMTC_` (e.g. ' +
      '`STF_EMTC_PORT`).')
}

module.exports.handler = function(argv) {
  return require('../../units/emtc')({
    port: argv.port
    ,secret:argv.secret
    , groupTimeout: argv.groupTimeout * 1000 // change to ms
    , endpoints: {
      push: argv.connectPush
      , sub: argv.connectSub
    }
  })
}