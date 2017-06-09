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
  RE_CURACTIVE = /^  mCurrentFocus=Window{.*$/mg;
  RE_COLSEP=/\ +/g;

  GetPerformanceCommand.prototype.execute = function(packageName) {

    var comStr='shell:top -m 1 -n 1 -d 1';
    comStr+=' && cat /proc/meminfo';
    comStr+=' && cat /proc/net/xt_qtaguid/stats'
    comStr+=' && dumpsys battery'
    comStr+=' && dumpsys window|grep mCurrentFocus'
    comStr+=' && dumpsys gfxinfo '+packageName
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
    //console.log('------------------adbkit performanceInfo-------------------')
    this.stats.time=new Date().getTime();
    var battery, match,cols,line,type,flowup=0,flowdown=0;
    //cpu
    var cpus={};
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

    //active
    while (match = RE_CURACTIVE.exec(value)) {
      line=match[0]
      var i=line.indexOf('/');
      var activeStr=line.substring(line.indexOf('/')+1,line.indexOf('}'))
      this.stats.active=activeStr;
    }

    //frame
    var dataIndex=value.indexOf('Profile data in ms:');
    if(dataIndex==-1){
      this.stats.frame=0;
      //console.log('no frame message!\r\nplease sure the app is install in device and open app package and move on screen!');
      return;
    }
    var profileData=value.substring(dataIndex+'Profile data in ms:'.length+1)
    //console.log(profileData)
    var list=profileData.split('\r\n');
    //var jank_count=0;掉帧
    var frameTime=16.66667
    var jankFrame=0;
    var frameCount=0
    list.forEach(function(item){
      if(item!=''){
        var nlist=item.split('\t')
        var temp=nlist[0]!=''?nlist[0]:nlist[1]
        if(isNaN(Number(temp))){
          return;
        }
        frameCount++;
        var time=0;
        nlist.forEach(function(i){
          time+=Number(i);
        })
        /*if(time>frameTime){//掉帧的情况
         jank_count++;
         }*/
        if(time>frameTime){
          if(time%frameTime==0){
            jankFrame+=parseInt(time%frameTime)-1
          }else{
            jankFrame+=parseInt(time%frameTime)
          }
        }

      }
    })
    var fps=parseInt(frameCount*60/(frameCount+jankFrame))
    this.stats.frame=fps
    //console.log(this.stats)
    return this.stats;
  };

  return GetPerformanceCommand;

})(Command);

module.exports = GetPerformanceCommand;
