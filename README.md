llks-monitor
============

Near real-time LLKS (流量矿石) activity monitoring powered by Socket.IO and
Angular.js.

Check out the [history data archive](https://github.com/choigoonho/llks-data).

Usage
-----

    npm -g i grunt-cli pm2
    npm i
    npm start

Screenshot
----------

![llks](https://cloud.githubusercontent.com/assets/1284703/2652836/41a02f64-bfb8-11e3-916e-8a36693992ae.png)

Nginx
-----

    upstream llksMonitor {
      server 127.0.0.1:<YOUR_PORT>;
    }

    server {
      server_name <SERVER_NAME>;
      listen 80;
      client_max_body_size 1m;
      keepalive_timeout 5;
      root /srv/llks-monitor/public;
      gzip_static on;
      error_page 500 502 503 504 /500.html;
      location = /500.html {
        root /srv/llks-monitor/public;
      }
      try_files $uri/index.html $uri.html $uri @app;
      location @app {
        proxy_intercept_errors on;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $http_host;
        proxy_redirect off;
        proxy_pass http://llksMonitor;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
      }
    }

Developer
---------

* caiguanhao &lt;caiguanhao@gmail.com&gt;
