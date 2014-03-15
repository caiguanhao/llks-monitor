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
    if (!id || !token) return;
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
  '$filter',
  function($scope, Accounts, Users, $window, $filter) {

  $scope.name = null;
  $scope.code = null;

  Accounts.Get().then(function(response) {
    $scope.accounts = response.data;
  });

  var allMiners = {};

  function updateAllMiners() {
    var miners = [];
    for (var miner in allMiners) {
      var account = $filter('filter')($scope.accounts || [],
        { _id: miner }, true)[0];
      if (!account) continue;
      if (allMiners[miner].error) {
        account.updated = false;
        continue;
      }
      account.updated = allMiners[miner].updated;
      allMiners[miner].miners.map(function(s) { s.account = account.name; });
      miners = miners.concat(allMiners[miner].miners);
    }
    $scope.miners = miners;
    if (!$scope.$$phase) $scope.$apply();
  }

  if (Users.Socket) {
    Users.Socket.on('update', function(data) {
      angular.extend(allMiners, data);
      updateAllMiners();
    });
    Users.Socket.on('updateAccount', function(data) {
      for (var accountId in data) {
        var account = $filter('filter')($scope.accounts || [],
          { _id: accountId }, true)[0];
        if (!account) continue;
        angular.extend(account, data[accountId]);
      }
    });
    Users.Socket.on('error', function(reason) {
      if (reason === 'handshake unauthorized') {
        return Accounts.PermissionDenied();
      }
    });
  }

  $scope.fsort = function(by) {
    $scope.sort(function(item) {
      return parseFloat(item[by]);
    }, by);
  };
  var lastByStr;
  $scope.sort = function(by, byStr) {
    if (!byStr && typeof by === 'string') byStr = by;
    if (lastByStr === byStr) {
      $scope.mOrderReverse = !$scope.mOrderReverse;
    } else {
      $scope.mOrderReverse = true;
    }
    $scope.mOrder = by;
    lastByStr = byStr;
  };
  $scope.speedCompare = function(item) {
    if (!item) return 0;
    if (!item.speed) return 0;
    var times = item.speed.indexOf('M/S') !== -1 ? 1024 : 1;
    var speed = parseFloat(item.speed)
    speed = isNaN(speed) ? 0 : (speed * times);
    if (item.status !== '在线') speed -= 1024 * 1024;
    return speed;
  };
  $scope.sort($scope.speedCompare, 'speed');

  $scope.speedBg = function(item) {
    if (!item || item.status !== '在线') return 'active';
    if (!item.speed) return '';
    var times = item.speed.indexOf('M/S') !== -1 ? 1024 : 1;
    var speed = parseFloat(item.speed);
    if (isNaN(speed)) return 'danger';
    speed = speed * times;
    if (speed >= 1024) return 'success';
    if (speed >= 512) return 'warning';
    return 'danger';
  };

  $scope.create = function() {
    Accounts.Create($scope.name, $scope.code).then(function(response) {
      $scope.name = null;
      $scope.code = null;
      var account = response.data;
      $scope.accounts.push(account);
    }).catch(function(response) {
      if (response.status === 403) {
        alert('Permission denied.');
        return Accounts.PermissionDenied();
      }
      alert(response.data.error || 'Unknown Error.');
    });
  };
  $scope.updateName = function(account) {
    var newName = $window.prompt('Enter new name:', account.name);
    if (!newName || newName === account.name) return;
    Accounts.Modify(account._id, { name: newName }).then(function(response) {
      account.name = newName;
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
    if (!$window.confirm('Are you sure you want to delete this account?')) {
      return;
    }
    var id = accounts[index]._id;
    Accounts.Delete(id).then(function(response) {
      accounts.splice(index, 1);
      delete allMiners[id];
      updateAllMiners();
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
