module.exports = function DashboardCtrl($scope) {
  console.log('dashboard')
  $scope.fspull = function (){
    debugger
    $scope.control.fspull('/data/local/tmp');
    console.log('dashboard-----------')
  }
}
