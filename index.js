var express = require('express');
var db = require('./db');

var app = express();

app.set('port', process.env.PORT || 3000);

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
  db.accounts.find({}, function(err, accounts) {
    if (err) return serverUnavailable(res);
    res.status(200);
    res.send(accounts);
  });
}));

app.post('/accounts', authorize(function(req, res, next) {
  var name = req.body.name;
  var code = req.body.code;
  var user = req.user;
  db.createAccount(name, code, user, function(err, account) {
    if (err) return serverUnavailable(res);
    restartTimers();
    res.status(201);
    res.send(account);
  });
}));

var server = require('http').createServer(app);

server.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

var https = require('https');
var Q = require('q');
var io = require('socket.io').listen(server);

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
});

function resetTimers() {

}

function restartTimers() {
  // resetTimers();
  // startTimers();
}

function startTimers() {
  db.accounts.find({}, function(err, accounts) {
    if (err) return;
    var deferred = Q.defer();
    deferred.resolve();
    var promise = deferred.promise;
    for (var i = 0; i < accounts.length; i++) {
      var then = (function(account) {
        return function() {
          var deferred = Q.defer();
          https.get({
            hostname: 'jiaoyi.yunfan.com',
            port: 443,
            path: '/dig/miner/log/',
            headers: {
              Cookie: 'ntts_kb_session_id=' + account.code + ';'
            }
          }, function (res) {
            var data = '';
            res.on('data', function(chunk) {
              data += chunk;
            });
            res.on('end', function() {
              deferred.resolve(data);
            });
            res.on('error', function() {
              deferred.reject();
            });
          });
          return deferred.promise;
        };
      })(accounts[i]);
      promise = promise.then(then);

      var then = (function(account) {
        return function(data) {
          var data = JSON.parse(data);
          var miners = [];
          for (var i = 0; i < data.data.stats.length; i++) {
            var miner = data.data.stats[i];
            miners.push({
              ip: miner.ip,
              speed: miner.speed,
            });
          }
          var bundle = {};
          bundle[account.code] = {
            updated: +new Date,
            miners: miners
          };
          io.sockets.emit('update', bundle);
        };
      })(accounts[i]);
      promise = promise.then(then);
    }
    promise.then(function() {
      setTimeout(startTimers, 5000);
    });
  });
}

startTimers();
