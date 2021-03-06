var https = require('https');
var Q = require('q');
var configs = require('../config');

function Monitor(options, dependencies) {

  options = options || {};
  dependencies = dependencies || {};

  for (var dependency in dependencies) {
    this[dependency] = dependencies[dependency];
  }

  this.timeouts = {};

  this.start = function() {};
  if (typeof options.start === 'function') {
    this.start = options.start;
  }

  this.loop = function() {};
  if (typeof options.loop === 'function') {
    this.loop = options.loop;
  }

  this.reset = function() {
    this.timeouts = {};
    return this;
  };

  this.stop = function() {
    for (var timeout in this.timeouts) {
      clearTimeout(this.timeouts[timeout]);
    }
    this.reset();
  };

  this.restart = function() {
    this.stop.call(this);
    this.start.call(this);
  };

  this.add = function(key, timeout) {
    this.timeouts[key] = timeout;
    return this;
  };

  this.Q = Q;

  this.configs = configs || {};

  this.getHttpData = function(location, code) {
    var deferred = Q.defer();
    var request = https.get({
      hostname: 'jiaoyi.yunfan.com',
      port: 443,
      path: location,
      headers: code ? {
        Cookie: 'ntts_kb_session_id=' + code + ';'
      } : undefined
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
    request.setTimeout(1000 * 20, function() {
      request.abort();
      deferred.reject('timeout');
    });
    request.end();
    return deferred.promise;
  };

  this.connectGitHub = function(location, method, data) {
    var token = configs['github-token'];
    var userRepo = configs['github-username-repo'];
    if (!token) return Q.reject('empty token.');
    if (!userRepo) return Q.reject('empty username/repo.');

    var deferred = Q.defer();
    var headers = {
      'User-Agent': 'caiguanhao@gmail.com',
      Authorization: 'token ' + token
    };
    if (data) {
      headers['Content-Length'] = data.length;
    }
    var path;
    if (/^https?\:\/\//.test(location)) {
      path = location;
    } else {
      path = '/repos/' + userRepo + '/contents' + location;
    }
    var request = https.get({
      hostname: 'api.github.com',
      port: 443,
      path: path,
      method: method || 'GET',
      headers: headers
    }, function (res) {
      var data = '';
      res.on('data', function(chunk) {
        data += chunk;
      });
      res.on('end', function() {
        var object;
        try {
          object = JSON.parse(data);
        } catch(e) {}
        if (!object || res.statusCode < 200 || res.statusCode > 299) {
          if (!object) object = {};
          object.statusCode = res.statusCode;
          return deferred.reject(object);
        }
        object['$headers'] = res.headers;
        deferred.resolve(object);
      });
    });
    request.on('error', function(error) {
      deferred.reject(error);
    });
    request.setTimeout(1000 * 60, function() {
      request.abort();
      deferred.reject('timeout');
    });
    if (data) {
      request.write(data);
    }
    request.end();
    return deferred.promise;
  };

}

module.exports = Monitor;
