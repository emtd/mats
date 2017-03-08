var plugin={};

var postPath={
  occupyDevice:'/emtc/user/devices/occupy',
  releaseDevice:'/emtc/user/devices/release',
  //getDeviceInfo:'/emtc/device',//获取单个设备的信息
  //getDeviceList:'/emtc/deviceList',//获取多个设备的信息,参数必须为数组
  getDevices:'/emtc/devices',//
  getDevState:'/emtc/device/state',//获取指定设备的状态
  scriptRun:'/emtc/scriptRun',
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

module.exports= plugin;