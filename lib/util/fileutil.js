/**
 * Created by mat on 16-12-7.
 */
var path = require('path')
var fs = require('graceful-fs')
var Promise=require('bluebird')

var plugin={};
//var filePro=child.fork(__dirname+'/filewrite.js')
var fileList={}
function mkdir(target) {
  return new Promise(function (resolve, reject) {
    var flag = fs.existsSync(target);
    if (!flag) {
      fs.mkdir(target, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve();
        }
      })
    }
    else {
      resolve()
    }
  })
}

//check dir wheather exist and create not exist
plugin.mkdirs=function(target) {
  return new Promise(function (resolve, reject) {
    if (typeof(target) != 'string') {
      reject('target dir must be a string!')
    }
    //去掉空格
    var tempdir=target.replace(/\s+/g, '');
    if(fs.existsSync(tempdir)){
      resolve();
      return;
    }
    //转成数组
    var dirs = tempdir.split('/')

    if (Object.prototype.toString.call(dirs).indexOf('Array') == -1) {
      reject('dirs should be a type of array,but it is not')
    }
    var path = ''
    var i = 0, length = dirs.length;
    createDir(0)
    //根据数组递归创建路径
    function createDir(i) {
      if (i >= length) {
        resolve();
        return;
      }
      //自动忽略空格路径
      if (/\s/.test(dirs[i])) {
        crateDir(++i)
      }
      path = path + '/' + dirs[i];
      if (fs.existsSync(path)) {
        if (i < length) {
          createDir(++i)
        }
      } else {
        mkdir(path)
          .then(function () {
            if (i < length) {
              createDir(++i)
            }
          })
          .catch(function (err) {
            reject('make dir error:', err)
          })
      }
    }

  })
}

//write data in target/dilename
plugin.writeFile=function(target,filename,data){
 return new Promise(function(resolve,reject){
    fs.appendFile(target+'/'+filename,data,function(err){
      if(err){
        reject(err);
      }else{
        resolve()
      }
    })
  })
}

plugin.pushQueue=function(path,data) {
  if(typeof(path)!='string'){
    console.error('path must be a string')
    return;
  }
  //路径必须是绝对路径
  if (path[0] != '/') {
    console.error('dir must be absolute')
    return;
  }
  var dir = path.substring(0, path.lastIndexOf('/'))
  if (fileList[path] == null) {
    fileList[path] = [];
    if (!fs.existsSync(dir)) {
      plugin.mkdirs(dir);
    }
  }
  fileList[path].push(data);
  if (fs.existsSync(dir)) {
    check();
  }
}

//结束写文件,把剩余的写入文件后,销毁fileList对象.
plugin.endWrite=function(path,data){
  if(typeof(path)!='string'){
    console.error('path must be a string')
    return;
  }
  var mkdirs;
  var dir=path.substring(0,path.lastIndexOf('/'));
  if(!fs.existsSync(dir)){
    mkdirs=plugin.mkdirs(dir)
  }
  if(data!=null){
    if(fileList[path]==null){
      fileList[path]=[]
    }
    fileList[path].push(data);
  }
  if(mkdirs!=null){
    mkdirs.then(function(){
      consume(path)
      delete fileList[path]
    })
  }else{//目录已经存在
    consume(path)
    delete fileList[path]
  }
}

function check(){
  Object.keys(fileList).map(function(item){
    if(fileList[item].length>Number(process.env.writeLogRate)){
      consume(item);
    }
  })
}

function consume(path){
  if(fileList[path]==null){
    console.error('fileList[\''+path+'\'] is null or undefined')
    return;
  }
  fs.appendFile(path,fileList[path].splice(0,fileList[path].length).join(''))
}

plugin.rmFilesByPath=function(dir) {
  return new Promise(function (resolve, reject) {
    if (fs.existsSync(dir)) {
      fs.readdir(dir, function (err, files) {
        if (files.length > 0) {
          var list = [];
          files.forEach(function (item) {
            list.push(fs.unlink(dir+'/'+item))
          })
          Promise.all(list)
            .then(function(){
              resolve()
            })
            .catch(function(err){
              reject(err)
            })
        } else {
          resolve()
        }
      })
    } else {
      resolve()
    }
  })
}

module.exports=plugin;
