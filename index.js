var express = require('express');
var db = require('./db');
var Q = require('q');

var app = express();

app.set('port', process.env.PORT || 3000);

app.configure('development', function() {
  app.use(express.static(__dirname + '/assets'));
});

app.use(express.bodyParser());
app.use(express.static(__dirname + '/public'));

var I18N = require('./translations');

app.use(function(req, res, next) {
  req.userLang = null;
  if (req.headers) {
    req.userLang = req.headers['x-user-lang'];
  }
  if (!req.userLang || req.userLang.length > 5) {
    req.userLang = 'en';
  }
  req.$$ = function(string) {
    string = string.trim().replace(/[\n\s]{1,}/g, ' ');
    var code = req.userLang;
    var lang = I18N[code] || {};
    var text = string.slice(string.lastIndexOf(':') + 1) || string;
    return lang[string] || text;
  };
  next();
});

app.post('/login', function(req, res, next) {
  db.authenticate(req.body.username, req.body.password, null,
    function(code, user) {
    switch (code) {
    case db.authConst.INVALID:
      res.status(401);
      res.send({ error: req.$$('Invalid username or password.') });
      return;
    case db.authConst.LOCKED:
      res.writeHead(466, 'User Is Banned');
      res.end(JSON.stringify({ error: req.$$('The account is temporarily ' +
        'locked due to too many failed login attempts.') }));
      return;
    case db.authConst.BANNED:
      res.writeHead(466, 'User Is Banned');
      res.end(JSON.stringify({
        error: req.$$('You are banned by administrators.')
      }));
      return;
    case db.authConst.SUCCESS:
      res.status(200);
      res.send({
        id: user._id,
        username: user.username,
        token: user.token,
        ipaddresses: user.ipaddresses
      });

      try {
        var clients = io.sockets.clients();
        for (var i = 0; i < clients.length; i++) {
          var user_id = clients[i].handshake.user._id;
          if (user._id === user_id) {
            clients[i].disconnect();
          }
        }
      } catch(e) {}
      return;
    default:
      res.writeHead(499, 'Unknown Error');
      res.end(JSON.stringify({ error: req.$$('Unknown Error.') }));
      return;
    }
  });
});

app.use(function(req, res, next) {
  req._user_id = null;
  req._user_token = null;
  if (req.headers) {
    req._user_id = req.headers['x-user-id'];
    req._user_token = req.headers['x-user-token'];
  }
  next();
});

function serverError(req, res) {
  res.status(500);
  res.send({ error: req.$$('Server error.') });
}

function permissionDenied(req, res) {
  res.status(403);
  res.send({ error: req.$$('Permission denied.') });
}

function authorize(callback) {
  return function(req, res, next) {
    var user = db.users.findOne({
      _id: req.headers['x-user-id'],
      token: req.headers['x-user-token']
    }).exec(function(error, user) {
      if (error || !user) return permissionDenied(req, res);
      req.user = user;
      callback(req, res, next);
    });
  };
}

app.get('/my', authorize(function(req, res, next) {
  db.users.findOne({ _id: req.user._id }, function(err, user) {
    if (err) return next();
    var llia = user.last_logged_in_at || [];
    llia = llia.map(function(l) {
      return +l;
    });
    res.status(200);
    res.send({
      _id: user._id,
      username: user.username,
      ipaddresses: user.ipaddresses,
      created_at: +user.created_at,
      updated_at: +user.updated_at,
      last_logged_in_at: llia,
      password_updated_at: +user.password_updated_at
    });
  });
}));

