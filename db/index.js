var Datastore = require('nedb');
var bcrypt = require('bcrypt');

module.exports = {};

var users = new Datastore({
  filename: __dirname + '/.users',
  autoload: true
});
users.ensureIndex({
  fieldName: 'username',
  unique: true
});
module.exports.users = users;


var accounts = new Datastore({
  filename: __dirname + '/.accounts',
  autoload: true
});
accounts.ensureIndex({
  fieldName: 'name',
  unique: true
});
module.exports.accounts = accounts;


var minerStat = new Datastore({
  filename: __dirname + '/.miner-stat',
  autoload: true
});
module.exports.minerStat = minerStat;


var marketHistory = new Datastore({
  filename: __dirname + '/.market-history',
  autoload: true
});
marketHistory.ensureIndex({
  fieldName: 'name',
  unique: true
});
module.exports.marketHistory = marketHistory;


var marketDay = new Datastore({
  filename: __dirname + '/.market-day',
  autoload: true
});
marketDay.ensureIndex({
  fieldName: 'name',
  unique: true
});
module.exports.marketDay = marketDay;

module.exports.createAccount = function(name, code, user, callback) {
  var newDate = new Date;
  accounts.insert({
    user: user._id,
    name: name,
    code: code,
    created_at: newDate,
    updated_at: newDate
  }, callback);
};

var hashPassword = function(password) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(10));
};

module.exports.hashPassword = hashPassword;

var checkPassword = function(value) {
  if (!value || typeof value !== 'string') return false;
  return value.length >= 3 && value.length <= 20;
};

module.exports.checkPassword = checkPassword;

module.exports.createUser = function(username, password, callback) {
  var newDate = new Date;
  users.insert({
    username: username,
    password: hashPassword(password),
    banned: false,
    token: generateNewToken(),
    token_updated_at: newDate,
    login_attempts: 0,
    lock_until: null,
    created_at: newDate,
    updated_at: newDate,
    last_logged_in_at: [ newDate ],
    password_updated_at: newDate
  }, callback);
};

var comparePassword = function(hash, toCompare) {
  if (!hash || !toCompare) return false;
  return bcrypt.compareSync(toCompare, hash);
};

var generateNewToken = function() {
  return require('crypto').randomBytes(32).toString('hex');
};

var isUserLocked = function(user) {
  return !!(user.lock_until && user.lock_until > Date.now());
};

var CONST = {
  MAX_ATTEMPTS: 10,
  LOCK_TIME: 2 * 60 * 60 * 1000,
  INVALID: 1,
  LOCKED: 2,
  BANNED: 3,
  SUCCESS: 4
};

module.exports.authConst = CONST;

module.exports.authenticate = function(username, password, options, callback) {
  options = options || {};
  users.findOne({ username: username }, function(err, user) {
    if (err || !user) return callback(CONST.INVALID);

    if (isUserLocked(user)) {
      return callback(CONST.LOCKED);
    }

    if (comparePassword(user.password, password)) {
      user.lock_until = undefined;
      user.login_attempts = 0;
    } else {
      if (user.lock_until && user.lock_until < Date.now()) {
        // clearing previous expired attempts
        users.update({
          _id: user._id
        }, {
          $set: { login_attempts: 1 },
          $unset: { lock_until: 1 }
        }, {}, function(err) {
          callback(CONST.INVALID);
        });
      } else {
        var update = { $inc: { login_attempts: 1 } };
        if (user.login_attempts + 1 >= CONST.MAX_ATTEMPTS &&
          !isUserLocked(user)) {
          update.$set = {
            lock_until: Date.now() + CONST.LOCK_TIME,
            token: generateNewToken()
          };
        }
        users.update({
          _id: user._id
        }, update, {}, function(err) {
          callback(CONST.INVALID);
        });
      }
      return;
    }

    if (user.banned) return callback(CONST.BANNED);

    if (options.dry) {
      return callback(CONST.SUCCESS, user);
    }

    // update user login info:

    var new_date = new Date;
    if (user.last_logged_in_at instanceof Array) {
      user.last_logged_in_at.unshift(new_date);
      user.last_logged_in_at.splice(3);
    } else {
      user.last_logged_in_at = [ new_date ];
    }

    user.token = generateNewToken();
    user.token_updated_at = new_date;

    users.update({
      _id: user._id
    }, user, {}, function(err) {
      if (err) {
        callback(CONST.INVALID);
      } else {
        callback(CONST.SUCCESS, user);
      }
    });
  });
};
