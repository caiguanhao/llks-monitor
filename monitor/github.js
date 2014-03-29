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
    return string;
  }).

  then(function(string) {
    if (!string) return;
    var buffer = Buffer(string);
    var filepath = '/data/history.json';
    return self.connectGitHub(filepath).then(function(res) {

      var resBuffer = Buffer(res.content, 'base64');
      var same = compareBuffers(resBuffer, buffer);
      if (same === undefined) throw 'response is not a buffer';
      if (same === true) throw 'no need to update ' + res.html_url;

      var message = 'Update market history: ';
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
        message: 'Create market history: ' + buffer.length + ' bytes.'
      };
    });
  }).

  then(function(content) {
    if (typeof content !== 'object' || !content.filepath) return;
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

  then(function(res) {
    if (!res) return;
    console.log('github updated:', res.commit.html_url);
  }, function(err) {
    console.error('github error:', err);
  }).

  finally(function() {
    var timeout = setTimeout(function() {
      self.loop(wait);
    }, wait);

    self.reset().add(+(new Date), timeout);
  });

};

function compareBuffers(a, b) {
  if (!Buffer.isBuffer(a)) return undefined;
  if (!Buffer.isBuffer(b)) return undefined;
  if (a.length !== b.length) return false;

  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}