app.put('/my', authorize(function(req, res, next) {
  var ipaddresses = req.body.ipaddresses;
  if (typeof ipaddresses === 'string') {
    req.user['ipaddresses'] = ipaddresses;
    req.user['updated_at'] = new Date;
    db.users.update({
      _id: req.user._id
    }, req.user, {}, function(err) {
      if (err) return next();
      UpdateUserHandshakeData(req.user);
      res.status(200);
      res.send({ status: req.$$('OK') });
    });
    return;
  }

  var subscriptions = req.body.subscriptions;
  if (typeof subscriptions === 'string') {
    req.user['subscriptions'] = subscriptions;
    req.user['updated_at'] = new Date;
    db.users.update({
      _id: req.user._id
    }, req.user, {}, function(err) {
      if (err) return next();
      UpdateUserHandshakeData(req.user);
      res.status(200);
      res.send({ status: req.$$('OK') });
    });
    return;
  }

  var oldPassword = req.body.oldpassword;
  var newPassword = req.body.newpassword;
  if (!db.checkPassword(oldPassword) || !db.checkPassword(newPassword)) {
    return next();
  }
  db.authenticate(req.user.username, oldPassword, { dry: true },
    function(code, user) {
    if (code !== db.authConst.SUCCESS) return next();
    var new_date = new Date;
    db.users.update({
      _id: user._id
    }, { $set: {
      password: db.hashPassword(newPassword),
      password_updated_at: new_date,
      updated_at: new_date
    } }, {}, function(err) {
      if (err) return next();
      // UpdateUserHandshakeData(req.user); // we don't need to update this
      res.status(200);
      res.send({ status: req.$$('OK') });
    });
  });
}));

app.get('/captcha', authorize(function(req, res, next) {
  var deferred = Q.defer();
  var https = require('https');
  var request = https.get({
    hostname: 'jiaoyi.yunfan.com',
    port: 443,
    path: '/index.php/user/get_captcha'
  }, function (response) {
    var data = '';
    response.setEncoding('binary');
    response.on('data', function(chunk) {
      data += chunk;
    });
    response.on('end', function() {
      deferred.resolve({
        data: data,
        headers: response.headers
      });
    });
  });
  request.on('error', function(error) {
    deferred.reject();
  });
  request.setTimeout(1000 * 10, function() {
    request.abort();
    deferred.reject();
  });
  deferred.promise.then(function(bundle) {
    var PHPSESSID = null;
    var headers = bundle.headers['set-cookie'];
    if (headers instanceof Array && headers.length > 0) {
      headers = headers[0].match(/PHPSESSID=([a-f0-9]+)/);
      if (headers) {
        PHPSESSID = headers[1];
      }
    }
    var dataURL = 'data:' + bundle.headers['content-type'] + ';base64,' +
      new Buffer(bundle.data, 'binary').toString('base64');
    res.send({
      image: dataURL,
      phpsessid: PHPSESSID
    });
  }).catch(function() {
    next();
  });
}));

app.get('/accounts', authorize(function(req, res, next) {
  db.accounts.find({}).sort({ name: 1 }).exec(function(err, accounts) {
    if (err) return next();
    var subscriptions = req.user.subscriptions;
    try {
      subscriptions = JSON.parse(subscriptions);
    } catch(e) {}
    subscriptions = subscriptions || [];
    accounts.map(function(account) {
      delete account.code;
      delete account.data;
      account.subscribed = subscriptions.indexOf(account._id) !== -1;
    });
    res.send(accounts);
  });
}));

