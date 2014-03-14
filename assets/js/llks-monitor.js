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

run(['Users', function(Users) {
  Users.Init();
}]).

directive('body', [function() {
  return {
    restrict: 'E',
    templateUrl: 'index'
  };
}]).

service('Accounts', ['$http', 'Users', function($http, Users) {
  this.save = function() {
    return $http.post('/accounts');
  };
}]).

service('Users', ['$http', '$window', '$rootScope', '$route',
  function($http, $window, $rootScope, $route) {
  function ls(key, val) {
    if (val === undefined) return $window.localStorage[key];
    if (val === null) {
      delete $window.localStorage[key];
    } else {
      $window.localStorage[key] = val;
    }
  }
  this.Authenticate = function(user, pass) {
    return $http.post('/login', { username: user, password: pass });
  };
  this.Init = function() {
    this.GetUser();
    var self = this;
    $rootScope.logout = function() {
      self.SetUser(null, null, null);
      $route.reload();
    };
  };
  this.GetUser = function() {
    var id = ls('llksMonitor.user.id');
    var username = ls('llksMonitor.user.username');
    var token = ls('llksMonitor.user.token');
    $rootScope.User = {
      Id: id,
      Username: username,
      Token: token
    };
    $http.defaults.headers.common['x-user-id'] = id;
    $http.defaults.headers.common['x-user-token'] = token;
  };
  this.SetUser = function(id, username, token) {
    ls('llksMonitor.user.id', id);
    ls('llksMonitor.user.username', username);
    ls('llksMonitor.user.token', token);
    this.GetUser();
  };
}]).

controller('MainController', ['Accounts', function(Accounts) {
  Accounts.save();
}]).

controller('LoginController', ['$scope', 'Users', '$timeout',
  function($scope, Users, $timeout) {
  $scope.username = null;
  $scope.password = null;

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
      $timeout(function() {
        $scope.username = null;
        $scope.password = null;
        $scope.statusClass = 'success';
        $scope.status = 'success';
        var data = response.data;
        Users.SetUser(data.id, data.username, data.token);
      }, 1000);
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
