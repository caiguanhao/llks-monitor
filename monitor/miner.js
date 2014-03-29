module.exports = {};

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports.start = function() {
  var self = this;
  self.db.accounts.find({}, function(err, accounts) {
    if (err) return;
    for (var i = 0; i < accounts.length; i++) {
      var account = accounts[i];
      self.loop(account, getRandomInt(0, 5000));
    }
  });
};

module.exports.loop = function(account, wait) {
  var self = this;
  var code = account.code;
  var DATA;

  self.Q.

  fcall(function() {
    DATA = null;
  }).

  then(function(data) {
    return self.getHttpData('/dig/miner/log/', code);
  }).

  then(function(data) {
    data = JSON.parse(data);
    if (!data.data.stats) return { error: 'expired' };
    var miners = [];
    // first item is the sum of others
    for (var i = 1; i < data.data.stats.length; i++) {
      var miner = data.data.stats[i];
      miners.push({
        ip: miner.ip,
        speed: miner.speed,
        total: +miner.total_mineral,
        today: +miner.today_mineral,
        yesterday: +miner.yes_mineral,
        servertime: +new Date(miner.update_time),
        status: miner.status
      });
    }
    DATA = {
      updated: +new Date,
      miners: miners
    };
    return DATA;
  }).

  then(function(data) {
    var bundle = {};
    bundle[account._id] = data;
    self.db.accounts.update({ _id: account._id }, { $set: {
      data: JSON.stringify(bundle)
    } }, {}, function() {
      self.db.accounts.persistence.compactDatafile();
    });
    self.io.of('/private').emit('UpdateMiners', bundle);
  }).

  then(function() {
    return self.getHttpData('/index.php/transaction/get_current_price');
  }).

  then(function(data) {
    try {
      var marketData = JSON.parse(data);
      var bundle = {};
      bundle[account._id] = {
        price: +marketData.data.price
      };
      self.db.accounts.update({ _id: account._id }, { $set: bundle[account._id] });
      self.io.of('/private').emit('updateAccount', bundle);
    } catch(e) {}
  }).

  then(function(data) {
    return self.getHttpData('/dig/miner/stats/', code);
  }).

  then(function(data) {
    try {
      var accountData = JSON.parse(data);
      var bundle = {};
      bundle[account._id] = {
        total: +(+accountData.data.total_flow).toFixed(2),
        unsold: +(+accountData.data.flow).toFixed(2),
        sold: +(+accountData.data.sold).toFixed(2)
      };
      self.db.accounts.update({ _id: account._id }, { $set: bundle[account._id] });
      self.io.of('/private').emit('updateAccount', bundle);
    } catch(e) {}
  }).

  then(function() {
    return self.getHttpData('/index.php/account/info', code);
  }).

  then(function(data) {
    if (!data || typeof data !== 'string') return;
    data = data.replace(/(<([^>]+)>)/g, '').replace(/[\r\n\s]+/g, '');
    var totalValue = data.match(/账户总值￥(\d+\.?\d+)/);
    if (totalValue) {
      var bundle = {};
      bundle[account._id] = {
        totalValue: +totalValue[1]
      };
      self.db.accounts.update({ _id: account._id }, { $set: bundle[account._id] });
      self.io.of('/private').emit('updateAccount', bundle);
    }
  }).

  then(function() {
    var miners = [];
    DATA.miners.forEach(function(miner) {
      var times = miner.speed.indexOf('M/S') !== -1 ? 1024 : 1;
      var speed = parseFloat(miner.speed);
      if (isNaN(speed)) speed = 0;
      miners.push([
        miner.servertime / 1000,
        account.name,
        miner.ip,
        speed * times,
        miner.yesterday,
        miner.today,
        miner.total,
        miner.status
      ]);
    });
    var check = self.Q().then(function() {
      var deferred = self.Q.defer();
      self.db.minerStat.count({}, function(err, count) {
        if (err) return deferred.reject(err);
        if (count > 2000) {
          return deferred.reject('too many documents! aborted!');
        }
        deferred.resolve();
      });
      return deferred.promise;
    });
    return miners.reduce(function(prev, cur) {
      return prev.then(function() {
        var deferred = self.Q.defer();
        self.db.minerStat.update({
          time: cur[0],
          ip: cur[2]
        }, {
          time: cur[0],
          ip: cur[2],
          data: cur
        }, { upsert: true }, function() {
          deferred.resolve();
        });
        return deferred.promise;
      });
    }, check).
    then(function() {
      self.db.minerStat.persistence.compactDatafile();
    }).
    catch(function(err) {
      console.error('miner-stat:', err);
    });
  }).

  finally(function() {
    var timeout = setTimeout(function() {
      self.loop(account);
    }, wait || self.configs['miner-update-interval'] || 5000);
    self.add(account._id, timeout);
  });
};