app.post('/accounts', authorize(function(req, res, next) {
  var username = req.body.username;
  var password = req.body.password;
  var captcha = req.body.captcha;
  var phpsessid = req.body.phpsessid;
  var querystring = require('querystring');
  var post = querystring.stringify({
    username: username,
    password: password,
    vcode: captcha
  });
  var headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Content-Length': post.length,
    'Cookie': 'PHPSESSID=' + phpsessid + ';'
  };
  var deferred = Q.defer();
  var https = require('https');
  var request = https.request({
    hostname: 'jiaoyi.yunfan.com',
    port: 443,
    path: '/index.php/user/check',
    method: 'POST',
    headers: headers
  }, function (response) {
    var data = '';
    response.on('data', function(chunk) {
      data += chunk;
    });
    response.on('end', function() {
      try {
        var reply = JSON.parse(data);
        if (reply.ok === true) {
          deferred.resolve(response.headers);
        } else {
          deferred.reject(reply.reason);
        }
      } catch(e) {
        deferred.reject();
      }
    });
  });
  request.on('error', function(error) {
    deferred.reject();
  });
  request.setTimeout(1000 * 10, function() {
    request.abort();
    deferred.reject();
  });
  request.write(post);
  request.end();
  deferred.promise.then(function(headers) {
    var sessionid = undefined;
    var headers = headers['set-cookie'];
    if (headers instanceof Array && headers.length > 0) {
      headers = headers[0].match(/ntts_kb_session_id=([^;]+)/);
      if (headers) {
        sessionid = headers[1];
      }
    }
    if (!sessionid) throw req.$$('Failed to get Session ID.');
    return sessionid;
  }).then(function(sessionid) {
    var deferred = Q.defer();
    var user = req.user;
    db.createAccount(username, sessionid, user, function(err, account) {
      if (err) {
        deferred.reject();
      } else {
        deferred.resolve(account);
      }
    });
    return deferred.promise;
  }).then(function(account) {
    // add subscription by default
    var subscriptions;
    try {
      subscriptions = JSON.parse(req.user.subscriptions);
    } catch(e) {}
    if (!subscriptions) subscriptions = [];
    subscriptions.push(account._id);
    var deferred = Q.defer();
    db.users.update({
      _id: req.user._id
    }, { $set: {
      subscriptions: JSON.stringify(subscriptions)
    } }, {}, function(err, user) {
      if (err) {
        deferred.reject(err);
      } else {
        deferred.resolve(account);
      }
    });
    return deferred.promise;
  }).then(function(account) {
    onAccountChanges();
    res.status(201);
    res.send(account);
  }).catch(function(error) {
    var errorStr = error && error.toString ? error.toString() : '';
    res.status(500);
    res.send({ error: errorStr || req.$$('Server error.') });
  });
}));

app.put('/accounts/:account_id', authorize(function(req, res, next) {
  var data = req.body;
  if (!data) return next();
  db.accounts.findOne({ _id: req.params.account_id }, function(err, account) {
    if (err || !account) return next();
    var set = {};
    if (data.hasOwnProperty('code')) {
      if (!data.code) return next();
      set.code = data.code;
    }
    if (data.hasOwnProperty('name')) {
      if (!data.name) return next();
      set.name = data.name;
    }
    if (Object.keys(set).length === 0) return next();
    set.updated_at = new Date;
    db.accounts.update({ _id: account._id }, { $set: set }, {}, function(err) {
      if (err) return serverError(req, res);
      onAccountChanges();
      res.status(200);
      res.send({ status: req.$$('OK') });
    });
  });
}));

app.delete('/accounts/:account_id', authorize(function(req, res, next) {
  db.accounts.remove({ _id: req.params.account_id }, {}, function(err) {
    if (err) return serverError(req, res);
    onAccountChanges();
    res.status(200);
    res.send({ status: req.$$('OK') });
  });
}));

function onAccountChanges() {
  HereAreTheAccounts();
  minerMonitor.restart();
}

var server = require('http').createServer(app);

server.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

var io = require('socket.io').listen(server);

io.set('log level', 0); // 0 - error 1 - warn 2 - info 3 - debug

app.configure('production', function() {
  io.disable('browser client');
});

io.of('/private').
  authorization(function(handshakeData, callback) {
    var id = handshakeData.query.id;
    var token = handshakeData.query.token;
    if (id && token) {
      db.users.findOne({
        _id: id,
        token: token
      }).exec(function(error, user) {
        if (error) return callback('Error occurred.', false);
        if (!user) return callback(null, false);
        handshakeData.user = user;
        return callback(null, true);
      });
      return;
    }
    callback('Please provide user id and token!', false);
  }).
  on('connection', function(socket) {
    socket.on('GiveMeAccounts', HereAreTheAccounts);
  });

io.of('/public').
  on('connection', function(socket) {
    var assetsHashes = {};
    try {
      assetsHashes = require('./db/.assets.json');
    } catch(e) {
      console.log('db/.assets.json not found');
    }
    socket.emit('ServerHasUpdated', assetsHashes);
    socket.on('GiveMeHistoryData', HereAreTheHistoryData);
    socket.on('GiveMeDayData', HereAreTheDayData);
    socket.on('GiveMeMarketData', HereAreTheMarketData);
  });

function UpdateUserHandshakeData(user) {
  var clients = io.of('/private').clients();
  if (!clients) return;
  for (var i = 0; i < clients.length; i++) {
    if (clients[i].manager.handshaken[clients[i].id].user._id = user._id) {
      clients[i].manager.handshaken[clients[i].id].user = user;
    }
  }
}

