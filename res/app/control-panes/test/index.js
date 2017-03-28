module.exports = angular.module('stf.testoo', [
  require('stf/common-ui').name,
  require('gettext').name
])
  .run(['$templateCache', function($templateCache) {
    $templateCache.put('control-panes/test/test.pug',
      require('./test.pug')
    )
  }])
  .controller('testCtrl', require('./test-controller'))
