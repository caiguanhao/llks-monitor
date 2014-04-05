var llksMonitor = angular.module('llksMonitor', [ 'ngRoute' ]).

config(['$routeProvider', '$locationProvider', '$compileProvider',
  function($routeProvider, $locationProvider, $compileProvider) {
  $routeProvider.
  when('/', {
    templateUrl: 'main',
    controller: 'MainController'
  }).
  when('/history', {
    templateUrl: 'history',
    controller: 'HistoryController'
  }).
  when('/help', {
    templateUrl: 'help'
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
  var whiteList = /^\s*(https?|ftp|mailto|tel|file|llksmonitor):/;
  $compileProvider.aHrefSanitizationWhitelist(whiteList);
}]).

run(['Users', '$rootScope', 'I18N', '$interval',
  function(Users, $rootScope, I18N, $interval) {
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
    updateWindowTitle();
    Users.SetLang(code);
  };
  $rootScope.i18n$ = function(string) {
    if (typeof string !== 'string') return '';
    string = string.trim().replace(/[\n\s]{1,}/g, ' ');
    var delimeter = string[0];
    if (';:,./?-_+=|\\*&^%$#@!~'.indexOf(delimeter) === -1) {
      delimeter = ':';
    } else {
      string = string.slice(1);
    }
    var lang = I18N[this.CURRENTLANG] || {};
    return lang[string]
           || string.slice(string.lastIndexOf(delimeter) + 1)
           || string;
  };
  // don't use i18n directive on <title> tag,
  // because the title tag will *blink* in iOS Safari on every route change
  function updateWindowTitle() {
    document.title = $rootScope.i18n$('header:LLKS Monitor');
  }
  updateWindowTitle();
  $interval(function() {
    $rootScope.$broadcast('anotherSecond');
  }, 1000);
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
      $scope.$on('langChange', function() {
        var i18nAttr = attrs.i18n.trim();
        var i18n = { text: i18nAttr };
        if (i18nAttr[0] === '{' && i18nAttr.slice(-1) === '}') {
          try {
            i18n = $scope.$eval(i18nAttr);
          } catch(e) {}
        }
        for (var attr in i18n) {
          if (typeof i18n[attr] !== 'string') continue;
          var text = $scope.i18n$(i18n[attr]);
          attr = attr.split(/[\n\s\t,.|/\\+&]+/);
          for (var i = 0; i < attr.length; i++) {
            if (attr[i] === 'text') {
              elem.text(text);
            } else {
              if (!attr[i]) continue;
              elem.attr(attr[i], text);
            }
          }
        }
      });
      $scope.$emit('langChange');
    }
  };
}]).

directive('secondsAgo', [function() {
  return {
    priority: 100, // let link run after i18n
    scope: {
      secondsAgo: '=',
      secondsAgoHideAfterNSecs: '='
    },
    link: function($scope, elem, attrs) {
      $scope.$on('anotherSecond', function(e) {
        var diff = Math.round((+new Date - $scope.secondsAgo) / 1000);
        var template = elem.attr('seconds-ago-template') || '{}';
        var num = Math.max(diff, 0);
        if (isNaN(num)) num = 'N/A'
        elem.text(template.replace(/{}/g, num));
        if (isNaN(num) || ($scope.secondsAgoHideAfterNSecs &&
          num > $scope.secondsAgoHideAfterNSecs)) {
          elem.addClass('ng-hide');
        } else {
          elem.removeClass('ng-hide');
        }
      });
      $scope.$emit('anotherSecond');
    }
  };
}]).

directive('bindHtml', ['$compile', function($compile) {
  return {
    scope: {
      bindHtml: '='
    },
    link: function($scope, elem, attrs, controller) {
      elem.html($scope.bindHtml);
      $compile(elem.contents())($scope.$parent);
    }
  };
}]).