function HereAreTheAccounts() {
  var self = this;
  var toAll = false;
  if (typeof self.emit !== 'function') {
    toAll = true;
    self = io.of('/private');
  }

  Q.
  fcall(function() {
    var deferred = Q.defer();
    db.accounts.find({}, function(err, accounts) {
      if (err) {
        deferred.reject(err);
      } else {
        deferred.resolve(accounts || []);
      }
    });
    return deferred.promise;
  }).
  then(function(accounts) {
    var clients;
    if (toAll) {
      clients = self.clients();
    } else {
      clients = [ self ];
    }
    return clients.reduce(function(prev, cur) {
      return prev.then(function() {
        var handshake = cur.manager.handshaken[cur.id];
        var subscriptions;
        try {
          subscriptions = JSON.parse(handshake.user.subscriptions) || [];
        } catch(e) {
          subscriptions = [];
        }
        return accounts.filter(function(account) {
          delete account.code;
          return subscriptions.indexOf(account._id) !== -1;
        });
      }).then(function(accounts) {
        if (!accounts || accounts.length === 0) return;
        cur.emit('HereAreTheAccounts', accounts);
      }, function() {});
    }, Q());
  }).
  catch(function(err) {
    console.error(new Date, 'HereAreTheAccounts', err);
  });
}

function HereAreTheHistoryData(length) {
  var self = this;
  if (typeof self.emit !== 'function') self = io.of('/public');

  if (typeof length === 'number' && length > 0 && length <= 180) {
    length = Math.round(length);
  } else {
    length = 7;
  }

  db.marketHistory.findOne({ name: 'market-overiew-180' }, function(err, doc) {
    if (!doc) return;
    try {
      var data = JSON.parse(doc.data);
      data.splice(0, data.length - length);
      var bundle = {
        length: length,
        type: 'history',
        data: data
      };
      self.emit('HereAreTheHistoryData', bundle);
    } catch(e) {}
  });
}

function HereAreTheMarketData() {
  var self = this;
  if (typeof self.emit !== 'function') self = io.of('/public');
  db.marketHistory.findOne({ name: 'market-stat' }, function(err, doc) {
    if (!doc) return;
    try {
      var data = JSON.parse(doc.data);
      self.emit('UpdateMarket', data);
    } catch(e) {}
  });
}

function HereAreTheDayData() {
  var self = this;
  if (typeof self.emit !== 'function') self = io.of('/public');

  db.marketDay.find({}).sort({ name: -1 }).limit(1).exec(function(err, docs) {
    if (err || !docs || docs.length === 0) return;
    try {
      var doc = docs[0];
      var H = [];
      var data = JSON.parse(doc.data);
      for (var i = 0; i < data.length; i++) {
        var d = data[i];
        H.push({
          date: d[0],
          price: (d[1]).toFixed(2),
          volume: +d[2]
        });
      }
      var bundle = {
        date: doc.name,
        type: 'day',
        data: H
      };
      self.emit('HereAreTheHistoryData', bundle);
    } catch(e) {}
  });
}

// stop restart loop caused by errors
process.on('uncaughtException', function(err) {
  console.error('Caught exception: ' + JSON.stringify(err));
});

process.on('SIGINT', function() {
  for (var s in io.sockets.sockets) {
    io.sockets.sockets[s].disconnect();
  }
  process.exit(0);
});

var Monitor = require('./monitor');

// get miners and accounts
var miner = require('./monitor/miner');
var minerMonitor = new Monitor(miner, { io: io, db: db });
minerMonitor.start();

// update market history data
var marketHistory = require('./monitor/market-history');
var marketHistoryMonitor = new Monitor(marketHistory, { db: db });
marketHistoryMonitor.start();

// update market day data
var marketDay = require('./monitor/market-day');
var marketDayMonitor = new Monitor(marketDay, { io: io, db: db });
marketDayMonitor.start();

// update market day data
var mineral = require('./monitor/mineral');
var mineralMonitor = new Monitor(mineral, { db: db });
mineralMonitor.start();

// update market day data
var GitHub = require('./monitor/github');
var GitHubMonitor = new Monitor(GitHub, { db: db });
GitHubMonitor.start();
