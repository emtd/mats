/**
 * Created by mat on 17-3-8.
 */
var path=require('path');
module.exports = function() {
  process.env.SCREEN_JPEG_QUALITY=16;
  process.env.SECRET='iqvcbGdX9wLJwfrMsxrjTfncmDfPoBKz';//iqvcbGdX9wLJwfrMsxrjTfncmDfPoBKz,kute kittykat

  process.env.dataPath=path.resolve(__dirname,'../../data');//pathutil.root('data')
  process.env.logName='log';//记录日志的文件夹名称
  process.env.perName='performance';//记录性能数据的文件夹名称
  process.env.capName='screenCapture';//记录截图的文件夹名称
  process.env.autoCapName='autoCapture';//自动化脚本截图文件夹名称
  process.env.uploadFilePath=path.resolve(__dirname,'../../uploadfile');//pathutil.root('uploadfile')
  process.env.devLogName='devLog';

  process.env.emtcUserName='emtc@pactera.com';

  process.env.EMTCIP='10.12.32.201';//10.12.32.201
  process.env.EMTCPORT=8881;
  process.env.EMTCTIMEOUT=900;////Infinity,Number.POSITIVE_INFINITY

  process.env.writeLogRate=200;//每个这隔10s,写入一次日志和性能
  process.env.perRate=2000;//每隔2s采集性能,每隔10s写入文件.

  process.env.recodeRate=10000;//emtcservice写日志,每隔10s写一次,
}();