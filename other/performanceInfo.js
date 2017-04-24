/**
 * Created by mat on 16-11-29.
 */
var Command, GetPerformanceCommand, Protocol,
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

Command = require('../command');

Protocol = require('../protocol');

GetPerformanceCommand = (function(superClass) {
  var RE_CPULINE,RE_BATTERY,RE_MEMLINE,RE_FLOWLINE,RE_COLSEP;

  extend(GetPerformanceCommand, superClass);

  function GetPerformanceCommand() {
    this.stats = {
      time:{},
      cpus: {},
      memorys:{},
      flows:{},
      batterys:{}
    };
    return GetPerformanceCommand.__super__.constructor.apply(this, arguments);
  }

  RE_CPULINE = /^User +[0-9]+%.*$/mg;
  RE_BATTERY = /^  (temperature|level|scale).*$/mg;
  RE_MEMLINE = /^Mem[T|F].*$/mg;
  RE_FLOWLINE = /^[0-9]+.*$/mg;

  RE_COLSEP=/\ +/g;

  GetPerformanceCommand.prototype.execute = function() {

    var comStr='shell:top -m 1 -n 1 -d 1';
    comStr+=' && cat /proc/meminfo';
    comStr+=' && cat /proc/net/xt_qtaguid/stats'
    comStr+=' && dumpsys battery'
    this._send(comStr);
    return this.parser.readAscii(4).then((function(_this) {
      return function(reply) {
        switch (reply) {
          case Protocol.OKAY:
            return _this.parser.readAll().then(function(data) {
              return _this._parse(data.toString());
            });
          case Protocol.FAIL:
            return _this.parser.readError();
          default:
            return _this.parser.unexpected(reply, 'OKAY or FAIL');
        }
      };
    })(this));
  };

  GetPerformanceCommand.prototype._parse = function(value) {
    this.stats.time=new Date().getTime();
    var battery, match,cols,line,type,flowup=0,flowdown=0;
    //cpu
    var cpus={};//console.log(value)
    while (match = RE_CPULINE.exec(value)) {
      line = match[0];
      cols = line.split(',');
      cols.forEach(function(item,index){
        if(item.indexOf('User')!=-1||item.indexOf('System')!=-1){
          var unTrim=item.replace(/(^\s*)|(\s*$)/g, '')
          subCols=unTrim.split(RE_COLSEP)
          if(subCols.length>=2){
            cpus[subCols[0]]=subCols[1];
          }
        }
      })
    }
    if(!line){console.log(value)}
    this.stats.cpus=cpus;

    while ((match = RE_MEMLINE.exec(value))) {
      line = match[0];
      cols = line.split(RE_COLSEP);
      type = cols.shift().replace(':','');
      this.stats.memorys[type] = cols[0];
    }

    while ((match = RE_FLOWLINE.exec(value))) {
      line = match[0];
      cols = line.split(RE_COLSEP);
      //type = cols.shift().replace(':','');
      flowup+=parseFloat(cols[5]);
      flowdown+=parseFloat(cols[7]);
    }
    this.stats.flows['flowup'] = flowup;
    this.stats.flows['flowdown'] = flowdown;
    this.stats.flows['flowtotal']=flowup+flowdown;

    //battery = [];
    while (match = RE_BATTERY.exec(value)) {
      line=match[0]
      cols=line.split(RE_COLSEP)
      type=cols[1].replace(':','');
      this.stats.batterys[type]=cols[2];
    }


    return this.stats;
  };

  return GetPerformanceCommand;

})(Command);

module.exports = GetPerformanceCommand;
