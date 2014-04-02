module.exports = {};

module.exports.start = function() {
  this.loop(1000 * 60 * 30);
};

module.exports.loop = function(wait) {
  var self = this;
  var now = new Date;
  var hour = now.getHours();
  var offset = (new Date).getTimezoneOffset() * 60000;

  self.Q().

  then(function() {
    if (hour < 9 || hour > 17) return;
    var deferred = self.Q.defer();
    self.db.marketDay.find({}).sort({ name: 1 }).exec(function(err, docs) {
      if (err || !docs) {
        return deferred.reject();
      }
      deferred.resolve(docs);
    });
    return deferred.promise;
  }).

  then(function(docs) {
    if (!(docs instanceof Array)) return;
    return docs.reduce(function(prev, cur) {
      return prev.then(function() {
        if (cur.github && !isToday(cur.name)) return;
        var name = cur.name;
        data = JSON.parse(cur.data);
        data.forEach(function(d) {
          d[0] /= 1000;
        });
        data.reverse();
        var string = JSON.stringify(data, null, 2);
        string = string.replace(/\n\s{4}/g, ' ');
        string = string.replace(/\n\s{2}\]/g, ' ]');
        string = string.replace(/,\s(\d+)(\.\d+|),\s(\d+)/g,
          function(s, p1, p2, p3) {
          return ' , ' + p1 + p2 + Array(3 - p2.length + 1).join(' ') +
            ' , ' + p3 + Array(7 - p3.length + 1).join(' ');
        });
        var throwErrorAtTheEnd;
        return pushToGitHub.call(
          self,
          'history of ' + name,
          formatDayHistoryFileName(name),
          string,
          throwErrorAtTheEnd = true
        ).then(function() {
          self.db.marketDay.update({
            _id: cur._id
          }, { $set: { github: true } });
        }, function() { /* make sequence promise continue; */ });
      });
    }, self.Q());
  }).

  then(function() {
    if (hour !== 17) return;
    var deferred = self.Q.defer();
    self.db.marketHistory.findOne({
      name: 'market-overiew-180'
    }, function(err, doc) {
      if (err || !doc) {
        return deferred.reject();
      }
      deferred.resolve(doc.data);
    });
    return deferred.promise;
  }).

  then(function(data) {
    if (!data) return;
    data = JSON.parse(data);
    data.forEach(function(d) {
      delete d._price;
      delete d._volume;
      d.date -= offset;
      d.date /= 1000;
      d.price = +d.price;
    });
    data.reverse();
    var string = JSON.stringify(data, null, 2);
    string = string.replace(/\n\s{4}/g, ' ');
    string = string.replace(/\n\s{2}\}/g, ' }');
    string = string.replace(/"date"\:\s\d+/g, function(s, p1) {
      return s + ' ';
    });
    string = string.replace(/"price"\:\s\d+(\.\d+|)/g, function(s, p1) {
      return s + Array(3 - p1.length + 2).join(' ');
    });
    string = string.replace(/"volume"\:\s(\d+)/g, function(s, p1) {
      return s + Array(8 - p1.length + 1).join(' ');
    });
    return pushToGitHub.call(
      self,
      'market history',
      '/history/all.json',
      string
    );
  }).

  then(function() {
    var now = new Date();

    var day = now.getUTCDate();
    var lastMonth = new Date(now.getUTCFullYear(), now.getUTCMonth());
    var utc = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1);

    var prev = lastMonth.getUTCFullYear() + '-' + f(lastMonth.getUTCMonth() + 1);
    var cur = utc.getUTCFullYear() + '-' + f(utc.getUTCMonth() + 1);

    return [prev, cur].reduce(function(previous, current) {
      return previous.then(function() {
        var deferred = self.Q.defer();
        self.db.marketHistory.findOne({
          name: 'mineral-' + current
        }, function(err, doc) {
          deferred.resolve(doc);
        });
        return deferred.promise;
      }).then(function(data) {
        // for last month, don't check it after the second day
        if (current === prev && day > 1) return;
        if (!data) return;

        data = JSON.parse(data.data);
        var colMax = [ 4, 2, 2, 2, 9, 8, 8, 9, 11, 7 ];
        var l = colMax.length;
        var string = JSON.stringify(data, null, 2);
        var i = 0;
        string = string.replace(/^(\s{4})(.+?)(,?)$/mg, function(s, p1, p2, p3) {
          var x = colMax[(i % l)] - p2.length + 2;
          i += 1;
          return p1 + p2 + (x > 0 ? Array(x).join(' ') : '') + p3;
        });
        string = string.replace(/\n\s{4}/g, ' ');
        string = string.replace(/\n\s{2}\]/g, ']');
        return pushToGitHub.call(
          self,
          'mineral hour history',
          '/mineral/' + current + '.json',
          string
        );
      });
    }, self.Q());
  }).

  then(function() {
    // yesterday:
    var deferred = self.Q.defer();
    self.db.minerStat.find({ updated: { $lt: todayAtZeroAM() / 1000 } }).
      sort({ updated: 1 }).exec(function(err, docs) {
      if (err || !docs) {
        return deferred.reject();
      }
      deferred.resolve(docs);
    });
    return deferred.promise;
  }).

  then(function(docs) {
    if (!(docs instanceof Array) || docs.length === 0) return;
    var yesterday = yesterdayAtZeroAM();
    var filepath = formatUsersHistoryFileName(yesterday);
    var data = docs.map(function(d) { return d.data; });
    var string = prettifyMinersData(data);
    var throwErrorAtTheEnd;
    return pushToGitHub.call(
      self,
      'miners history of ' + getDate(yesterday).f,
      filepath,
      string,
      throwErrorAtTheEnd = true
    ).then(function() {
      self.db.minerStat.remove({
        updated: { $lt: todayAtZeroAM() }
      }, { multi: true }, function (err, numRemoved) {
        console.log(numRemoved, 'old items removed');
      });
    }, function() {});
  }, function() {}).

  then(function() {
    // today:
    var deferred = self.Q.defer();
    self.db.minerStat.find({ updated: { $gte: todayAtZeroAM() / 1000 } }).
      sort({ updated: 1 }).exec(function(err, docs) {
      if (err || !docs) {
        return deferred.reject();
      }
      deferred.resolve(docs);
    });
    return deferred.promise;
  }).

  then(function(docs) {
    if (!(docs instanceof Array) || docs.length === 0) return;
    var today = todayAtZeroAM();
    var filepath = formatUsersHistoryFileName(today);
    var data = docs.map(function(d) { return d.data; });
    var string = prettifyMinersData(data);
    return pushToGitHub.call(
      self,
      'miners history of ' + getDate(today).f,
      filepath,
      string
    );
  }).

  finally(function() {
    var timeout = setTimeout(function() {
      self.loop(wait);
    }, wait);

    self.reset().add(+(new Date), timeout);
  });

};

