var http=require('http');
var _=require('lodash');

var dateutil=require('../../util/dateutil')
var fileutil=require('../../util/fileutil')
var pathutil=require('../../util/pathutil')

var plugin={};

var postPath={
  occupyDevice:'/emtc/user/devices/occupy',
  releaseDevice:'/emtc/user/devices/release',
  //getDeviceInfo:'/emtc/device',//获取单个设备的信息
  //getDeviceList:'/emtc/deviceList',//获取多个设备的信息,参数必须为数组
  getDevices:'/emtc/devices',//
  getDevState:'/emtc/device/state',//获取指定设备的状态
  scriptRun:'/emtc/scriptRun',
  stopScriptRun:'/emtc/scriptRun/stop',

  devicesInfo:'/api/liveupdatedevice',//实时推送设备状态
  tasksubmit:'/api/tasksubmit',//推送
};
plugin.postPath=postPath;



plugin.devState={
  nopermissions:0,//'no permissions',
  offline:1,//'offline',
  unauthorized:2,//'unauthorized',
  device:3,//'device',
  present:4,//'present',connect
  prepare:5,//'preparing',
  ready:6,//'ready',
  absent:7,//'absent'
}

var devList={}
plugin.sendDevState=function(msg) {
  var data = {
    serial: msg.serial,
    ip:require('my-local-ip')(),
    detail: {},
    state: plugin.devState.absent
  }
  if (devList[msg.serial]==null) {
    devList[msg.serial] = {};
  }
  var tempObj = _.merge(devList[msg.serial], msg);
  data.detail = devList[msg.serial];

  if (tempObj.present) {
    if (tempObj.status!=null && tempObj.status != 3) {
      data.state = tempObj.status;//status[]
    }
    else if (tempObj.status != null) {
      if (tempObj.ready) {
        data.state = plugin.devState.ready;
      } else {
        data.state = plugin.devState.prepare;
      }
    }
  }
  else {
    if (tempObj.status&&tempObj.status != 3) {
      data.state = tempObj.status
    }
  }
  plugin.sendDevMsg(postPath.devicesInfo, data);
}

var bufDevState=[];
var devTimer;
plugin.sendDevMsg=function(postPath,data) {
  var logPath=pathutil.root('log')+'/'+dateutil.dateToStr(new Date());
  var value={'data':data}
  var postData = JSON.stringify(value);
  var options = {
    hostname: process.env.EMTCIP,
    port: process.env.EMTCPORT,
    path: postPath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',//application/json,application/x-www-form-urlencoded
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  var req = http.request(options, function (res) {
    var body = '';
    res.on('data', function (chunk) {
      body += chunk;
    });
    res.on('end', function () {
      console.log(body)
      var wData = '\r\n' + dateutil.timeToStr(new Date(),':') + ' http://' + process.env.EMTCIP + ':' + process.env.EMTCPORT + postPath + ' RESPONSE,' + body + '\r\n';
      if (wData.length > 200) {
        wData = wData.substring(0, 200);
      }
      fileutil.endWrite(logPath+'/'+new Date().getHours().toString() + '_devState', wData)
    });
  });

  req.on('error', function (e) {
    fileutil.endWrite(logPath+'/'+new Date().getHours().toString() + '_devState', 'problem with devState request:'+ e.message)
  });

// write data to request body
  req.write(postData);
  req.end();

  var logData='\r\n'+dateutil.timeToStr(new Date(),':')+ ' http://'+process.env.EMTCIP+':'+process.env.EMTCPORT+postPath+':\r\n'+postData
  fileutil.endWrite(logPath+'/'+new Date().getHours().toString() + '_devState',logData);
}


plugin.sendTestResult_script=function(value) {
  console.log('-----------enter sendTestResult_script:')
  var logPath = pathutil.root('log') + '/' + dateutil.dateToStr(new Date());
  console.log('------------------------logPath:', logPath)
  /*var value= {
   error: {},//错误对象
   total: 1,//脚本总数
   fail: 0,//执行失败的脚本数
   tasklogurl: 'log/20170113/',//日志文件
   taskperformanceurl: 'performance/20170113/',//性能文件
   images:'capture/20170113',//截图路径
   serial: '123456',//设备序列号
   task_id:'1',//任务ID
   reportcontent:'content text'//,结果描述,富文本
   }*/
  var postData = JSON.stringify(value);
  var options = {
    hostname: process.env.EMTCIP,//
    port: process.env.EMTCPORT,
    path: postPath.tasksubmit,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',//application/json,application/x-www-form-urlencoded
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  var req = http.request(options, function (res) {
    var body = '';
    res.on('data', function (chunk) {
      body += chunk;
    });
    res.on('end', function () {
      var logData = '\r\n' + dateutil.timeToStr(new Date(), ':') + ' http://' + process.env.EMTCIP + ':' + process.env.EMTCPORT + postPath.tasksubmit + 'RESPONSE,' + body + '\r\n'
      fileutil.endWrite(logPath + '/' + new Date().getHours().toString(), logData)
    });
  });

  req.on('error', function (e) {
    fileutil.endWrite(logPath + '/' + new Date().getHours().toString(), 'problem with sendTestResult_script request:' + e.message)
  });

  req.write(postData);
  req.end();

  var logData = '\r\n' + dateutil.timeToStr(new Date(), ':') + ' http://' + process.env.EMTCIP + ':' + process.env.EMTCPORT + postPath.tasksubmit + '，' + postData+'\r\n'
  fileutil.endWrite(logPath + '/' + new Date().getHours().toString(), logData)
}


var scriptType = {
  python: 'py',
  ruby: 'rb',
  php: 'php',
  nodejs: 'js'
}
plugin.scriptType=scriptType;

module.exports= plugin;
