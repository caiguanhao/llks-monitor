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

module.exports.accounts = new Datastore({
  filename: __dirname + '/.accounts',
  autoload: true
});

var hashPassword = function(password) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(10));
};

module.exports.createUser = function(username, password, callback) {
  users.insert({
    username: username,
    password: hashPassword(password)
  }, callback);
};
