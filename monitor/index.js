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
    request.setTimeout(3000, function() {
      request.abort();
      deferred.reject('timeout');
    });
    return deferred.promise;
  };

}

module.exports = Monitor;
