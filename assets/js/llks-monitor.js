var llksMonitor = angular.module('llksMonitor', [ 'ngRoute' ]).

config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
  $routeProvider.
  when('/', {
    templateUrl: 'main',
    controller: 'MainController'
  }).
  when('/login', {
    templateUrl: 'login',
    controller: 'LoginController'
  }).
  otherwise({
    title: '404 Page Not Found',
    templateUrl: '_404'
  });
  $locationProvider.html5Mode(false);
}]).

directive('body', [function() {
  return {
    restrict: 'E',
    templateUrl: 'index'
  };
}]).

service('Users', ['$http', function($http) {
  this.Authenticate = function(user, pass) {
    return $http.post('/login', { username: user, password: pass });
  };
}]).

controller('MainController', [function() {

}]).

controller('LoginController', ['$scope', 'Users', '$timeout',
  function($scope, Users, $timeout) {
  $scope.statusClass = 'info';
  $scope.shouldLoginDisable = function() {
    if ($scope.status === 'loading') return true;
    if ($scope.username && $scope.password) return false;
    return true;
  }

  $scope.login = function() {
    $scope.statusClass = 'info';
    $scope.status = 'loading';
    Users.Authenticate($scope.username, $scope.password).
    then(function(response) {
      $scope.username = null;
      $scope.password = null;
      $scope.statusClass = 'success';
      $scope.status = 'success';
      console.log(response.data.token)
    }, function(response) {
      $timeout(function() {
        $scope.statusClass = 'danger';
        $scope.status = response.data.error || 'Unknown Error.';
      }, 1000);
    });
  };
}]).

run([function() {
  // end
}]);
