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

directive('secondsAgo', ['$interval', function($interval) {
  return {
    scope: {
      seconds: '=secondsAgo',
      to: '=secondsAgoTo'
    },
    link: function($scope, elem, attrs) {
      var interval;
      $scope.$watch('seconds', function(val) {
        if (!val) return;
        $interval.cancel(interval);
        interval = $interval(function() {
          var diff = Math.round((+new Date - $scope.seconds) / 1000);
          $scope.to = diff;
        }, 1000);
      });
      $scope.$on('$destroy', function(e) {
        console.log(interval)
        $interval.cancel(interval);
      });
    }
  };
}]).

service('Accounts', ['$http', 'Users', '$route',
  function($http, Users, $route) {
  this.PermissionDenied = function() {
    return Users.PermissionDenied();
  };
  this.Reload = function() {
    $route.reload();
  };
  this.Get = function(name, code) {
    return $http.get('/accounts');
  };
  this.Create = function(name, code) {
    return $http.post('/accounts', { name: name, code: code });
  };
  this.Modify = function(id, data) {
    return $http.put('/accounts/' + id, data);
  };
  this.Delete = function(id) {
    return $http.delete('/accounts/' + id);
  };
}]).

service('Users', ['$http', '$window', '$rootScope', '$route', '$location',
  function($http, $window, $rootScope, $route, $location) {
  function ls(key, val) {
    if (val === undefined) return $window.localStorage[key];
    if (val === null) {
      delete $window.localStorage[key];
    } else {
      $window.localStorage[key] = val;
    }
  }
  this.PermissionDenied = function() {
    return $location.path('/login');
  };
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
    this.Socket = io.connect(null, { query: 'id=' + id + '&token=' + token });
  };
  this.SetUser = function(id, username, token) {
    ls('llksMonitor.user.id', id);
    ls('llksMonitor.user.username', username);
    ls('llksMonitor.user.token', token);
    this.GetUser();
  };
}]).

controller('MainController', ['$scope', 'Accounts', 'Users', '$window',
  function($scope, Accounts, Users, $window) {
  $scope.name = null;
  $scope.code = null;

  Accounts.Get().then(function(response) {
    $scope.accounts = response.data;
  });

  Users.Socket.on('update', function(data) {
    var accounts = $scope.accounts || [];
    for (var i = 0; i < accounts.length; i++) {
      var account = accounts[i];
      if (!data.hasOwnProperty(account.code)) continue;
      var error = data[account.code].error;
      if (error && error === 'expired') {
        account.expired = true;
      } else {
        account.expired = false;
        angular.extend(account, data[account.code]);
      }
    }
    $scope.$apply();
  });
  Users.Socket.on('error', function(reason) {
    if (reason === 'handshake unauthorized') {
      return Accounts.PermissionDenied();
    }
  });

  $scope.create = function() {
    Accounts.Create($scope.name, $scope.code).then(function(response) {
      $scope.statusClass = 'success';
      $scope.status = 'success';
      $scope.name = null;
      $scope.code = null;
      Accounts.Reload();
    }).catch(function(response) {
      if (response.status === 403) {
        return Accounts.PermissionDenied();
      }
      $scope.statusClass = 'danger';
      $scope.status = response.data.error || 'Unknown Error.';
    });
  };
  $scope.updateCode = function(account) {
    var newCode = $window.prompt('Enter new code:', account.code);
    if (!newCode || newCode === account.code) return;
    Accounts.Modify(account._id, { code: newCode }).then(function(response) {
      account.code = newCode;
    });
  };
  $scope.delete = function(accounts, index) {
    Accounts.Delete(accounts[index]._id).then(function(response) {
      accounts.splice(index, 1);
    });
  };
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
