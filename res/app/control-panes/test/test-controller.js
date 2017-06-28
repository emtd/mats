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

  $scope.keyPoint = function (){
    $scope.control.keyPoint().then(function(data){
      console.log('keyPoint')
    });
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
      console.log('send debug.appui')
      $scope.msgWS.emit('debug.appui');
    }
    $scope.msgWS.on('debug.appui', function (data) {
      console.log('receive debug.appui')
      genData(data)
    })
    $scope.debugStart = function () {
      $scope.msgWS.emit('debug.start');
    }

    $scope.debugStop = function () {
      $scope.msgWS.emit('debug.stop');
    }

    $scope.getAppUIEnd = function () {
      $scope.msgWS.emit('screenshot.end');
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

    $scope.msgWS.on('image.match.return', function (data) {
      console.log('image.match.return')
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
        var img=subnailImage(crop,'png')
        // window.setTimeout(function(){
        //   console.error('请求回来好几次了呢！！！！')
        //   crop.src = img;
        // },2000)
        console.error('请求回来好几次了呢！！！！')


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

        var scontent=`#coding=utf-8
import unittest
import time
from appium import webdriver
from appium.webdriver.common.touch_action import TouchAction
from selenium.common.exceptions import WebDriverException
from selenium.common.exceptions import NoSuchElementException
import sys
import os
# from selenium import webdriver
from selenium.webdriver import Chrome
from selenium.webdriver.chrome.options import Options

class Browser(unittest.TestCase):
    def setUp(self):
        desired_caps = {}
        desired_caps['platformName'] = 'Android'
        desired_caps['deviceName'] = 'DEVNAME'
        # desired_caps['appPackage'] = 'com.android.chrome'
        # desired_caps['appActivity'] = '.org.chromium.chrome.browser.document.DocumentActivity'
        desired_caps['browserName']='Chrome'
        desired_caps['platformVersion'] = os.environ['VERSION']
        desired_caps['udid'] = os.environ['UDID']##'RO5PBM5LQWJZDQCM'
        self.driver = webdriver.Remote('http://localhost:' + os.environ['APPIUMPORT'] + '/wd/hub', desired_caps)

    def test_add_function(self):
        self.driver.implicitly_wait(2)
        self.driver.get('http://www.baidu.com')
        time.sleep(2)
        # self.driver.press_keycode(169)
        # self.driver.zoom(None, 100,2)
        try:
            self.driver.find_element_by_xpath('//*[@id="logo"]/img').is_displayed()
            print('进入百度页面成功')
        except NoSuchElementException:
            print('进入百度页面失败')
            #assert 1==0
        self.driver.find_element_by_xpath('//*[@id="login"]').click()
        time.sleep(2)
        self.driver.find_element_by_xpath('//*[@id="page-bd"]/section[1]/div[2]/a').click()
        time.sleep(2)
        account=self.driver.find_element_by_xpath('//*[@id="login-username"]')
        account.send_keys('15295432710')
        time.sleep(2)
        password=self.driver.find_element_by_xpath('//*[@id="login-password"]')
        password.send_keys('jyj941223')
        time.sleep(2)
        self.driver.find_element_by_xpath('//*[@id="login-formWrapper"]/p[5]').click()
        time.sleep(2)
        try:
            self.driver.find_element_by_xpath('//*[@id="page-bd"]/section[1]/div[2]').is_displayed()
            print('登录成功')
        except NoSuchElementException:
            print('登录失败')
        time.sleep(2)
        self.driver.back()
        time.sleep(2)
        self.driver.back()
        time.sleep(2)
        comment=self.driver.find_element_by_xpath('//*[@id="index-kw"]')
        comment.send_keys('淘宝')
        time.sleep(2)
        self.driver.find_element_by_xpath('//*[@id="index-bn"]').click()
        time.sleep(2)
        try:
            self.driver.find_element_by_xpath('//*[@id="page"]/div[1]/div/div/div/a[1]').is_displayed()
            print('搜索淘宝成功')
        except NoSuchElementException:
            print('搜索淘宝失败')

if __name__ == '__main__':
    suite = unittest.TestLoader().loadTestsFromTestCase(Browser)
    unittest.TextTestRunner(verbosity=2).run(suite)`





        /*var scontent = "# coding=utf-8\r\n\
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
desired_caps = {}\r\n\
desired_caps['platformName'] = 'Android'\r\n\
desired_caps['platformVersion'] = os.environ['VERSION']\r\n\
desired_caps['deviceName'] = 'ZTE BV0720'\r\n\
desired_caps['appPackage'] = 'com.cmcc.wallet'\r\n\
desired_caps['appActivity'] = 'com.cmcc.wallet.LoadingActivity'\r\n\
desired_caps['udid'] = os.environ['UDID']\r\n\
self.driver = webdriver.Remote('http://localhost:'+os.environ['APPIUMPORT']+'/wd/hub', desired_caps)\r\n\
\
time.sleep(2)\r\n\
print('Have enter')\r\n\
time.sleep(5)\r\n\
print('Have enter')\r\n\
time.sleep(2)\r\n\
\
#if __name__ == '__main__':\r\n\
    #suite = unittest.TestLoader().loadTestsFromTestCase(CaculatorTests)\r\n\
    #unittest.TextTestRunner(verbosity=2).run(suite)\r\n"*/
        //console.log(scontent)
        var imgdata=crop.src;
console.log('send debug.start')
        $scope.msgWS.emit('debug.start',{img:[{name:'test.jpg',data:img.replace(/^data:image\/\w+;base64,/,"")}],script:{name:'test.py',data:scontent},env:{env1:'a',env2:'b'}});
        /*$scope.msgWS.emit('image.match',{
          name:'test.png',
          data:img,
          region:null
        });*/

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
/*  var socket0 = io('http://192.168.27.65:20000', {
    reconnection: false, transports: ['websocket']
  })
  socket0.on('connect',function(){
    setInterval(function(){
      socket0.emit('io','ioie')
    },1000)
  })*/

}

