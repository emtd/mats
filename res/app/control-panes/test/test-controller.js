var io = require('socket.io')

module.exports = function testCtrl($scope,$http,$rootScope) {
  $scope.testImg = '';
  var crop = document.getElementById('crop');
  $scope.getFile = function (){
    $scope.msgWS.emit('debug.appui',{})
  }

  function getFile(){
    $http.get('/s/download/debug/703/'+$scope.device.serial+'/appui')
      .success(function(data){
        genData(data);
      })
    /* $scope.control.getAppUI().then(function(data) {
     genData(data)
     })*/

    function genData(data){
      console.log(data)
      crop.src = 'data:image/png;base64,' + data.data.img;

      var url = 'http://localhost:7100/s/upload/debug/703/'+$scope.device.serial+'/';
      crop.onload = function () {
        console.log(1)
        var canvas = document.createElement('CANVAS'),
          ctx = canvas.getContext('2d');
        canvas.height = crop.height;
        canvas.width = crop.width;
        console.log(canvas.height, canvas.width);
        ctx.drawImage(crop, 0, 0);
        var formData = new FormData();
        var scontent = "# coding=utf-8\r\n\
import unittest\r\n\
import time\r\n\
from appium import webdriver\r\n\
from appium.webdriver.common.touch_action import TouchAction\r\n\
from selenium.common.exceptions import WebDriverException\r\n\
from selenium.common.exceptions import NoSuchElementException\r\n\
import sys\r\n\
import os\r\n\
\
class CaculatorTests(unittest.TestCase):\r\n\
    def setUp(self):\r\n\
        desired_caps = {}\r\n\
        desired_caps['platformName'] = 'Android'\r\n\
        desired_caps['platformVersion'] = os.environ['VERSION']\r\n\
        desired_caps['deviceName'] = 'ZTE BV0720'\r\n\
        desired_caps['appPackage'] = 'com.cmcc.wallet'\r\n\
        desired_caps['appActivity'] = 'com.cmcc.wallet.LoadingActivity'\r\n\
        desired_caps['udid'] = os.environ['UDID']\r\n\
        self.driver = webdriver.Remote('http://localhost:'+os.environ['APPIUMPORT']+'/wd/hub', desired_caps)\r\n\
\
    def test_add_function(self):\r\n\
        self.driver.implicitly_wait(10)\r\n\
        time.sleep(2)\r\n\
        print('Have enter')\r\n\
        time.sleep(5)\r\n\
        self.driver.back()\r\n\
        time.sleep(2)\r\n\
        self.driver.back()\r\n\
        self.driver.back()\r\n\
\
if __name__ == '__main__':\r\n\
    suite = unittest.TestLoader().loadTestsFromTestCase(CaculatorTests)\r\n\
    unittest.TextTestRunner(verbosity=2).run(suite)\r\n"
        console.log(scontent)

        function dataURLtoBlob(dataurl) {
          var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
          while(n--){
            u8arr[n] = bstr.charCodeAt(n);
          }
          return new Blob([u8arr], {type:mime});
        }
        var txt=new Blob([scontent],{type:"text/plain"})
        var img=dataURLtoBlob(canvas.toDataURL('image/jpeg', 1))
        formData.append('test.py',txt)
        formData.append('test.jpg',img)
        formData.append('env',JSON.stringify([{env1:'1'},{env2:'2'}]))
        $http({
          method: 'POST',
          url: url,
          data: formData,//params,
          headers: {'Content-Type': undefined},//undefined
          transformRequest: angular.identity
        }).success(function (res) {
          var ws = new WebSocket($scope.device.msgWSUrl)
          ws.binaryType = 'blob'

          ws.onerror = function errorListener() {
            // @todo Handle
          }

          ws.onclose = function closeListener() {
            // @todo Maybe handle
          }

          ws.onopen = function openListener() {
            var data={
              type:'debug',
              data:'703'
            }
            ws.send(JSON.stringify(data));
            console.log('send debug')
          }
          ws.onmessage = function(message) {
            console.log(message.data)
          }
        })
      }
    }

    function subnailImage(source,type) {
      var width = source.width;
      var height = source.height;
      var canvas = document.createElement('canvas');
      var context = canvas.getContext('2d');

      // draw image params
      var sx = 0;
      var sy = 0;
      var sWidth = width;
      var sHeight = height;
      var dx = 0;
      var dy = 0;
      var dWidth = width;
      var dHeight = height;
      var quality = 1;

      canvas.width = width;
      canvas.height = height;

      context.drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);

      var dataUrl = canvas.toDataURL('image/'+type, quality);
      return dataUrl;
    }

    /*$http.get(url)
     .then(function(data){
     console.log(data.data)
     //console.log(data.data.constructor.name)
     //var blob=new Blob([data.data],{type:"image/png"});
     //console.log('blob:',blob);
     //var source = window.URL.createObjectURL(blob);
     //$scope.testImg='data:image/png;base64,'+data.data;
     // var fileReader = new FileReader();
     // fileReader.readAsArrayBuffer(data.data);
     })
     .catch(function(e){console.log(e)})*/
  }

  $scope.fspull = function (){
    debugger
    $scope.control.fspull('/data/local/tmp','150508');
  }
  $scope.resScreen = function(flag){
    console.log(flag)
    $scope.control.resScreen(flag);
  }

  $scope.scriptDebug = function(){
    //$scope.control.scriptDebug('703');

  }

  /*websocket*/
  $scope.$on('msgWS',function() {
    console.log($scope.device.msgWSUrl)
    var socket = $scope.msgWS = io($scope.device.msgWSUrl, {
      reconnection: false, transports: ['websocket'], user: {email: 703, name: 703}
    })

    socket.scoped = function ($scope) {
      var listeners = []

      $scope.$on('$destroy', function () {
        listeners.forEach(function (listener) {
          socket.removeListener(listener.event, listener.handler)
        })
      })

      return {
        on: function (event, handler) {
          listeners.push({
            event: event, handler: handler
          })
          socket.on(event, handler)
          return this
        }
      }
    }
    $scope.msgWS.scoped($scope);

    $scope.msgWS.on('socket.ip', function (ip) {
      $rootScope.$apply(function () {
        $scope.msgWS.ip = ip
      })
    })
    $scope.getAppUI = function () {
      $scope.msgWS.emit('debug.appui');
    }
    $scope.msgWS.on('debug.appui', function (data) {
      genData(data)
    })
    $scope.debugStart = function () {
      $scope.msgWS.emit('debug.start');
    }

    $scope.debugStop = function () {
      $scope.msgWS.emit('debug.stop');
    }

    $scope.msgWS.on('debug.log', function (data) {
      //console.log(data)
    })

    $scope.msgWS.on('debug.stop.return', function (data) {
      console.log('debug.stop.return',data)
    })

    $scope.msgWS.on('debug.start.return', function (data) {
      console.log(data)
    })

    function genData(data){
      console.log(data)
      crop.src = 'data:image/png;base64,' + data.img;

      //var url = 'http://localhost:7100/s/upload/debug/703/'+$scope.device.serial+'/';
      crop.onload = function () {
        console.log(1)
        var canvas = document.createElement('CANVAS'),
          ctx = canvas.getContext('2d');
        canvas.height = crop.height;
        canvas.width = crop.width;
        console.log(canvas.height, canvas.width);
        ctx.drawImage(crop, 0, 0);
        var img=subnailImage(crop,'jpeg')

        function subnailImage(source,type) {
          var width = source.width;
          var height = source.height;
          var canvas = document.createElement('canvas');
          var context = canvas.getContext('2d');

          // draw image params
          var sx = 0;
          var sy = 0;
          var sWidth = width;
          var sHeight = height;
          var dx = 0;
          var dy = 0;
          var dWidth = width*2;
          var dHeight = height*2;
          var quality = 1;

          canvas.width = width;
          canvas.height = height;

          context.drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);

          var dataUrl = canvas.toDataURL('image/'+type, quality);
          return dataUrl;
        }

        //var formData = new FormData();
        var scontent = "# coding=utf-8\r\n\
import unittest\r\n\
import time\r\n\
from appium import webdriver\r\n\
from appium.webdriver.common.touch_action import TouchAction\r\n\
from selenium.common.exceptions import WebDriverException\r\n\
from selenium.common.exceptions import NoSuchElementException\r\n\
import sys\r\n\
import os\r\n\
#import image_process as ip\
\
class CaculatorTests(unittest.TestCase):\r\n\
    def setUp(self):\r\n\
        desired_caps = {}\r\n\
        desired_caps['platformName'] = 'Android'\r\n\
        desired_caps['platformVersion'] = os.environ['VERSION']\r\n\
        desired_caps['deviceName'] = 'ZTE BV0720'\r\n\
        desired_caps['appPackage'] = 'com.cmcc.wallet'\r\n\
        desired_caps['appActivity'] = 'com.cmcc.wallet.LoadingActivity'\r\n\
        desired_caps['udid'] = os.environ['UDID']\r\n\
        self.driver = webdriver.Remote('http://localhost:'+os.environ['APPIUMPORT']+'/wd/hub', desired_caps)\r\n\
\
    #print ip.tap_element_by_image(driver, 'button.jpg')\
    #def test_add_function(self):\r\n\
        #self.driver.implicitly_wait(10)\r\n\
        #time.sleep(2)\r\n\
        #print('Have enter')\r\n\
        #time.sleep(5)\r\n\
        #self.driver.back()\r\n\
        #time.sleep(2)\r\n\
        #self.driver.back()\r\n\
        #self.driver.back()\r\n\
\
#if __name__ == '__main__':\r\n\
    #suite = unittest.TestLoader().loadTestsFromTestCase(CaculatorTests)\r\n\
    #unittest.TextTestRunner(verbosity=2).run(suite)\r\n"
        //console.log(scontent)
        var imgdata=crop.src;
        $scope.msgWS.emit('debug.start',{img:[{name:'test.jpg',data:img.replace(/^data:image\/\w+;base64,/,"")}],script:{name:'test.py',data:scontent},env:{env1:'a',env2:'b'}});

        /*function dataURLtoBlob(dataurl) {
          var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
          while(n--){
            u8arr[n] = bstr.charCodeAt(n);
          }
          return new Blob([u8arr], {type:mime});
        }
        var txt=new Blob([scontent],{type:"text/plain"})
        var img=dataURLtoBlob(canvas.toDataURL('image/jpeg', 1))
        formData.append('test.py',txt)
        formData.append('test.jpg',img)
        formData.append('env',JSON.stringify([{env1:'1'},{env2:'2'}]))
        $http({
          method: 'POST',
          url: url,
          data: formData,//params,
          headers: {'Content-Type': undefined},//undefined
          transformRequest: angular.identity
        }).success(function (res) {
          var ws = new WebSocket($scope.device.msgWSUrl)
          ws.binaryType = 'blob'

          ws.onerror = function errorListener() {
            // @todo Handle
          }

          ws.onclose = function closeListener() {
            // @todo Maybe handle
          }

          ws.onopen = function openListener() {
            var data={
              type:'debug',
              data:'703'
            }
            ws.send(JSON.stringify(data));
            console.log('send debug')
          }
          ws.onmessage = function(message) {
            console.log(message.data)
          }
        })*/
      }
    }
  })

  //脚本调试最终生成的截图请求:get /s/download/debug/:user/:serial/capture
  //脚本调试时,获取image和xml,appui get /s/download/debug/:user/:serial/appui

  
}

