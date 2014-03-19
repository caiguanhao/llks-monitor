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

  self.getHttpData('/dig/miner/log/', code).

  then(function(data) {
    data = JSON.parse(data);
    if (!data.data.stats) return { error: 'expired' };
    var miners = [];
    for (var i = 0; i < data.data.stats.length; i++) {
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
    return {
      updated: +new Date,
      miners: miners
    };
  }).

  then(function(data) {
    var bundle = {};
    bundle[account._id] = data;
    self.db.accounts.update({ _id: account._id }, { $set: {
      data: JSON.stringify(bundle)
    } }, {}, function() {
      self.db.accounts.persistence.compactDatafile();
    });
    self.io.sockets.emit('UpdateMiners', bundle);
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
      self.io.sockets.emit('updateAccount', bundle);
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
        total: +accountData.data.total_flow,
        unsold: +accountData.data.flow,
        sold: +accountData.data.sold
      };
      self.db.accounts.update({ _id: account._id }, { $set: bundle[account._id] });
      self.io.sockets.emit('updateAccount', bundle);
    } catch(e) {}
  }).

  finally(function() {
    var timeout = setTimeout(function() {
      self.loop(account);
    }, wait || 5000);
    self.add(account._id, timeout);
  });
};
