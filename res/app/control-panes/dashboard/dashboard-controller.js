module.exports = function DashboardCtrl($scope) {
  console.log('dashboard')
  $scope.fspull = function (){
    debugger
    $scope.control.fspull('/data/local/tmp');
    console.log('dashboard-----------')
  }
  $scope.resScreen = function(flag){
    console.log(flag)
    $scope.control.resScreen(flag);
  }
}
