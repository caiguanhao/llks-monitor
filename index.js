var express = require('express');
var db = require('./db');

var app = express();

app.set('port', process.env.PORT || 3000);

app.configure('development', function() {
  app.use(express.static(__dirname + '/assets'));
});

app.use(express.bodyParser());
app.use(express.static(__dirname + '/public'));

app.post('/login', function(req, res, next) {
  db.authenticate(req.body.username, req.body.password, function(code, user) {
    switch (code) {
    case db.authConst.INVALID:
      res.status(401);
      res.send({ error: 'Invalid username or password.' });
      return;
    case db.authConst.LOCKED:
      res.writeHead(466, 'User Is Banned');
      res.end(JSON.stringify({ error: 'The account is temporarily locked ' +
        'due to too many failed login attempts.' }));
      return;
    case db.authConst.BANNED:
      res.writeHead(466, 'User Is Banned');
      res.end(JSON.stringify({ error: 'You are banned by administrators.' }));
      return;
    case db.authConst.SUCCESS:
      res.status(200);
      res.send({
        id: user._id,
        username: user.username,
        token: user.token
      });
      return;
    default:
      res.writeHead(499, 'Unknown Error');
      res.end(JSON.stringify({ error: 'Unknown Error.' }));
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

function serverUnavailable(res) {
  res.status(500);
  res.send({ error: 'Server unavailable.' });
}

function permissionDenied(res) {
  res.status(403);
  res.send({ error: 'Permission denied.' });
}

function authorize(callback) {
  return function(req, res, next) {
    var user = db.users.findOne({
      _id: req.headers['x-user-id'],
      token: req.headers['x-user-token']
    }).exec(function(error, user) {
      if (error || !user) return permissionDenied(res);
      req.user = user;
      callback(req, res, next);
    });
  };
}

app.get('/accounts', authorize(function(req, res, next) {
  db.accounts.find({}, function(err, account) {
    if (err) return serverUnavailable(res);
    res.status(200);
    res.send(account);
  });
}));

app.post('/accounts', authorize(function(req, res, next) {
  var name = req.body.name;
  var code = req.body.code;
  if (!name || !code) return next();
  var user = req.user;
  db.createAccount(name, code, user, function(err, account) {
    if (err) return serverUnavailable(res);
    restartTimers();
    res.status(201);
    res.send(account);
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
    db.accounts.update({ _id: account._id }, { $set: set }, {}, function(err) {
      if (err) return serverUnavailable(res);
      restartTimers();
      res.status(200);
      res.send({ status: 'ok' });
    });
  });
}));

app.delete('/accounts/:account_id', authorize(function(req, res, next) {
  db.accounts.remove({ _id: req.params.account_id }, {}, function(err) {
    if (err) return serverUnavailable(res);
    restartTimers();
    res.status(200);
    res.send({ status: 'ok' });
  });
}));

var server = require('http').createServer(app);

server.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

var https = require('https');
var io = require('socket.io').listen(server);

app.configure('production', function() {
  io.disable('browser client');
});

io.configure(function() {
  io.set('authorization', function(handshakeData, callback) {
    var id = handshakeData.query.id;
    var token = handshakeData.query.token;
    if (id && token) {
      db.users.findOne({
        _id: id,
        token: token
      }).exec(function(error, user) {
        if (error) return callback('Error occurred.', false);
        if (!user) return callback(null, false);
        return callback(null, true);
      });
      return;
    }
    callback('Please provide user id and token!', false);
  });
  io.set('log level', 1);
  // 0 - error
  // 1 - warn
  // 2 - info
  // 3 - debug
});

var Q = require('q');

function getHttpData(location, code) {
  var deferred = Q.defer();
  var request = https.get({
    hostname: 'jiaoyi.yunfan.com',
    port: 443,
    path: location,
    headers: {
      Cookie: 'ntts_kb_session_id=' + code + ';'
    }
  }, function (res) {
    var data = '';
    res.on('data', function(chunk) {
      data += chunk;
    });
    res.on('end', function() {
      deferred.resolve(data);
    });
  });
  request.on('error', function(error) {
    deferred.reject(error);
  });
  request.setTimeout(3000, function() {
    request.abort();
    deferred.reject('timeout');
  });
  return deferred.promise;
}

function getData(account, wait) {
  var code = account.code;
  getHttpData('/dig/miner/log/', code).then(function(data) {
    processMinerData(account, data);
    return getHttpData('/dig/miner/stats/', code);
  }).then(function(data) {
    processAccountData(account, data);
  }).finally(function() {
    timers[account._id] = setTimeout(function() {
      getData(account);
    }, wait || 5000);
  });
}

function sendData(account, data) {
  var bundle = {};
  bundle[account._id] = data;
  db.accounts.update({ _id: account._id }, { $set: {
    data: JSON.stringify(bundle)
  } }, {}, function() {
    db.accounts.persistence.compactDatafile();
  });
  io.sockets.emit('update', bundle);
}

function processAccountData(account, data) {
  try {
    data = JSON.parse(data);
    var bundle = {};
    bundle[account._id] = {
      total: +data.data.total_flow,
      unsold: +data.data.flow,
      sold: +data.data.sold,
      servertime: prettyTime(data.data.update_time)
    };
    io.sockets.emit('updateAccount', bundle);
  } catch(e) {}
}

function prettyTime(string) {
  var date = (new Date(string)).toJSON().split(/[-T:.]/);
  return date = date[1] + '-' + date[2] + ' ' + date[3] + ':' + date[4];
}

function processMinerData(account, data) {
  data = JSON.parse(data);
  if (!data.data.stats) {
    return sendData(account, { error: 'expired' });
  }
  var miners = [];
  for (var i = 0; i < data.data.stats.length; i++) {
    var miner = data.data.stats[i];
    miners.push({
      ip: miner.ip,
      speed: miner.speed,
      total: +miner.total_mineral,
      today: +miner.today_mineral,
      yesterday: +miner.yes_mineral,
      servertime: prettyTime(miner.update_time),
      status: miner.status
    });
  }
  return sendData(account, {
    updated: +new Date,
    miners: miners
  });
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function restartTimers() {
  cancelTimers();
  db.accounts.find({}, function(err, accounts) {
    if (err) return;
    for (var i = 0; i < accounts.length; i++) {
      var account = accounts[i];
      getData(account, getRandomInt(0, 5000));
    }
  });
}

io.sockets.on('connection', function(socket) {
  db.accounts.find({}, function(err, accounts) {
    if (err) return;
    for (var i = 0; i < accounts.length; i++) {
      var data = JSON.parse(accounts[i].data);
      socket.emit('update', data);
    }
  });
});

process.on('SIGINT', function() {
  for (var s in io.sockets.sockets) {
    io.sockets.sockets[s].disconnect();
  }
  process.exit(0);
});

var timers = {};

function cancelTimers() {
  for (var timer in timers) {
    clearTimeout(timers[timer]);
  }
  timers = {};
}

restartTimers();
