var express = require('express');
var db = require('./db');

var app = express();

app.set('port', process.env.PORT || 3000);

app.use(express.bodyParser());
app.use(express.static(__dirname + '/public'));

app.post('/login', function(req, res, next) {
  db.authenticate(req.body.username, req.body.password, function(code, user) {
    switch (code) {
    case db.authConst.INVALID:
      res.status(401);
      res.send({ error: 'Invalid username or password.' });
      return;
    case db.authConst.LOCKED:
      res.writeHead(466, 'User Is Banned');
      res.end(JSON.stringify({ error: 'The account is temporarily locked ' +
        'due to too many failed login attempts.' }));
      return;
    case db.authConst.BANNED:
      res.writeHead(466, 'User Is Banned');
      res.end(JSON.stringify({ error: 'You are banned by administrators.' }));
      return;
    case db.authConst.SUCCESS:
      res.status(200);
      res.send({
        username: user.username,
        token: user.token
      });
      return;
    default:
      res.writeHead(499, 'Unknown Error');
      res.end(JSON.stringify({ error: 'Unknown Error.' }));
      return;
    }
  });
});

app.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
