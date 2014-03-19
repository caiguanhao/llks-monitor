var llksMonitor = angular.module('llksMonitor', [ 'ngRoute' ]).

config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
  $routeProvider.
  when('/', {
    templateUrl: 'main',
    controller: 'MainController'
  }).
  when('/history', {
    templateUrl: 'history',
    controller: 'HistoryController'
  }).
  when('/myaccount', {
    templateUrl: 'myaccount',
    controller: 'MyAccountController'
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

run(['Users', '$rootScope', 'I18N', function(Users, $rootScope, I18N) {
  Users.Init();

  $rootScope.CURRENTLANG = 'en';
  $rootScope.LANGS = {
    en: 'English',
    zh: '中文'
  };
  var userLang = Users.GetLang();
  if ($rootScope.LANGS.hasOwnProperty(userLang)) {
    $rootScope.CURRENTLANG = userLang;
  }
  $rootScope.setLang = function(code) {
    if ($rootScope.CURRENTLANG === code) return;
    $rootScope.CURRENTLANG = code;
    $rootScope.$broadcast('langChange', code);
    Users.SetLang(code);
  };
  $rootScope.i18n = function(string) {
    string = string.trim().replace(/[\n\s]{1,}/g, ' ');
    var code = $rootScope.CURRENTLANG;
    var lang = I18N[code] || {};
    var text = string.slice(string.lastIndexOf(':') + 1) || string;
    return lang[string] || text;
  };
  $rootScope.i18n$ = $rootScope.i18n;
}]).

directive('body', [function() {
  return {
    restrict: 'E',
    templateUrl: 'index'
  };
}]).

directive('close', [function() {
  return {
    link: function($scope, elem, attrs) {
      elem.on('click', function(e) {
        if (attrs.close.indexOf('navbar') !== -1) {
          $scope.navbar = false;
        }
        if (attrs.close.indexOf('dropdown') !== -1) {
          $scope.dropdown = false;
        }
        $scope.$apply();
      });
    }
  };
}]).

directive('navbarLink', ['$location', function($location) {
  return function($scope, elem, attrs) {
    $scope.$on('$routeChangeSuccess', function(event, current, previous) {
      var links = elem.find('a');
      if (links.length === 0) return;
      var href = links[0].getAttribute('href').replace(/^\/#!?/, '');
      var url = $location.url();
      if (url.substr(0, href.length) === href) {
        elem.addClass('active');
      } else {
        elem.removeClass('active');
      }
    });
  };
}]).

directive('i18n', ['I18N', function(I18N) {
  return {
    link: function($scope, elem, attrs) {
      var langChange = function(e, code) {
        var string = attrs.i18n.trim().replace(/[\n\s]{1,}/g, ' ');
        var lang = I18N[code] || {};
        var text = string.slice(string.lastIndexOf(':') + 1) || string;
        elem.text(lang[string] || text);
      };
      langChange(null, $scope.CURRENTLANG);
      $scope.$on('langChange', langChange);
    }
  };
}]).

directive('secondsAgo', ['$interval', function($interval) {
  return {
    scope: {
      secondsAgo: '='
    },
    link: function($scope, elem, attrs) {
      var interval;
      $scope.$watch('secondsAgo', function(val) {
        if (!val) return;
        $interval.cancel(interval);
        interval = $interval(function() {
          var diff = Math.round((+new Date - $scope.secondsAgo) / 1000);
          if (attrs.secondsAgoTemplate) {
            elem.text(attrs.secondsAgoTemplate.replace(/{}/g, diff));
          }
        }, 1000);
        elem.text(attrs.secondsAgoTemplate.replace(/{}/g, 0));
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
  // Deprecated:
  // this.Get = function(name, code) {
  //   return $http.get('/accounts');
  // };
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
    this.SetUser(null, null, null);
    return $location.path('/login');
  };
  this.Authenticate = function(user, pass) {
    return $http.post('/login', { username: user, password: pass });
  };
  this.GetMyInfo = function() {
    return $http.get('/my');
  };
  this.ChangePassword = function(oldPassword, newPassword) {
    return $http.put('/my', {
      oldpassword: oldPassword,
      newpassword: newPassword
    });
  };
  this.Init = function() {
    this.GetUser();
    var self = this;
    $rootScope.logout = function() {
      self.SetUser(null, null, null);
      self.Socket = null;
      $route.reload();
    };
  };
  this.GetLang = function() {
    var lang = ls('llksMonitor.user.lang');
    $http.defaults.headers.common['x-user-lang'] = lang;
    return lang;
  };
  this.SetLang = function(code) {
    ls('llksMonitor.user.lang', code);
    this.GetLang();
  };
  this.GetHistoryRange = function() {
    return ls('llksMonitor.user.historyrange');
  };
  this.SetHistoryRange = function(range) {
    ls('llksMonitor.user.historyrange', range);
  };
  this.GetHiddenAccounts = function() {
    var acc = [];
    try {
      var _acc = angular.fromJson(ls('llksMonitor.user.hiddenaccounts'));
      if (_acc instanceof Array) acc = _acc;
    } catch(e) {}
    return acc;
  };
  this.SetHiddenAccounts = function(acc) {
    ls('llksMonitor.user.hiddenaccounts', angular.toJson(acc));
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
    var query = 'id=' + id + '&token=' + token;
    if (this.Socket) {
      // if it is going to reconnect, update query object
      // since it won't update automatically
      this.Socket.socket.options.query = query;
    }
    this.Socket = io.connect(null, {
      'query': query,
      'force new connection': true,
      'reconnect': true,
      'reconnection delay': 1000,
      'reconnection limit': 5000,
      'max reconnection attempts': 10000
    });
  };
  this.SetUser = function(id, username, token) {
    ls('llksMonitor.user.id', id);
    ls('llksMonitor.user.username', username);
    ls('llksMonitor.user.token', token);
    this.GetUser();
  };
  this.Authenticated = function() {
    var id = ls('llksMonitor.user.id');
    var token = ls('llksMonitor.user.token');
    if (!id || !token) return;
    $location.path('/');
  };
  this.RequiresLogin = function() {
    var id = ls('llksMonitor.user.id');
    var token = ls('llksMonitor.user.token');
    if (!id || !token) {
      $location.path('/login');
      return false;
    };
    return true;
  }
}]).

controller('MainController', ['$scope', 'Accounts', 'Users', '$window',
  '$filter', 'ASSETS',
  function($scope, Accounts, Users, $window, $filter, ASSETS) {

  $scope.name = null;
  $scope.code = null;

  $scope.HiddenAccounts = Users.GetHiddenAccounts();
  $scope.isHidden = function(id) {
    var index = $scope.HiddenAccounts.indexOf(id);
    return index === -1;
  };
  $scope.toggleHidden = function(id) {
    var index = $scope.HiddenAccounts.indexOf(id);
    if (index === -1) {
      $scope.HiddenAccounts.push(id);
    } else {
      $scope.HiddenAccounts.splice(index, 1);
    }
    Users.SetHiddenAccounts($scope.HiddenAccounts);
    updateAllMiners();
  };

  var allMiners = {};

  function speedBg(item) {
    if (!item || item.status !== '在线') return 'active';
    if (!item.speed) return '';
    var times = item.speed.indexOf('M/S') !== -1 ? 1024 : 1;
    var speed = parseFloat(item.speed);
    if (isNaN(speed)) return 'danger';
    speed = speed * times;
    item.speednum = speed;
    if (speed >= 1024) return 'success';
    if (speed >= 512) return 'warning';
    return 'danger';
  };
  function updateAllMiners() {
    var miners = [];
    $scope.count = {
      danger: 0,
      warning: 0,
      active: 0,
      success: 0,
      total: 0,
      today: 0,
      yesterday: 0,
      speed: 0,
      online: 0
    };
    for (var miner in allMiners) {
      var account = $filter('filter')($scope.accounts || [],
        { _id: miner }, true)[0];
      if (!account) continue;
      var shouldIncludeAccountInList = false;
      if ($scope.HiddenAccounts.indexOf(account._id) === -1) {
        shouldIncludeAccountInList = true;
      }
      if (allMiners[miner].error) {
        account.updated = false;
        continue;
      }
      account.updated = allMiners[miner].updated;
      var accountTotalTotal = 0, accountTodayTotal = 0;
      var accountYesterdayTotal = 0, accountSpeedTotal = 0;
      var minersOnline = 0;

      allMiners[miner].miners.map(function(s) {
        s.bg = speedBg(s);
        if (shouldIncludeAccountInList) {
          s.account = account.name;
          $scope.count[s.bg] += 1;
          if (s.status === '在线') $scope.count.online += 1;
        }
        if (s.status === '在线') minersOnline += 1;
        if (s.speednum) accountSpeedTotal += s.speednum;
        accountTotalTotal += s.total;
        accountTodayTotal += s.today;
        accountYesterdayTotal += s.yesterday;
      });
      if (shouldIncludeAccountInList) {
        miners = miners.concat(allMiners[miner].miners);
        $scope.count.total += accountTotalTotal;
        $scope.count.today += accountTodayTotal;
        $scope.count.yesterday += accountYesterdayTotal;
        $scope.count.speed += accountSpeedTotal;
      }
      account.minersOnline = minersOnline;
      account.miners = allMiners[miner].miners.length;
      account.speed = +accountSpeedTotal;
      account.speedText = (account.speed / 1024).toFixed(3) + ' M/S';
      account.today = +accountTodayTotal.toFixed(5);
      account.yesterday = +accountYesterdayTotal.toFixed(5);
    }
    $scope.count.total = +$scope.count.total.toFixed(5);
    $scope.count.today = +$scope.count.today.toFixed(5);
    $scope.count.yesterday = +$scope.count.yesterday.toFixed(5);
    $scope.count.speed = ($scope.count.speed / 1024).toFixed(3) + ' M/S';
    $scope.miners = miners;
    if (!$scope.$$phase) $scope.$apply();
  }

  $scope.status = 'unknown';

  if (Users.Socket && Users.Socket.$events) {
    delete Users.Socket.$events;
  }
  if (Users.Socket) {
    Users.Socket.emit('GiveMeAccounts');
    Users.Socket.on('HereAreTheAccounts', function(accounts) {
      var accountIds = [], changed = false;
      accounts.map(function(account) {
        angular.extend(allMiners, angular.fromJson(account.data));
        delete account.data;
        accountIds.push(account._id);
      });

      // remove not existing
      for (var i = $scope.HiddenAccounts.length - 1; i >= 0; i--) {
        if (accountIds.indexOf($scope.HiddenAccounts[i]) === -1) {
          $scope.HiddenAccounts.splice(i, 1);
          changed = true;
        }
      }
      if (changed) Users.SetHiddenAccounts($scope.HiddenAccounts);

      $scope.accounts = accounts;
      updateAllMiners();
    });
    Users.Socket.on('UpdateMiners', function(data) {
      $scope.status = 'connected';
      angular.extend(allMiners, data);
      updateAllMiners();
    });
    Users.Socket.on('updateAccount', function(data) {
      $scope.status = 'connected';
      for (var accountId in data) {
        var account = $filter('filter')($scope.accounts || [],
          { _id: accountId }, true)[0];
        if (!account) continue;
        angular.extend(account, data[accountId]);
      }
    });
    Users.Socket.on('ServerHasUpdated', function(data) {
      if (typeof data !== 'object' || typeof ASSETS !== 'object') {
        return;
      }
      if (angular.equals(ASSETS, {})) return;
      if (angular.equals(data, {})) return;
      var assetsHasChanged = !angular.equals(data, ASSETS);
      if (assetsHasChanged) {
        $window.location.reload();
      }
    });
    Users.Socket.on('connect', function() {
      $scope.status = 'connected';
    });
    Users.Socket.on('disconnect', function() {
      $scope.status = 'disconnected';
      if (Users.Socket) Users.Socket.socket.reconnect();
    });
    Users.Socket.on('error', function(reason) {
      $scope.status = 'error';
      if (reason === 'handshake unauthorized') {
        return Accounts.PermissionDenied();
      }
    });
  }

  var listOfFieldsSortAlphabetically = [ 'name' ];

  var accountLastByStr;
  $scope.asort = function(by, byStr) {
    if (!byStr && typeof by === 'string') byStr = by;
    if (accountLastByStr === byStr) {
      $scope.aOrderReverse = !$scope.aOrderReverse;
    } else {
      $scope.aOrderReverse = (listOfFieldsSortAlphabetically.indexOf(by) < 0);
    }
    $scope.aOrder = by;
    accountLastByStr = byStr;
  };
  $scope.asort('name');

  var lastByStr;
  $scope.sort = function(by, byStr) {
    if (!byStr && typeof by === 'string') byStr = by;
    if (lastByStr === byStr) {
      $scope.mOrderReverse = !$scope.mOrderReverse;
    } else {
      $scope.mOrderReverse = (listOfFieldsSortAlphabetically.indexOf(by) < 0);
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

  $scope.unsoldWorth = function(account) {
    if (!account || !account.unsold) return 0;
    return Math.floor(account.unsold) * account.price;
  };

  $scope.create = function() {
    Accounts.Create($scope.name, $scope.code).then(function(response) {
      $scope.name = null;
      $scope.code = null;
      var account = response.data;
      $scope.accounts.push(account);
    }).catch(function(response) {
      if (response.status === 403) {
        alert($scope.i18n$('Permission denied.'));
        return Accounts.PermissionDenied();
      }
      alert(response.data.error || $scope.i18n$('Unknown Error.'));
    });
  };
  $scope.updateName = function(account) {
    var newName = $window.prompt($scope.i18n$('Enter new name:'), account.name);
    if (!newName || newName === account.name) return;
    Accounts.Modify(account._id, { name: newName }).then(function(response) {
      account.name = newName;
    });
  };
  $scope.updateCode = function(account) {
    var newCode = $window.prompt($scope.i18n$('Enter new code:'), account.code);
    if (!newCode || newCode === account.code) return;
    Accounts.Modify(account._id, { code: newCode }).then(function(response) {
      account.code = newCode;
    });
  };
  $scope.delete = function(accounts, index) {
    var account = accounts[index];
    if (account.updated !== false &&
      !$window.confirm($scope.i18n$('Are you sure you want to delete '+
        'this account?'))) {
      return;
    }
    var id = account._id;
    Accounts.Delete(id).then(function(response) {
      accounts.splice(index, 1);
      delete allMiners[id];
      updateAllMiners();
    });
  };
}]).

controller('HistoryController', ['$scope', 'Users', function($scope, Users) {

  $scope.ranges = [ 7, 14, 30, 60 ];
  $scope.range = parseInt(Users.GetHistoryRange());
  if ($scope.ranges.indexOf($scope.range) === -1) $scope.range = 7;

  $scope.$watch('range', function(val) {
    if (Users.Socket) {
      $scope.loading = true;
      Users.Socket.emit('GiveMeHistoryData', val);
    }
  });

  $scope.setRange = function(range) {
    $scope.range = range;
    Users.SetHistoryRange(range);
  };

  function prettyNumber(num) {
    return String(num).
      split('').reverse().join('').
      replace(/(\d{3})/g, '$1,').
      replace(/^,|,([^\d]*)$/g, '$1').
      split('').reverse().join('');
  }

  function prettyDate(string) {
    var date = (new Date(string)).toJSON().split(/[-T:.]/);
    return date = date[1] + '-' + date[2];
  }

  if (Users.Socket && Users.Socket.$events) {
    delete Users.Socket.$events;
  }
  if (Users.Socket) {
    Users.Socket.on('HereAreTheHistoryData', function(data) {
      data.map(function(d) {
        d.dateText = prettyDate(d.date);
        d.diff = d._price ? (+d.price - +d._price) : 0;
        d.increase = d.diff >= 0;
        d.diffAbs = Math.abs(d.diff).toFixed(2);
        d.volumeText = prettyNumber(d.volume);
        d.diffPercent = d._price ? (+d.diffAbs / d._price * 100).toFixed(2) : 0;
        d.volumeDiff = d._volume ? (+d.volume - +d._volume) : 0;
        d.volumeIncrease = d.volumeDiff >= 0;
        d.volumeDiffAbs = Math.abs(d.volumeDiff);
        d.volumeDiffPercent = d._volume ? (+d.volumeDiffAbs / d._volume * 100).toFixed(2) : 0;
        d._price = d._price || 'N/A';
      });
      $scope.history = data;
      $scope.loading = false;
      $scope.$apply();
    });
  }

  var lastByStr;
  $scope.sort = function(by, byStr) {
    if (!byStr && typeof by === 'string') byStr = by;
    if (lastByStr === byStr) {
      $scope.hOrderReverse = !$scope.hOrderReverse;
    } else {
      $scope.hOrderReverse = true;
    }
    $scope.hOrder = by;
    lastByStr = byStr;
  };
  $scope.sort('date');
}]).

controller('MyAccountController', ['$scope', 'Users',
  function($scope, Users) {
  if (!Users.RequiresLogin()) return;

  $scope.my = null;
  $scope.password = null;
  $scope.newpassword = null;
  $scope.retypenewpassword = null;

  function getInfo() {
    Users.GetMyInfo().then(function(response) {
      $scope.my = response.data;
    });
  }
  getInfo();

  $scope.changePassword = function() {
    Users.ChangePassword($scope.password, $scope.newpassword).
    then(function(response) {
      alert($scope.i18n$('Your password has been updated. ' +
        'It is recommended you log out now and then log in again.'));
      getInfo();
    }).
    catch(function() {
      alert($scope.i18n$('Fail to change password. You may have entered a ' +
        'wrong password or the server refused to change password at the ' +
        'moment.'));
    }).
    finally(function() {
      $scope.password = null;
      $scope.newpassword = null;
      $scope.retypenewpassword = null;
    });
  };
  function checkPassword(value) {
    return typeof value === 'string' && value.length >= 3 && value.length <= 20;
  }
  $scope.shouldChangePasswordDisable = function() {
    return !(checkPassword($scope.password) &&
      checkPassword($scope.newpassword) &&
      $scope.password !== $scope.newpassword &&
      $scope.newpassword === $scope.retypenewpassword);
  };
}]).

controller('LoginController', ['$scope', 'Users', '$timeout',
  function($scope, Users, $timeout) {
  // if user is authenticated, do not go to login page
  Users.Authenticated();

  $scope.username = null;
  $scope.password = null;

  $scope.statusClass = 'info';
  $scope.shouldLoginDisable = function() {
    if ($scope.status === 'loading') return true;
    if ($scope.username && $scope.password) return false;
    return true;
  };

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
        $timeout(function() {
          Users.Authenticated();
        }, 1000);
      }, 1000);
    }, function(response) {
      $timeout(function() {
        $scope.statusClass = 'danger';
        $scope.status = response.data.error || $scope.i18n$('Unknown Error.');
      }, 1000);
    });
  };
}]).

run([function() {
  // end
}]);
