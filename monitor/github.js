module.exports = {};

module.exports.start = function() {
  this.loop(this.configs['github-update-interval'] || (1000 * 60 * 60));
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
        }, function() { /* make sequence promise continue; */});
      });
    }, self.Q());
  }).

  then(function() {
    if (hour < 9 || hour > 17) return;
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
    var deferred = self.Q.defer();
    self.db.minerStat.find({}, function(err, docs) {
      if (err || !docs) {
        return deferred.reject();
      }
      deferred.resolve(docs);
    });
    return deferred.promise;
  }).

  then(function(docs) {
    if (!(docs instanceof Array)) return;
    var data = docs.map(function(d) {
      return d.data;
    });
    if (!data[0]) return;
    var filepath = formatUsersHistoryFileName(data[0][0] * 1000);
    var l = data[0].length;
    // var colMax = Array.apply(null, new Array(l)).map(function() { return 0; });
    var colMax = [ 10, 11, 17, 7, 7, 7, 9, 4 ];
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
    return pushToGitHub.call(
      self,
      'miners history',
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

function f(n) { return n < 10 ? '0' + n : n; }

function formatUsersHistoryFileName(str) {
  var date = new Date(str);
  var y = date.getFullYear();
  var m = f(date.getMonth() + 1);
  var d = f(date.getDate());
  return '/miners/' + y + m + '/miners-' + y + '-' + m + '-' + d + '.json';
}
function formatDayHistoryFileName(str) {
  var date = new Date(str);
  return '/history/' + date.getFullYear() + f(date.getMonth() + 1) +
    '/history-' + str + '.json';
}

function isToday(str) {
  if (!str) return false;
  var date = new Date(str);
  if (isNaN(date)) return false;
  var now = new Date;
  if (date.getFullYear() !== now.getFullYear()) return false;
  if (date.getMonth() + 1 !== now.getMonth() + 1) return false;
  if (date.getDate() !== now.getDate()) return false;
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
    }
  }, function(err) {
    console.error('github [' + type + '] error:', err);
    if (throwErrorAtTheEnd) throw err;
  });
}
