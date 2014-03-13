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

controller('MainController', [function() {

}]).

controller('LoginController', ['$scope', function($scope) {

}]).

run([function() {
  // end
}]);
