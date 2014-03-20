module.exports = {};

module.exports.start = function() {
  this.loop(30000);
};

module.exports.loop = function(wait) {
  var self = this;
  var now = new Date;
  var hour = now.getHours();
  var promise;

  // 9:00 ~ 17:59
  if (hour >= 9 && hour <= 17) {
    promise = self.getHttpData('/index.php/transaction/get_market_overview');
  } else {
    var deferred = self.Q.defer();
    deferred.resolve();
    promise = deferred.promise;
  }

  promise = promise.then(function(data) {
    if (!data) return;

    data = JSON.parse(data);
    if (data.data.length === 0) return;

    var H = [];
    var date = new Date;
    for (var i = 0; i < data.data.length; i++) {
      var d = data.data[i];
      date = new Date(d.createtime);
      H.push([ +date, +d.price, +d.mineral ]);
    }
    var slug = prettyDate(date);
    self.db.marketDay.findOne({
      name: slug
    }, function(err, doc) {
      doc = doc || { data: '' };
      var data = JSON.stringify(H);
      if (doc.data.length === data.length || doc.data === data) return;
      self.db.marketDay.update({
        name: slug
      }, {
        name: slug,
        data: data
      }, {
        upsert: true
      }, function() {
        self.db.marketDay.persistence.compactDatafile();
      });
    });
  });

  promise.finally(function() {
    var timeout = setTimeout(function() {
      self.loop(wait);
    }, wait);

    self.reset().add(+(new Date), timeout);
  });
};

function f(n) {
  return n < 10 ? '0' + n : n;
}

function prettyDate(date) {
  return date.getFullYear() + '-' + f(date.getMonth() + 1) + '-' +
    f(date.getDate());
}
