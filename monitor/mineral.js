module.exports = {};

module.exports.start = function() {
  this.loop(1000 * 60 * 10);
};

module.exports.loop = function(wait) {
  var self = this;
  var now = new Date;
  var minute = now.getMinutes();

  self.Q.

  fcall(function() {
    var deferred = self.Q.defer();
    self.db.accounts.findOne({}, function(err, doc) {
      if (err) {
        deferred.reject(err);
      } else {
        deferred.resolve(doc);
      }
    });
    return deferred.promise;
  }).

  then(function(account) {
    if (minute < 15) {
      return self.getHttpData('/dig/stats/', account.code);
    }
  }).

  then(function(data) {
    if (!data) return;
    data = JSON.parse(data) || {};
    data = data.data;
    if (!data) return;
    if (!data.his_stats || data.his_stats.length === 0) return;

    var dates = [];
    for (var i = 0; i < data.his_stats.length; i++) {
      var time = data.his_stats[i].time.split(/\s|\//);
      var date = new Date(time[0], +time[1] - 1, time[2], time[3]);
      var s = date.getUTCFullYear() + '-' + f(date.getUTCMonth() + 1);
      if (dates.indexOf(s) === -1) dates.push(s);
    }
    return dates.reduce(function(prev, cur) {
      return prev.
      then(function() {
        var deferred = self.Q.defer();
        self.db.marketHistory.findOne({
          name: 'mineral-' + cur
        }, function(err, doc) {
          if (err || !doc || !doc.data) {
            deferred.reject(err);
          } else {
            deferred.resolve(doc);
          }
        });
        return deferred.promise;
      }).
      then(function(doc) {
        var docdata = JSON.parse(doc.data);
        var first = docdata[0];
        var time = data.his_stats[0].time.split(/\s|\//);
        var date = new Date(time[0], +time[1] - 1, time[2], time[3]);
        var s = date.getUTCFullYear() + '-' + f(date.getUTCMonth() + 1);
        if (s !== cur) return;
        if (first[0] === date.getUTCFullYear() &&
            first[1] === date.getUTCMonth() + 1 &&
            first[2] === date.getUTCDate() &&
            first[3] === date.getUTCHours()) {
          return;
        }
        docdata.unshift([
          date.getUTCFullYear(),
          date.getUTCMonth() + 1,
          date.getUTCDate(),
          date.getUTCHours(),
          +(+data.his_stats[0].rate).toFixed(2),
          +(+data.his_stats[0].hour_mineral).toFixed(2),
          +(+data.his_stats[0].co_mineral).toFixed(2),
          +(+data.latest.today).toFixed(2),
          +(+data.latest.total_mineral).toFixed(2),
          parseFloat(data.factor)
        ]);
        return docdata;
      }, function() {
        var H = [];
        for (var i = 0; i < data.his_stats.length; i++) {
          var time = data.his_stats[i].time.split(/\s|\//);
          var date = new Date(time[0], +time[1] - 1, time[2], time[3]);
          var s = date.getUTCFullYear() + '-' + f(date.getUTCMonth() + 1);
          if (s !== cur) continue;
          H.push([
            date.getUTCFullYear(),
            date.getUTCMonth() + 1,
            date.getUTCDate(),
            date.getUTCHours(),
            +(+data.his_stats[i].rate).toFixed(2),
            +(+data.his_stats[i].hour_mineral).toFixed(2),
            +(+data.his_stats[i].co_mineral).toFixed(2),
            +(+data.latest.today).toFixed(2),
            +(+data.latest.total_mineral).toFixed(2),
            parseFloat(data.factor)
          ]);
        }
        return H;
      }).
      then(function(updatedata) {
        if (!updatedata) return;
        var deferred = self.Q.defer();
        self.db.marketHistory.update({
          name: 'mineral-' + cur
        }, {
          name: 'mineral-' + cur,
          data: JSON.stringify(updatedata)
        }, { upsert: true }, function() {
          self.db.marketHistory.persistence.compactDatafile();
          deferred.resolve();
        });
        return deferred.promise;
      }).
      catch(function(e) {
        console.error('mineral error:', e);
      });
    }, self.Q());
  }).

  catch(function(e) {
    console.error('mineral error:', e);
  }).

  finally(function() {
    var timeout = setTimeout(function() {
      self.loop(wait);
    }, wait);

    self.reset().add(+(new Date), timeout);
  });
};

function f(n) { return n < 10 ? '0' + n : n; }
