module.exports = function testCtrl($scope) {
  $scope.testImg = '';
  $scope.getFile = function (){
    $scope.control.getAppUI().then(function(data){
      console.log(data)
      $scope.testImg='data:image/png;base64,'+data.body.img;
    })
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
    $scope.control.fspull('/data/local/tmp');
  }
  $scope.resScreen = function(flag){
    console.log(flag)
    $scope.control.resScreen(flag);
  }
  
}