directive('historyChart', ['$http', function($http) {
  return {
    restrict: 'A',
    scope: {
      historyChart: '='
    },
    link: function($scope, elem, attrs) {
      $scope.$watchCollection('historyChart', function(data) {
        if (!data) return;
        var price = [], volume = [];
        for (i = 0; i < data.length; i++) {
          price.push([
            data[i].date,
            +data[i].price
          ]);
          volume.push([
            data[i].date,
            data[i].volume
          ]);
        }
        Highcharts.setOptions({
          global: {
            useUTC: false
          }
        });
        new Highcharts.Chart({
          credits: {
            enabled: false
          },
          colors: [
            '#2f7ed8'
          ],
          chart : {
            renderTo : elem[0]
          },
          legend: {
            enabled: false
          },
          title: {
            text: null
          },
          navigator: {
            enabled: true
          },
          xAxis: {
            type: 'datetime',
            labels: {
              enabled: false
            }
          },
          yAxis: [{
            labels: {
              formatter: function() {
                  return this.value.toFixed(2);
              }
            },
            title: {
              text: null
            },
            height: 200,
            offset: 0,
            lineWidth: 1,
            gridLineColor: '#efefef',
            tickPixelInterval: 30
          }, {
            title: {
              text: null
            },
            top: 230,
            height: 80,
            offset: 0,
            lineWidth: 1
          }],
          plotOptions: {
            series: {
              marker: {
                enabled: false,
                states: {
                  hover: {
                    enabled: true,
                    radius: 3
                  }
                }
              }
            }
          },
          series: [{
            type: 'line',
            name: 'Price',
            data: price,
            lineWidth: 1,
            states: {
              hover: {
                lineWidth: 1,
              }
            },
            tooltip: {
              valueDecimals: 2
            }
          }, {
            type: 'column',
            name: 'Volume',
            data: volume,
            yAxis: 1
          }]
        });
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
  this.Create = function(username, password, captcha, phpsessid) {
    return $http.post('/accounts', {
      username: username,
      password: password,
      captcha: captcha,
      phpsessid: phpsessid
    });
  };
  this.Modify = function(id, data) {
    return $http.put('/accounts/' + id, data);
  };
  this.Delete = function(id) {
    return $http.delete('/accounts/' + id);
  };
}]).

service('Users', ['$http', '$window', '$rootScope', '$route', '$location',
  'ASSETS', 'Cached',
  function($http, $window, $rootScope, $route, $location, ASSETS, Cached) {
  function ls(key, val) {
    if (val === undefined) return $window.localStorage[key];
    if (val === null) {
      delete $window.localStorage[key];
    } else {
      $window.localStorage[key] = val;
    }
  }
  this.LogOut = function() {
    this.SetUser(null, null, null);
    this.SetIPAddresses(null);
    this.PrivateSocket = null;
    Cached.Reset();
    $route.reload();
  };
  this.PermissionDenied = function() {
    this.LogOut();
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
  this.SaveIPAddresses = function(data) {
    return $http.put('/my', { ipaddresses: data });
  };
  this.Init = function() {
    this.InitPublicSocket();
    this.GetUser();
    var self = this;
    $rootScope.logout = function() {
      self.LogOut();
    };
  };
  this.InitPublicSocket = function() {
    if (this.PublicSocket && this.PublicSocket.$events) {
      delete this.PublicSocket.$events;
    }
    this.PublicSocket = io.connect('/public', {
      'force new connection': true,
      'reconnect': true,
      'reconnection delay': 1000,
      'reconnection limit': 5000,
      'max reconnection attempts': 10000
    });
    this.PublicSocket.on('ServerHasUpdated', function(data) {
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
    var self = this;
    this.PublicSocket.on('connect', function() {
      self.PublicSocket.emit('GiveMeMarketData');
    });
    this.PublicSocket.on('disconnect', function() {
      if (self.PublicSocket) self.PublicSocket.socket.reconnect();
    });
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
  this.GetIPAddresses = function() {
    return ls('llksMonitor.user.ipaddresses');
  };
  this.SetIPAddresses = function(list) {
    ls('llksMonitor.user.ipaddresses', list);
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
    // if (!id || !token) return;
    var query = 'id=' + id + '&token=' + token;
    if (this.PrivateSocket) {
      // if it is going to reconnect, update query object
      // since it won't update automatically
      this.PrivateSocket.socket.options.query = query;
    }
    this.PrivateSocket = io.connect('/private', {
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

service('Cached', [function() {
  this.Reset = function() {
    this.Accounts = [];
    this.Miners = {};
    this.Market = {};
  };
  this.Reset();
}]).

controller('MainController', ['$scope', 'Accounts', 'Users', '$window',
  '$filter', '$http', 'Cached', '$q',
  function($scope, Accounts, Users, $window, $filter, $http, Cached, $q) {

  function updateMarket() {
    $scope.market = Cached.Market;
    $scope.market.priceText = {};
    for (var p in $scope.market.price) {
      $scope.market.priceText[p] = $filter('currency')($scope.market.price[p], '￥');
    }
    $scope.market.todayText = $scope.market.today + ' KB';
    $scope.market.difficultyText = $scope.market.difficulty + ' G/KG';
    $scope.market.soldText = $scope.market.sold + ' KB';
    $scope.market.volumeText = $scope.market.volume + ' KB';
    $scope.market.boughtText = $scope.market.bought + ' KB';
    $scope.market.timeText = $filter('date')($scope.market.time, 'yyyy-MM-dd HH:mm:ss');
  }
  if (Cached.Market.time) {
    updateMarket();
  } else if (Users.PublicSocket.socket.connected) {
    Users.PublicSocket.emit('GiveMeMarketData');
  }

  if (Users.PublicSocket && Users.PublicSocket.$events) {
    delete Users.PublicSocket.$events['UpdateMarket'];
  }
  if (Users.PublicSocket) {
    Users.PublicSocket.on('UpdateMarket', function(data) {
      Cached.Market = data;
      updateMarket();
    });
  }

  $scope.username = null;
  $scope.password = null;
  $scope.captcha = null;

  $scope.filterMinerIP = function(ip) {
    if ($scope.minerIPFilter === ip) {
      $scope.minerIPFilter = '';
    } else {
      $scope.minerIPFilter = ip;
    }
    updateAllMiners();
  };

  function LoadCache() {
    $scope.accounts = Cached.Accounts;
  }
  LoadCache();

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
    $scope.minerIPFilter = '';
    updateAllMiners();
  };
  $scope.toggleShow = function(id) {
    var H = [];
    (Cached.Accounts || []).forEach(function(a) {
      if (a._id !== id) H.push(a._id);
    });
    if (angular.equals($scope.HiddenAccounts, H)) {
      $scope.HiddenAccounts = id ? [ id ] : [];
    } else {
      $scope.HiddenAccounts = H;
    }
    Users.SetHiddenAccounts($scope.HiddenAccounts);
    $scope.minerIPFilter = '';
    updateAllMiners();
  };

  var allMiners = Cached.Miners;
  if (Object.keys(allMiners).length > 0) {
    updateAllMiners();
  }

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
  }
  function f(n) { return n < 10 ? '0' + n : n; }
  function prettyTime(t) {
    var time = new Date(t);
    return f(time.getMonth() + 1) + '-' + f(time.getDate()) + ' ' +
      f(time.getHours()) + ':' + f(time.getMinutes());
  }
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
    var ipAddreses = Users.GetIPAddresses() || '';
    for (var miner in allMiners) {
      var account = $filter('filter')(Cached.Accounts || [],
        { _id: miner }, true)[0];
      if (!account) continue;
      var shouldIncludeAccountInList = false;
      if ($scope.HiddenAccounts.indexOf(account._id) === -1) {
        shouldIncludeAccountInList = true;
      }
      if (allMiners[miner].error) {
        account.updated = false;
        account.miners = 0;
        account.minersOnline = 0;
        continue;
      }
      account.updated = allMiners[miner].updated;
      var accountTotalTotal = 0, accountTodayTotal = 0;
      var accountYesterdayTotal = 0, accountSpeedTotal = 0;
      var minersOnline = 0;

      allMiners[miner].miners.forEach(function(s) {
        s.bg = speedBg(s);
        if (s.status === '在线') minersOnline += 1;
        if (s.speednum) accountSpeedTotal += s.speednum;
        accountTotalTotal += s.total;
        accountTodayTotal += s.today;
        accountYesterdayTotal += s.yesterday;

        var shouldIncludeMinerInList = true;
        if ($scope.minerIPFilter) {
          if (s.ip.indexOf($scope.minerIPFilter) === -1) {
            shouldIncludeMinerInList = false;
          }
        }
        if (shouldIncludeAccountInList && shouldIncludeMinerInList) {
          var match = new RegExp('\\b'+s.ip.replace(/\*+/g, '\\d+').
            replace(/\./g, '\\.')+'\\b').exec(ipAddreses);
          var ipreal;
          if (match) ipreal = match[0];
          var t = s.ip.split('.');
          if (t.length === 4) {
            s.ipText = '<a href ng-click="filterMinerIP(\'' +
              t.slice(0, 3).join('.') + '\')">' + t.slice(0, 3).join('.') +
              '</a>.';
            if (ipreal) {
              s.ipText += '<a href="llksmonitor:' + ipreal + '">' +
                t[3] + '</a>';
            } else {
              s.ipText += t[3];
            }
          } else {
            s.ipText = s.ip;
          }
          s.account = account.name;
          s.servertimeText = prettyTime(s.servertime);
          $scope.count[s.bg] += 1;
          if (s.status === '在线') $scope.count.online += 1;

          $scope.count.total += s.total;
          $scope.count.today += s.today;
          $scope.count.yesterday += s.yesterday;
          if (s.speednum) $scope.count.speed += s.speednum;

          miners.push(s);
        }
      });
      account.minersOnline = minersOnline;
      account.miners = allMiners[miner].miners.length;
      account.speed = +accountSpeedTotal;
      account.speedText = (account.speed / 1024).toFixed(3) + ' M/S';
      account.unsoldWorth = $filter('currency')((!account || !account.unsold)
        ? 0 : (Math.floor(account.unsold) * account.price), '￥');
      account.totalValueText = $filter('currency')(account.totalValue, '￥');
      account.today = +accountTodayTotal.toFixed(2);
      account.yesterday = +accountYesterdayTotal.toFixed(2);
      if (account.total) account.total = +account.total.toFixed(2);
    }
    $scope.count.total = +$scope.count.total.toFixed(5);
    $scope.count.today = +$scope.count.today.toFixed(5);
    $scope.count.yesterday = +$scope.count.yesterday.toFixed(5);
    $scope.count.speed = ($scope.count.speed / 1024).toFixed(3) + ' M/S';
    $scope.miners = miners;
    if (!$scope.$$phase) $scope.$apply();
  }

  $scope.status = 'unknown';

  if (Users.PrivateSocket && Users.PrivateSocket.$events) {
    delete Users.PrivateSocket.$events;
  }
  if (Users.PrivateSocket) {
    Users.PrivateSocket.on('HereAreTheAccounts', function(accounts) {
      var accountIds = [], changed = false;
      accounts.forEach(function(account) {
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

      Cached.Accounts = accounts;
      LoadCache();
      updateAllMiners();
    });
    if (Users.PrivateSocket.socket.connected) {
      Users.PrivateSocket.emit('GiveMeAccounts');
    }
    Users.PrivateSocket.on('UpdateMiners', function(data) {
      $scope.status = 'connected';
      angular.extend(allMiners, data);
      updateAllMiners();
    });
    Users.PrivateSocket.on('updateAccount', function(data) {
      $scope.status = 'connected';
      for (var accountId in data) {
        var account = $filter('filter')(Cached.Accounts || [],
          { _id: accountId }, true)[0];
        if (!account) continue;
        angular.extend(account, data[accountId]);
      }
    });
    Users.PrivateSocket.on('connect', function() {
      $scope.status = 'connected';
      Users.PrivateSocket.emit('GiveMeAccounts');
    });
    Users.PrivateSocket.on('disconnect', function() {
      $scope.status = 'disconnected';
      if (Users.PrivateSocket) Users.PrivateSocket.socket.reconnect();
    });
    Users.PrivateSocket.on('connect_failed', function(reason) {
      $scope.status = 'error';
      if (reason === 'unauthorized') {
        return Accounts.PermissionDenied();
      }
    });
    Users.PrivateSocket.on('error', function(reason) {
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

  var cancelGettingCaptcha;
  $scope.enableEditsClicked = function() {
    if (cancelGettingCaptcha) cancelGettingCaptcha.resolve();
    if (!$scope.accountEditsEnabled) {
      $scope.getCaptcha();
    }
    $scope.accountEditsEnabled = !$scope.accountEditsEnabled;
  };
  $scope.getCaptcha = function() {
    $scope.captcha = null;
    $scope.captchaImage = null;
    $scope.phpsessid = null;
    cancelGettingCaptcha = $q.defer();
    $http.get('/captcha', { timeout: cancelGettingCaptcha.promise }).
    then(function(response) {
      $scope.captchaImage = response.data.image;
      $scope.phpsessid = response.data.phpsessid;
      cancelGettingCaptcha = null;
    });
  };

  $scope.create = function() {
    var captcha = $scope.captcha;
    $scope.captcha = null;
    Accounts.Create($scope.username, $scope.password,
      captcha, $scope.phpsessid).
    then(function(response) {
      $scope.username = null;
      $scope.password = null;
      var account = response.data;
      Cached.Accounts.push(account);
      LoadCache();
      $scope.getCaptcha();
    }).catch(function(response) {
      if (response.status === 403) {
        alert($scope.i18n$('Permission denied.'));
        return Accounts.PermissionDenied();
      }
      alert(response.data.error || $scope.i18n$('Unknown Error.'));
      $scope.getCaptcha();
    });
  };
  $scope.updateName = function(account) {
    var newName = $window.prompt($scope.i18n$('Enter new name:'), account.name);
    if (!newName || newName === account.name) return;
    Accounts.Modify(account._id, { name: newName }).then(function(response) {
      account.name = newName;
    });
  };
  $scope.delete = function(accounts, account) {
    if (account.updated !== false &&
      !$window.confirm($scope.i18n$('Are you sure you want to delete '+
        'this account?'))) {
      return;
    }
    var id = account._id;
    Accounts.Delete(id).then(function(response) {
      accounts.splice($filter('filter')(accounts, { _id: id }, true), 1);
      delete allMiners[id];
      updateAllMiners();
    });
  };
}]).

controller('HistoryController', ['$scope', 'Users', function($scope, Users) {

  $scope.ranges = [ 1, 30, 60, 180 ];
  $scope.range = parseInt(Users.GetHistoryRange());
  if ($scope.ranges.indexOf($scope.range) === -1) $scope.range = 30;

  $scope.$watch('range', function(val) {
    if (Users.PublicSocket) {
      $scope.loading = true;
      if (val === 1) {
        Users.PublicSocket.emit('GiveMeDayData');
      } else {
        Users.PublicSocket.emit('GiveMeHistoryData', val);
      }
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
  function f(n) { return n < 10 ? '0' + n : n; }
  function prettyDate(t) {
    var time = new Date(t);
    return f(time.getMonth() + 1) + '-' + f(time.getDate());
  }
  function prettyTime(t) {
    var time = new Date(t);
    return f(time.getHours()) + ':' + f(time.getMinutes());
  }
  if (Users.PublicSocket && Users.PublicSocket.$events) {
    delete Users.PublicSocket.$events['HereAreTheHistoryData'];
    delete Users.PublicSocket.$events['MarketDayDataUpdated'];
  }
  if (Users.PublicSocket) {
    Users.PublicSocket.on('HereAreTheHistoryData', function(data) {
      data.data.forEach(function(d) {
        if (data.type === 'day') {
          d.dateText = prettyTime(d.date);
        } else {
          d.dateText = prettyDate(d.date);
          d.diff = d._price ? (+d.price - +d._price) : 0;
          d.increase = d.diff >= 0;
          d.diffAbs = Math.abs(d.diff).toFixed(2);
          d.diffPercent = d._price ? (+d.diffAbs / d._price * 100).toFixed(2) : 0;
          d.volumeDiff = d._volume ? (+d.volume - +d._volume) : 0;
          d.volumeIncrease = d.volumeDiff >= 0;
          d.volumeDiffAbs = Math.abs(d.volumeDiff);
          d.volumeDiffPercent = d._volume ? (+d.volumeDiffAbs / d._volume * 100).toFixed(2) : 0;
          d._price = d._price || 'N/A';
        }
        d.volumeText = prettyNumber(d.volume);
      });
      $scope.dataDate = null;
      if (data.type === 'day') {
        $scope.dataDate = data.date;
      }
      $scope.type = data.type;
      $scope.history = data.data;
      $scope.loading = false;
      $scope.$apply();
    });
    Users.PublicSocket.on('MarketDayDataUpdated', function() {
      if ($scope.range === 1) {
        Users.PublicSocket.emit('GiveMeDayData');
      }
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
      Users.SetIPAddresses($scope.my.ipaddresses);
      $scope.iplist = Users.GetIPAddresses();
    });
  }
  getInfo();

  $scope.iplist = Users.GetIPAddresses();
  $scope.saveIPList = function() {
    Users.SetIPAddresses($scope.iplist);
    Users.SaveIPAddresses($scope.iplist);
  };
  $scope.shouldSaveIPAddressesDisable = function() {
    var old = Users.GetIPAddresses();
    if (old) {
      return $scope.iplist === old;
    } else {
      return !$scope.iplist;
    }
  };
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
        Users.SetIPAddresses(data.ipaddresses);
        $timeout(function() {
          Users.Authenticated();
        }, 1000);
      }, 1000);
    }, function(response) {
      $timeout(function() {
        $scope.password = null;
        $scope.statusClass = 'danger';
        $scope.status = response.data.error || $scope.i18n$('Unknown Error.');
      }, 1000);
    });
  };
}]).

run([function() {
  window.addEventListener('load', function() {
    FastClick.attach(document.body);
  }, false);
}]);
