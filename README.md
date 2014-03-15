llks-monitor
============

Monitor all your llks accounts.

You just need to log in to [llks](https://jiaoyi.yunfan.com) using Google
Chrome, then open console (press Control-Shift-J on Windows or Command-Alt-J
on Mac) and enter the following command:

    copy(document.cookie.match(/ntts_kb_session_id=(.+?);/)[1])

Then use the code in your clipboard to access your account!

Don't click the log out link in the web page. You can log out the web page
by entering this line of code:

    document.cookie='ntts_kb_session_id=;expires='+new Date(0)+
    ';domain=.jiaoyi.yunfan.com;path=/;';window.location.reload();

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
