module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    express: {
      server: {
        options: {
          script: '<%= pkg.main %>'
        }
      }
    },
    clean: {
      public_css: [ 'public/css/*.css' ],
      public_js: [ 'public/js/*.js' ],
      compressed: [ 'public/**/*.gz' ],
      generated: [
        'public/js/i18n.js',
        'public/js/i18n.js.gz',
        'public/js/templates.js',
        'public/js/templates.js.gz'
      ]
    },
    less: {
      llksMonitor: {
        files: {
          'public/css/llks-monitor.css': [ 'assets/css/llks-monitor.less' ]
        }
      }
    },
    watch: {
      options: {
        livereload: true
      },
      grunt: {
        files: [ 'Gruntfile.js' ]
      },
      express: {
        files: [ 'index.js', 'db/index.js', 'monitor/*.js' ],
        tasks: [ 'express' ],
        options: {
          spawn: false,
          livereload: false
        }
      },
      html: {
        files: [ 'index.html' ],
        tasks: [ 'copy-index' ]
      },
      css: {
        files: [ 'assets/css/**/*.css', 'assets/css/**/*.less' ],
        tasks: [ 'less' ]
      },
      js: {
        files: [ 'assets/js/**/*.js' ]
      },
      translations: {
        files: [ 'translations.json' ],
        tasks: [ 'translate' ]
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-express-server');

  grunt.registerTask('default', [
    'clean',
    'translate',
    'less',
    'copy-index',
    'express',
    'watch'
  ]);

  grunt.registerTask('production', [
    '_production',
    'clean',
    'less',
    'analyze',
    'translate',
    'uglify',
    'concat',
    'hash',
    'compress',
    'clean:generated'
  ]);

  grunt.registerTask('p', [
    'production',
    'express',
    'watch'
  ]);

  grunt.registerTask('copy-index', 'Copy index page', function() {
    grunt.file.copy('index.html', 'public/index.html');
    grunt.log.ok('Copied index.html to public/index.html.');
  });

  grunt.registerTask('adduser', 'adduser:username:password',
    function(username, password) {
    if (!username || !password) {
      grunt.fail.fatal('Please provide username and password');
    }
    var finish = this.async();
    var db = require('./db');
    db.createUser(username, password, function(err, user) {
      if (err) grunt.fail.fatal(err);
      console.log(user);
      finish();
    });
  });

  grunt.registerTask('config', function() {
    var defaults = {
      'miner-update-interval': {
        prompt: 'Update miners info for every how many milliseconds [1000-99999]: ',
        format: '^\\d{4,5}$',
        value: 5000
      },
      'market-day-update-interval': {
        prompt: 'Update market day info for every how many milliseconds [1000-99999]: ',
        format: '^\\d{4,5}$',
        value: 30000
      },
      'market-history-update-interval': {
        prompt: 'Update market history for every how many milliseconds [1000-99999]: ',
        format: '^\\d{4,5}$',
        value: 30000
      },
      'github-token': {
        prompt: '40 characters long GitHub personal access token: ',
        format: '^[a-f0-9]{40}$',
        value: ''
      },
      'github-username-repo': {
        prompt: 'GitHub username and repo name [foo/bar]: ',
        format: '^[A-Za-z0-9\\-_]+\\/[A-Za-z0-9\\-_]+$',
        value: 'choigoonho/llks-data'
      }
    };
    var configs = grunt.file.isFile('config.json') &&
      grunt.file.readJSON('config.json') || {};
    var finish = this.async();
    var readline = require('readline');
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    var Q = require('q');
    var deferred = Q.defer();
    deferred.resolve();
    var promise = deferred.promise;
    for (var c in defaults) {
      promise = promise.
      then((function(c) {
        return function() {
          var deferred = Q.defer();
          rl.setPrompt(defaults[c].prompt);
          rl.prompt();
          rl.write(String(configs[c] || defaults[c].value));
          rl.on('line', function(value) {
            value = value.trim();
            if ((new RegExp(defaults[c].format, 'i')).test(value)) {
              deferred.resolve(value);
            } else {
              rl.prompt();
            }
          });
          return deferred.promise;
        };
      })(c)).
      then((function(c) {
        return function(value) {
          configs[c] = isNaN(+value) ? value : +value;
        };
      })(c));
    }
    promise.then(function() {
      rl.close();
      var _c = {};
      for (var d in defaults) {
        _c[d] = configs[d];
      }
      grunt.file.write('config.json', JSON.stringify(_c, null, 2) + '\n');
      grunt.log.ok('Configs written to config.json.');
      finish();
    });
  });

  grunt.registerTask('_production', 'Update configs for production mode.',
    function() {
    var less = grunt.config('less') || {};
    less.options = less.options || {};
    less.options.cleancss = true;
    grunt.config('less', less);
    grunt.JSONStringify = function(obj) {
      return JSON.stringify(obj);
    }
    grunt.log.ok('Updated Grunt configs.');
  });

  grunt.registerTask('compress', 'Compress assets files', function() {
    var finish = this.async();
    var fs = require('fs');
    var exec = require('child_process').exec;
    exec('gzip -f1k css/*.css js/*.js', {
      cwd: fs.realpathSync('public')
    }, function(error, stdout, stderr) {
      if (stderr) grunt.fail.fatal(stderr);
      if (error) grunt.fail.fatal(error);
      grunt.log.ok('Asset files compressed.')
      finish();
    });
  });

  grunt.registerTask('backupdb', 'backup database', function() {
    var finish = this.async();
    var exec = require('child_process').exec;
    var files = grunt.file.expand('backup/*.tar.gz');
    files.sort(function(a, b) {
      a = a.split(/\/|-|\./g);
      b = b.split(/\/|-|\./g);
      a = +new Date(+a[1], +a[2] - 1, +a[3], +a[4], +a[5], +a[6]);
      b = +new Date(+b[1], +b[2] - 1, +b[3], +b[4], +b[5], +b[6]);
      return a > b ? -1 : 1;
    });
    var max = 30;
    if (max > 0 && files.length > max - 1) {
      for (var i = max - 1; i < files.length; i++) {
        grunt.log.write('Deleting old backup file ' + files[i].cyan + '... ');
        grunt.file.delete(files[i]);
        grunt.log.ok();
      }
    }
    var date = (new Date).toJSON().replace(/\..*$/, '').replace(/[T:]+/g, '-');
    exec('mkdir -p backup && tar cfz backup/' + date + '.tar.gz db', {},
      function(error, stdout, stderr) {
      if (stderr) grunt.fail.fatal(stderr);
      if (error) grunt.fail.fatal(error);
      grunt.log.ok('Database backed up successfully.')
      finish();
    });
  });

  var htmlparser = require('htmlparser2');
  htmlparser.void_elements = ['area', 'base', 'br', 'col', 'embed', 'hr',
    'img', 'input', 'keygen', 'link', 'meta', 'param', 'source', 'track',
    'wbr'];

  grunt.registerTask('gettext', 'Get translations', function(lang) {
    if (!lang) grunt.fail.fatal('grunt gettext:<lang-code>');
    var translations = {};
    try {
      translations = grunt.file.readJSON('translations.json');
    } catch(e) {}
    translations[lang] = translations[lang] || {};
    var T = {};

    function add(str) {
      if (typeof str !== 'string') return;
      if (';:,./?-_+=|\\*&^%$#@!~'.indexOf(str[0]) > -1) {
        str = str.slice(1);
      }
      if (str) {
        str = str.trim();
        if (str[0] === '{' && str.slice(-1) === '}') {
          try {
            var obj = eval('(function(){return ' + str + ';})();');
            if (typeof obj === 'object') {
              for (var attr in obj) {
                add(obj[attr]);
              }
              return;
            }
          } catch(e) {}
        }
        str = str.replace(/[\n\s]{1,}/g, ' ');
      }
      if (str) {
        T[str] = translations[lang][str] || '';
      }
    }

    var parser = new htmlparser.Parser({
      onopentag: function(name, attribs) {
        for (var key in attribs) {
          if (key === 'i18n') {
            add(attribs[key]);
            continue;
          }
          var val = attribs[key].match(new RegExp(
            '{{\\s*i18n\\s*\\(\\s*([\\\'"])([\\S\\s]+?)\\1\\s*\\)\\s*}}'));
          if (val) {
            add(val[2]);
          }
        }
      },
      onend: function() {
        js();
        translations[lang] = T;
        var tStr = JSON.stringify(translations, null, 2);
        grunt.file.write('translations.json', tStr.trim() + '\n');
        grunt.log.ok('Done.');
      }
    });
    var index = grunt.file.read('index.html');
    index = index.replace(new RegExp('<script.*type="text\\/ng-template".*>' +
      '([\\s\\S]+?)</script>', 'g'), '<div>$1</div>');
    parser.write(index);
    parser.end();
    function js() {
      var js = grunt.file.read('assets/js/llks-monitor.js');
      jsgettext(js, '\\$scope\\.i18n\\$');
      js = grunt.file.read('index.js');
      jsgettext(js, '\\$\\$');
    }
    function jsgettext(content, funcName) {
      funcName = funcName || '\\$scope\\.i18n\\$';
      var r = funcName +
        '[\\s\\t]*\\([\\s\\t]*([\'"])([\\S\\s]+?)\\1[\\s\\t]*\\)';
      var m = content.match(new RegExp(r, 'g'));
      for (var i = 0; i < m.length; i++) {
        var t = m[i];
        // turn oneline concat string to multiline
        var s = t.split(/['"]/);
        s = s.map(function(S) {
          return /^[\s\t]*\+[\s\t]*$/.test(S) ?
            S.replace(/[\s\t]{1,}/g, '\n') : S });
        t = s.join('"');
        // multiline string:
        t = t.replace(/['"][\s\t]*\+[\s\t]*$/mg, '');
        t = t.replace(/^[\s\t]*['"][\s\t]*/mg, '');
        t = t.replace(/\n/g, '');
        t = t.match(new RegExp(r));
        add(t[2]);
      }
    }
  });

  grunt.registerTask('translate', 'Make i18n js file', function() {
    var i18n = ';llksMonitor.factory(\'I18N\', [function(){return ';
    var translations = {};
    try {
      translations = grunt.file.readJSON('translations.json');
    } catch(e) {}
    i18n += JSON.stringify(translations);
    i18n += ';}]);'
    grunt.file.write('public/js/i18n.js', i18n);
    grunt.log.ok('Generated public/js/i18n.js.');
  });

  grunt.registerTask('hash', 'Hash filenames of assets', function() {
    var prod_index = '';
    var index = grunt.file.read('public/index.html');
    var crypto = require('crypto'), fs = require('fs');
    var hashes = {};
    var parser = new htmlparser.Parser({
      onopentag: function(name, attribs) {
        if ((name === 'link' && attribs.rel === 'stylesheet') ||
          name === 'script') {
          var src_tag = 'src', ext = '';
          if (name === 'link') src_tag = 'href';
          var old_filename = 'public' + attribs[src_tag];
          if (fs.existsSync(old_filename)) {
            var js = fs.readFileSync(old_filename);
            shasum = crypto.createHash('sha1');
            shasum.update(js);
            var hash = shasum.digest('hex');
            hashes[attribs[src_tag]] = hash;
            var dot = attribs[src_tag].lastIndexOf('.');
            if (dot === -1) dot = undefined;
            var new_src = attribs[src_tag].slice(0, dot);
            new_src += '-' + hash + attribs[src_tag].slice(dot);
            var new_filename = 'public' + new_src;
            fs.renameSync(old_filename, new_filename);
            grunt.log.ok('File ' + old_filename + ' renamed to ' +
              new_filename);
            attribs[src_tag] = new_src;
          }
        }
        prod_index += '<' + name;
        for (var attrib in attribs) {
          prod_index += ' ' + attrib + '="' + attribs[attrib] + '"';
        }
        prod_index += '>';
      },
      ontext: function(text) {
        prod_index += text;
      },
      onclosetag: function(name) {
        if (htmlparser.void_elements.indexOf(name.toLowerCase()) > -1) return;
        prod_index += '</' + name + '>';
      },
      onprocessinginstruction: function(name, data) {
        prod_index += '<' + data + '>';
      },
      oncomment: function(data) {
        prod_index += '<!--' + data + '-->';
      },
      onend: function() {
        prod_index = prod_index.trim() + '\n';
        prod_index = prod_index.replace(/^<\/script>/mg, '  </script>');
        var hashstr = JSON.stringify(hashes, null, 2);
        prod_index = prod_index.replace(/^((\s*).*){\/\*%ASSETS%\*\/}/mg,
          function(a, p1, p2) {
          return p1 + hashstr.replace(/^/mg,
            Array(p2.length + 1).join(' ')).trim();
        });
        grunt.file.write('db/.assets.json', hashstr);
        grunt.file.write('public/index.html', prod_index);
        grunt.log.ok('File public/index.html generated.');
      }
    });
    parser.write(index);
    parser.end();
  });

  grunt.registerTask('analyze', 'Analyze index.html', function() {
    var index = grunt.file.read('index.html');

    var templates = 'llksMonitor.run([\'$templateCache\', ' +
      'function($templateCache){';
    var tpl = { name: '', content: '' };
    var prod_index = '';
    var prod_tasks = {
      concat: { options: {}, dest: {}, src: {} },
      uglify: { options: {}, dest: {}, src: {} }
    };
    var tasks = Object.keys(prod_tasks);
    var skip_this_tag;

    var parser = new htmlparser.Parser({
      onopentag: function(name, attribs) {
        skip_this_tag = null;
        var is_script = (name === 'script');
        if (is_script) {
          tpl.name = '';
          tpl.content = '';

          if (attribs.hasOwnProperty('development')) {
            skip_this_tag = true;
          }
          if (attribs.hasOwnProperty('production')) {
            attribs.src = attribs.production;
            delete attribs.production;
          }
        }
        if (attribs.hasOwnProperty('skip-this-tag')) {
          skip_this_tag = true;
        }
        if (is_script) {
          for (var i = 0; i < tasks.length; i++) {
            var task = tasks[i];
            var target_name = attribs[task];
            if (!target_name) continue;
            prod_tasks[task].dest[target_name] =
              prod_tasks[task].dest[target_name] || [];
            prod_tasks[task].src[target_name] =
              prod_tasks[task].src[target_name] || [];
            if (attribs.dest) {
              if (attribs.options) {
                prod_tasks[task].options[target_name] =
                  JSON.parse(attribs.options);
              }
              prod_tasks[task].dest[target_name].push(attribs.dest);
            }
            if (attribs.src || attribs['real-src']) {
              var src = attribs['real-src'] || ('assets' + attribs.src);
              src = src.replace(/[\n\s]{2,}/g, '');
              prod_tasks[task].src[target_name].push(src);
            }
            if (attribs.dest) {
              attribs = { src: attribs.dest };
            } else {
              skip_this_tag = true;
            }
          }
        }
        if (is_script && attribs.type === 'text/ng-template') {
          tpl.name = attribs.id;
        } else {
          if (skip_this_tag !== true) {
            prod_index += '<' + name;
            for (var attrib in attribs) {
              prod_index += ' ' + attrib + '="' + attribs[attrib] + '"';
            }
            prod_index += '>';
          }
        }
      },
      ontext: function(text) {
        if (tpl.name !== '') {
          tpl.content += text;
        } else {
          if (skip_this_tag !== true) {
            prod_index += text;
          }
        }
      },
      onclosetag: function(name) {
        if (name === 'script' && tpl.name !== '') {
          tpl.content = tpl.content.replace(/^\s{2,}/mg, '');
          templates += '$templateCache.put(' + JSON.stringify(tpl.name) +
            ',' + JSON.stringify(tpl.content.trim()) + ');';
        } else {
          if (htmlparser.void_elements.indexOf(name.toLowerCase()) > -1)
            return;
          if (skip_this_tag !== true) {
            prod_index += '</' + name + '>';
          } else {
            skip_this_tag = null;
          }
        }
      },
      onprocessinginstruction: function(name, data) {
        prod_index += '<' + data + '>';
      },
      oncomment: function(data) {
        prod_index += '\n  <!--' + data + '-->\n';
      },
      onend: function() {
        prod_index = prod_index.replace(/^\s*$/mg, '');
        prod_index = prod_index.replace(/(<link.+?>)\n{2,}/mg, '$1\n');
        prod_index = prod_index.replace(/<\/script>\n{2,}/mg, '</script>\n');
        prod_index = prod_index.replace(/-->\n{2,}/g, '-->\n');
        prod_index = prod_index.replace(/^\s{2}<\//mg, '</');
        prod_index = prod_index.replace(/<\/(.+?)></g, '</$1>\n\n<');
        prod_index = prod_index.trim() + '\n';
        grunt.file.write('public/index.html', prod_index);
        grunt.log.ok('File public/index.html generated.');

        templates += '}])';
        grunt.file.write('public/js/templates.js', ';' + templates + ';');

        for (var i = 0; i < tasks.length; i++) {
          var task = tasks[i];
          var task_config = grunt.config(task) || {};
          for (var pu in prod_tasks[task].src) {
            var files = {};
            for (var dest in prod_tasks[task].dest[pu]) {
              files['public' + prod_tasks[task].dest[pu][dest]] =
                prod_tasks[task].src[pu];
            }
            task_config[pu] = {
              options: prod_tasks[task].options[pu],
              files: files
            };
          }
          if (Object.keys(task_config).length === 0) {
            task_config = {
              no_need: {}
            };
          }
          grunt.config(task, task_config);
          // console.log(JSON.stringify(task_config, null, 2));
          grunt.log.ok('Modified ' + task + ' tasks.');
        }
      }
    });
    parser.write(index);
    parser.end();
  });

  grunt.registerTask('download-angular', 'Download Angular',
    function(version) {
    var http = require('http');
    var fs = require('fs');
    var path = require('path');
    var finish = this.async();
    var base = 'http://code.angularjs.org/';
    var urls = [];
    var url_index = 0;
    var needs = [
      'angular.js',
      'angular-route.js'
    ];
    var need_latest = false;
    if (version === 'latest') {
      version = '';
      need_latest = true;
    }
    function get_versions(callback) {
      grunt.log.write('Getting list of Angular versions... ');
      http.get(base, function(response) {
        var list = '';
        response.on('data', function(data) {
          list += data;
        });
        response.on('end', function() {
          var versions = list.replace(/(<([^>]+)>)/ig, '')
            .match(/\d+\.\d+\.[^\/]+/g);
          var max_width = 0;
          versions.sort(function(a, b) {
            if (a.length > max_width) max_width = a.length;
            var _a = a.split(/[^\d]+/), _b = b.split(/[^\d]+/),
              _l = Math.min(_a.length, _b.length);
            for (var i = 0; i < _l; i++) {
              if (+_a[i] === +_b[i]) {
                continue;
              } else if (+_a[i] > +_b[i]) {
                return 1;
              } else {
                return -1;
              }
            }
            return 0;
          });
          var vers_l = versions.length;
          var item_width = max_width + 1;
          var columns = process.stdout.columns;
          var cols = Math.floor(columns / item_width);
          var start = Math.max(vers_l - 3 * cols, 0);
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          if (need_latest) {
            if (callback) callback(versions[vers_l - 1]);
            return;
          }
          console.log('List of some versions of Angular available for ' +
            'download:');
          for (var i = start; i < vers_l; i++) {
            var ver = versions[i];
            process.stdout.write(ver + Array(item_width - ver.length + 1)
              .join(' '));
            if ((i - start) % cols === cols - 1 && i !== vers_l - 1) {
              process.stdout.write('\n');
            }
          }
          process.stdout.write('\n');
          var readline = require('readline');
          var rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          rl.setPrompt('Enter one version number to download: ');
          rl.prompt();
          rl.write(versions[vers_l - 1]);
          rl.on('line', function(v) {
            v = v.trim();
            if (versions.indexOf(v) === -1) {
              rl.prompt();
            } else {
              rl.close()
              if (callback) callback(v);
            }
          });
        });
      });
    }
    function numfmt(n) {
      return n.toString().split('').reverse().join('')
              .replace(/(\d{3})/g, '$1,').split('')
              .reverse().join('').replace(/^,/, '');
    }
    function mkdir(/* ... */) {
      for (var i = 0; i < arguments.length; i++) {
        var dir = path.join.apply(null,
          Array.prototype.slice.call(arguments, 0, i + 1));
        if (fs.existsSync(dir)) {
          if (fs.lstatSync(dir).isDirectory()) continue;
          fs.unlinkSync(dir);
        }
        fs.mkdirSync(dir);
      }
    }
    function download(callback) {
      var url = urls[url_index];
      var filename = path.basename(url);
      mkdir('assets', 'js', 'vendor');
      var file = fs.createWriteStream('assets/js/vendor/' + filename);
      grunt.log.write('Start downloading ' + url + '...');
      http.get(url, function(response) {
        if (response.statusCode !== 200) {
          process.stdout.write('\n');
          throw new Error('Fail to download. Status: ' + response.statusCode);
        }
        var total = parseInt(response.headers['content-length']);
        var acc = 0;
        response.on('data', function(data) {
          file.write(data);
          acc += data.length;
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          process.stdout.write((acc / total * 100).toFixed(2) + '%, ' +
            numfmt(acc) + ' of ' + numfmt(total) + ' bytes of ' + filename +
            ' downloaded... ');
        });
        response.on('end', function() {
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          grunt.log.ok('Downloaded ' + url);

          url_index++;
          if (urls[url_index]) {
            download(callback);
          } else {
            callback();
          }
        });
      }).on('error', function(error) {
        grunt.fail.fatal(error);
      });
    }
    function to_download(callback) {
      base += version + '/';
      needs.forEach(function(need) {
        urls.push(base + need);
        urls.push(base + need.replace(/\.js$/, '.min.js'));
      });
      download(callback);
    }
    if (!version) {
      get_versions(function(v) {
        version = v;
        to_download(finish);
      });
    } else {
      to_download(finish);
    }
  });

  grunt.registerTask('push', 'Update website.', function(where) {
    if (!where) grunt.fail.fatal('Where? grunt push:example.com');
    var finish = this.async();
    var spawn = require('child_process').spawn;
    var ssh = spawn('ssh', [where, (function script_to_update() {
      /*!
        cd /srv/llks-monitor
        git fetch --all
        git reset --hard origin/master
        npm i
        npm start
      */
      return arguments.callee.toString().match(/\/\*!?([\S\s]*?)\*\//)[1]
        .replace(/^\s{2,}/gm, '').trim();
    })()]);
    ssh.stdout.pipe(process.stdout);
    ssh.stderr.pipe(process.stderr);
    ssh.on('close', finish);
  });

};