function prettifyMinersData(data) {
  // var l = data[0].length;
  // var colMax = Array.apply(null, new Array(l)).map(function() { return 0; });
  var colMax = [ 10, 11, 17, 7, 7, 7, 9, 4 ];
  var l = colMax.length;
  data.sort(function(a, b) {
    if (!/^\d+\./.test(a[2])) a[2] = '\u0000';
    // for (var i = 0; i < a.length; i++) {
    //   var len = String(a[i]).length;
    //   if (typeof(a[i]) === 'string') len += 2;
    //   if (len > colMax[i]) colMax[i] = len;
    // }
    if (a[2] > b[2]) {
      return -1;
    } else if (a[2] === b[2]) {
      return a[0] > b[0] ? -1 : 1;
    }
    return 1;
  });
  var string = JSON.stringify(data, null, 2);
  string = string.replace(/\\u0000/g, Array(colMax[2] - 1).join('-'));
  var i = 0;
  string = string.replace(/^(\s{4})(.+?)(,?)$/mg, function(s, p1, p2, p3) {
    var x = colMax[(i % l)] - p2.length + 2;
    i += 1;
    return p1 + p2 + (x > 0 ? Array(x).join(' ') : '') + p3;
  });
  string = string.replace(/\n\s{4}/g, ' ');
  string = string.replace(/\n\s{2}\]/g, ']');
  return string;
}

function f(n) { return n < 10 ? '0' + n : n; }

function getDate(str) {
  var date = new Date(str);
  var y = date.getUTCFullYear();
  var m = f(date.getUTCMonth() + 1);
  var d = f(date.getUTCDate());
  return {
    y: y,
    m: m,
    d: d,
    f: y + '-' + m + '-' + d
  };
}

function formatUsersHistoryFileName(str) {
  var date = getDate(str);
  return '/miners/' + date.y + date.m + '/miners-' + date.f + '.json';
}

function formatDayHistoryFileName(str) {
  var date = new Date(str);
  return '/history/' + date.getUTCFullYear() + f(date.getUTCMonth() + 1) +
    '/history-' + str + '.json';
}

function yesterdayAtZeroAM() {
  var now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1);
}

function todayAtZeroAM() {
  var now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function isToday(str) {
  if (!str) return false;
  var date = new Date(str);
  if (isNaN(date)) return false;
  var now = new Date;
  if (date.getUTCFullYear() !== now.getUTCFullYear()) return false;
  if (date.getUTCMonth() + 1 !== now.getUTCMonth() + 1) return false;
  if (date.getUTCDate() !== now.getUTCDate()) return false;
  return true;
}

function compareBuffers(a, b) {
  if (!Buffer.isBuffer(a)) return undefined;
  if (!Buffer.isBuffer(b)) return undefined;
  if (a.length !== b.length) return false;

  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

function pushToGitHub(type, filepath, content, throwErrorAtTheEnd) {
  var self = this;
  var buffer = Buffer(content);
  return self.connectGitHub(filepath).

  then(function(res) {
    var resBuffer = Buffer(res.content, 'base64');
    var same = compareBuffers(resBuffer, buffer);
    if (same === undefined) throw 'response is not a buffer';
    if (same === true) return 'no need to update ' + res.html_url;

    var message = 'Update ' + type + ': ';
    message += resBuffer.length + ' -> ' + buffer.length + ' bytes';
    return {
      data: buffer,
      filepath: filepath,
      sha: res.sha,
      message: message
    };
  }, function(error) {
    if (error.statusCode !== 404) throw error;
    return {
      data: buffer,
      filepath: filepath,
      message: 'Create ' + type + ': ' + buffer.length + ' bytes.'
    };
  }).

  then(function(content) {
    if (typeof content !== 'object' || !content.filepath) return content;
    var path = content.filepath;
    var data = {
      message: content.message,
      content: content.data.toString('base64')
    };
    if (content.sha) {
      data.sha = content.sha;
    }
    data = JSON.stringify(data);
    return self.connectGitHub(path, 'PUT', data);
  }).

  then(function(content) {
    if (typeof content === 'string') {
      console.log('github [' + type + '] log:', content);
    } else if (typeof content === 'object') {
      console.log('github [' + type + '] updated:', content.commit.html_url);
      var headers = content['$headers'] || {};
      console.log('github ratelimit:', +headers['x-ratelimit-remaining'], '/',
        +headers['x-ratelimit-limit']);
    }
  }, function(err) {
    console.error('github [' + type + '] error:', err);
    if (throwErrorAtTheEnd) throw err;
  });
}
