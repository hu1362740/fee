# Nginx 知识库与 fee-pro 本地配置说明

> 本文基于当前本机配置：
>
> - Nginx 主配置：`D:/phpstudy_pro/Extensions/Nginx1.15.11/conf/nginx.conf`
> - 站点配置目录：`D:/phpstudy_pro/Extensions/Nginx1.15.11/conf/vhosts`
> - 当前站点文件：`127.0.0.1_80.conf`、`fee-pro.conf`
> - 项目目录：`D:/mywork/demo/fee-pro`
>
> 读取时间：2026-07-08。

## 一、Nginx 是什么

Nginx 是一个高性能 Web 服务器，也常被用作反向代理、静态资源服务器、负载均衡器和访问日志收集入口。

在本项目里，Nginx 主要承担三类职责：

1. **接收 SDK 打点请求**
   - 业务方通过 `dt.set({ reportUrl })` 指定打点地址；本文本地示例使用 `http://test.com/dig`。
   - Nginx 的 `location = /dig` 返回一个 1px 图片，同时把完整请求写入 `fee-access.log`。
   - Server 侧的 `SaveLog:Nginx` 再读取 `fee-access.log`，解析里面的 `?d=...` 打点 JSON。

2. **托管或转发管理后台前端**
   - 开发时可以把 `/` 代理到 Vue 开发服务器 `http://127.0.0.1:8080`。
   - 生产或本地静态预览时可以让 Nginx 直接托管 `client/dist`。

3. **反向代理后端 API**
   - 管理后台请求 `/api/...` 和 `/project/:id/api/...`。
   - Nginx 应该把这些请求转发到 Node/Express 服务 `http://127.0.0.1:3000`。

可以把 Nginx 理解成项目最外层的“入口分流器”：

```text
浏览器
  -> Nginx:80
      -> /dig                  写 fee-access.log，返回 1px GIF
      -> /api/...              代理到 server:3000
      -> /project/1/api/...    代理到 server:3000
      -> /                     返回前端页面或代理到 Vue dev server
```

## 二、Nginx 配置文件的层级

Nginx 配置按上下文分层。常见层级如下：

```nginx
# main 全局上下文
worker_processes 4;

events {
    # events 上下文
    worker_connections 40960;
}

http {
    # http 上下文
    include mime.types;

    server {
        # server 虚拟主机上下文
        listen 80;
        server_name test.com;

        location / {
            # location 路由匹配上下文
        }
    }
}
```

几个常用上下文：

| 上下文 | 作用 |
| --- | --- |
| `main` | 全局配置，例如工作进程数、错误日志、pid 文件等。 |
| `events` | 连接处理配置，例如每个 worker 最大连接数。 |
| `http` | HTTP 服务总配置，例如 MIME 类型、日志格式、压缩、通用超时、包含站点配置等。 |
| `server` | 一个虚拟主机。通常由 `listen` 和 `server_name` 决定处理哪个域名和端口。 |
| `location` | 一个虚拟主机内的路径匹配规则。决定某个 URL 走静态文件、反向代理、返回图片、拒绝访问等。 |

## 三、主要配置项说明

### 1. 全局与 http 配置

| 配置项 | 示例 | 作用 |
| --- | --- | --- |
| `worker_processes` | `worker_processes 4;` | Nginx worker 进程数。通常可接近 CPU 核心数。本机 phpStudy 配的是 4。 |
| `worker_connections` | `worker_connections 40960;` | 每个 worker 可同时处理的连接数上限。 |
| `include` | `include mime.types;` | 引入其他配置文件。当前主配置通过 `include vhosts/*.conf;` 加载所有站点配置。 |
| `default_type` | `default_type application/octet-stream;` | 未识别文件类型时的默认 Content-Type。 |
| `types` | `types { application/font-sfnt otf ttf; }` | 补充扩展名到 MIME 类型的映射。 |
| `sendfile` | `sendfile on;` | 让 Nginx 更高效地发送静态文件。 |
| `keepalive_timeout` | `keepalive_timeout 65;` | HTTP 长连接空闲保持时间。 |
| `client_max_body_size` | `client_max_body_size 200m;` | 最大请求体大小。上传文件或大请求会受它限制。 |
| `server_names_hash_bucket_size` | `server_names_hash_bucket_size 256;` | server_name 较长或较多时避免哈希桶不足。 |
| `log_format` | `log_format fee_main '...';` | 定义 access log 的一行日志格式。fee-pro 的解析强依赖这个格式。 |
| `access_log` | `access_log logs/fee-access.log fee_main;` | 指定访问日志文件和日志格式。 |
| `map` | `map $time_iso8601 $logdate { ... }` | 根据变量生成新变量。当前主配置里定义了 `$logdate`，但 fee-pro 配置暂未使用它。 |

### 2. server 配置

| 配置项 | 示例 | 作用 |
| --- | --- | --- |
| `listen` | `listen 80;` | 当前虚拟主机监听的端口。多个 server 可以监听同一个端口。 |
| `server_name` | `server_name test.com;` | 当前虚拟主机匹配的域名。浏览器请求的 Host 头与它匹配时，进入这个 server。 |
| `charset` | `charset utf-8;` | 响应字符集。 |
| `root` | `root D:/mywork/demo/fee-pro/client/dist;` | 静态文件根目录。Nginx 会把 URI 追加到 root 后面寻找文件。 |
| `index` | `index index.html;` | 访问目录时默认返回的文件。 |
| `error_page` | `error_page 404 /404.html;` | 指定错误状态码对应的页面。 |

### 3. location 配置

| 配置项 | 示例 | 作用 |
| --- | --- | --- |
| `location = /dig` | 精确匹配 `/dig` | 只匹配路径完全等于 `/dig` 的请求。`/dig?d=...` 也匹配，因为 query string 不参与 location 匹配。 |
| `location /api/` | 前缀匹配 `/api/` | 匹配所有以 `/api/` 开头的路径。 |
| `location /` | 兜底前缀匹配 | 几乎所有请求都会匹配，通常作为前端 SPA fallback。 |
| `location ~* \.(js|css)$` | 不区分大小写的正则匹配 | 用于静态资源缓存等场景。 |
| `try_files` | `try_files $uri $uri/ /index.html;` | 先按真实文件找，找不到则返回 `/index.html`，常用于 Vue Router history 模式。 |
| `proxy_pass` | `proxy_pass http://127.0.0.1:3000;` | 把请求转发到后端服务。注意末尾斜杠会影响 URI 是否被改写。 |
| `proxy_set_header` | `proxy_set_header X-Real-IP $remote_addr;` | 把真实 Host、IP、协议等信息传给后端。 |
| `empty_gif` | `empty_gif;` | 返回 Nginx 内置的 1x1 透明 GIF，适合图片打点。 |
| `add_header` | `add_header Cache-Control "public";` | 给响应增加 HTTP 头。 |
| `expires` | `expires 30d;` | 设置静态资源缓存时间。 |
| `deny all` | `location ~ /\.git { deny all; }` | 禁止访问匹配路径。 |

## 四、vhosts 下多个配置文件如何生效

当前 `nginx.conf` 中有这一行：

```nginx
include vhosts/*.conf;
```

它位于 `http { ... }` 内，所以 `vhosts` 目录下所有 `.conf` 文件都会被读进 `http` 上下文。

### 1. 这两个文件有主次之分吗

没有“业务主次”之分。它们都会被加载。

但有一个重要的“默认兜底”规则：

- 如果多个 `server` 都监听 `80`，Nginx 会先根据请求 Host 匹配 `server_name`。
- 如果 Host 能匹配某个 `server_name`，就进入对应 server。
- 如果 Host 都不匹配，就使用该 `listen` 地址上的默认 server。
- 如果没有显式写 `default_server`，通常第一个被加载的 server 会成为默认 server。

当前两个文件的关系大致是：

| 文件 | listen | server_name | 请求示例 | 是否 fee-pro |
| --- | --- | --- | --- | --- |
| `127.0.0.1_80.conf` | `80` | `127.0.0.1` | `http://127.0.0.1/` | 否，指向 `D:/work/maoshishop/public` |
| `fee-pro.conf` | `80` | `test.com` | `http://test.com/`、`http://test.com/dig` | 是 |

也就是说：

- 访问 `http://test.com/`，如果本机 hosts 把 `test.com` 指向 `127.0.0.1`，会进入 `fee-pro.conf`。
- 访问 `http://127.0.0.1/`，会进入 `127.0.0.1_80.conf`。
- 访问一个没有匹配的 Host，可能落到第一个默认 server。当前很可能是 `127.0.0.1_80.conf`。

### 2. 它们会合并吗

不会把两个 `server { ... }` 合并成一个站点。

准确说：

- `vhosts/*.conf` 的内容会被整体插入到 `http { ... }` 中。
- 每个 `server { ... }` 是独立虚拟主机。
- 不同 `server` 的 `location` 不会互相共享。
- 写在 `server` 外、`http` 内的配置，例如 `log_format`，是 http 级别的公共配置。

当前 `fee-pro.conf` 里的 `log_format fee_main ...` 写在 `server {}` 外面。因为该文件被 include 到 `http {}` 内，所以它实际是 **http 级别配置**，不是“只在当前虚拟主机中生效”。只是目前只有 `fee-pro.conf` 的 `/dig` 使用了 `fee_main`。

## 五、location 匹配规则，重点理解 `/dig`、`/api/`、`/`

Nginx 收到请求后，会在命中的 `server` 内继续匹配 `location`。

常用匹配优先级可以简化理解为：

1. `location = /xxx` 精确匹配优先级最高。
2. 普通前缀匹配会先找最长前缀，例如 `/api/` 比 `/` 更具体。
3. 正则 location，例如 `location ~* \.js$`，在很多情况下会继续参与匹配，并可能覆盖普通前缀匹配。
4. `location /` 通常作为最后兜底。

重要细节：

- location 只匹配路径，不匹配 `?` 后面的 query string。
- 所以 `/dig?d=xxx` 的路径仍然是 `/dig`，会命中 `location = /dig`。

以 `fee-pro.conf` 为例：

```nginx
location = /dig { ... }
location / { ... }
location /api/ { ... }
location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ { ... }
```

请求匹配示例：

| 请求 | 预期命中 | 说明 |
| --- | --- | --- |
| `/dig?d=...` | `location = /dig` | SDK 打点，写入 `fee-access.log`。 |
| `/api/login/normal` | `location /api/` | 应该代理到 Node 后端。当前配置有 URI 改写问题，后面会讲。 |
| `/project/1/api/pv/count` | 当前会命中 `location /` | 这是当前配置的重要缺口，应代理到 Node 后端。 |
| `/1.0.0/js/897b86b/index.js` | `location ~* ...` | 静态资源缓存规则。当前 root 指错目录，后面会讲。 |
| `/login` | `location /` | Vue SPA 路由，找不到真实文件时返回 `index.html`。 |

如果不希望 `/api/` 被后面的静态资源正则干扰，可以写成：

```nginx
location ^~ /api/ {
    proxy_pass http://127.0.0.1:3000;
}
```

`^~` 表示命中这个前缀后，不再继续检查后面的正则 location。

## 六、`127.0.0.1_80.conf` 配置说明

当前内容概要：

```nginx
server {
    listen 80;
    server_name 127.0.0.1;
    root "D:/work/maoshishop/public";

    location ~* \.(ttf|ttc|otf|eot|woff|woff2)$ { ... }

    location / {
        index index.php index.html error/index.html;
        error_page ...;
        include D:/work/maoshishop/public/nginx.htaccess;
        autoindex off;
    }

    location ~ \.php(.*)$ {
        fastcgi_pass 127.0.0.1:9001;
        ...
    }
}
```

逐项解释：

| 配置 | 作用 |
| --- | --- |
| `listen 80;` | 监听 80 端口。 |
| `server_name 127.0.0.1;` | Host 是 `127.0.0.1` 的请求进入这个 server。 |
| `root "D:/work/maoshishop/public";` | 静态和 PHP 文件根目录，属于另一个项目，不是 fee-pro。 |
| 字体 `location ~* ...` | 给字体文件增加跨域响应头，允许 `http://localhost:5173` 读取字体。 |
| `location /` | 站点兜底路径，默认首页是 `index.php` 或 `index.html`。 |
| `include .../nginx.htaccess;` | 引入站点自定义 rewrite 或伪静态规则。该文件不存在会导致 Nginx 启动失败。当前本机该路径存在。 |
| `autoindex off;` | 禁止目录列表展示。 |
| `location ~ \.php(.*)$` | PHP 请求转给 php-fpm 或 php-cgi，地址是 `127.0.0.1:9001`。 |

对 fee-pro 的影响：

- 它不会和 `fee-pro.conf` 合并。
- 它会处理 `http://127.0.0.1/`。
- 如果你以为访问 `127.0.0.1` 就是在看 fee-pro，会被它误导。
- 如果不再使用这个 maoshishop 站点，可以在 phpStudy 中停用该站点，或者改端口，减少混淆。

## 七、`fee-pro.conf` 配置说明

### 1. `log_format fee_main`

当前配置：

```nginx
log_format fee_main '$time_iso8601\t-\t-\t$remote_addr\t$http_host\t$status\t$request_time\t$request_length\t$body_bytes_sent\t15d04347-be16-b9ab-0029-24e4b6645950\t-\t-\t9689c3ea-5155-2df7-a719-e90d2dedeb2c\t937ba755-116a-18e6-0735-312cba23b00c\t$request_method $server_protocol\t$request_uri\t-\t$http_user_agent\t-\tsample=-&_UC_agent=-&test_device_id=-&-\t-\t-\t-';
```

本项目 Server 的解析代码在 `server/src/commands/save_log/base.js` 中，核心依赖：

```js
const info = data.split('\t')
let url = _.get(info, [15], '')
record.ua = parser(decodeURIComponent(info[17]))
record.ip = info[3] || info[4]
```

所以 `fee_main` 必须保持 Tab 分隔，且字段位置要对得上。

当前 `fee_main` 字段位置如下：

| 下标 | 字段 | 项目是否使用 |
| --- | --- | --- |
| `0` | `$time_iso8601` | 使用，用来解析日志时间。 |
| `1` | `-` | 占位。 |
| `2` | `-` | 占位。 |
| `3` | `$remote_addr` | 使用，作为 IP。 |
| `4` | `$http_host` | 兜底 IP 字段之一，但这里实际是 Host。 |
| `5` | `$status` | 当前保存阶段不直接使用。 |
| `6` | `$request_time` | 当前保存阶段不直接使用。 |
| `7` | `$request_length` | 当前保存阶段不直接使用。 |
| `8` | `$body_bytes_sent` | 当前保存阶段不直接使用。 |
| `9` 到 `14` | 若干固定值、占位和请求方法协议 | 主要用于兼容历史日志格式。 |
| `15` | `$request_uri` | 使用，必须包含 `/dig?d=...`。 |
| `16` | `-` | 占位。 |
| `17` | `$http_user_agent` | 使用，用于解析浏览器、系统、设备。 |
| `18` 以后 | 占位和采样字段 | 当前保存阶段不直接使用。 |

本次抽查 `fee-access.log` 最新一行，实际包含 22 个 Tab，说明当前日志文件确实是 Tab 分隔，和解析代码能对上。

需要注意：

- `15d04347...`、`9689...`、`937...` 这些硬编码值不是当前项目真正的 `pid`。
- 真正项目标识来自 `/dig?d=...` 中 JSON 的 `common.pid`。
- Server 会拿 `common.pid` 去数据库项目表中匹配项目。

### 2. `server` 块

当前配置概要：

```nginx
server {
    listen 80;
    server_name test.com;
    charset utf-8;
    root D:/mywork/demo/fee-pro/nginx_html;

    location = /dig { ... }
    location / { ... }
    location /api/ { ... }
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ { ... }
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;
    location = /50x.html { root html; }
    location ~ /\.git { deny all; }
    location ~ /\.env { deny all; }
}
```

逐项解释：

| 配置 | 作用 | 当前评价 |
| --- | --- | --- |
| `listen 80;` | 监听 80 端口。 | 合理。 |
| `server_name test.com;` | Host 为 `test.com` 的请求进入 fee-pro。 | 当业务方把 `reportUrl` 配成 `http://test.com/dig` 时可以使用，但本机 hosts 必须配置 `127.0.0.1 test.com`。 |
| `charset utf-8;` | 设置响应字符集。 | 合理。 |
| `root D:/mywork/demo/fee-pro/nginx_html;` | server 级默认静态根目录。 | 当前该目录不存在，错误页等 fallback 会有问题。 |

### 3. `location = /dig`

当前配置：

```nginx
location = /dig {
    empty_gif;
    access_log logs/fee-access.log fee_main;

    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, OPTIONS';
    add_header Access-Control-Allow-Headers 'Content-Type';
}
```

作用：

- 精确匹配 SDK 打点地址 `/dig`。
- `empty_gif` 返回 1x1 透明 GIF，适合 `new Image().src = ...` 这种打点方式。
- `access_log logs/fee-access.log fee_main;` 把打点请求写到 `D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/fee-access.log`。
- Server 配置 `server/src/configs/common.js` 当前也是读取 `D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/`，路径能对上。

这是当前配置里最关键、也相对正确的一段。

注意：

- 图片 GET 上报本身通常不需要 CORS 许可，因为页面不会读取响应内容。
- 这里加 CORS 响应头不影响使用，便于调试。
- 如果要保证非 200 响应也带 CORS 头，可以加 `always`，不过 `empty_gif` 正常就是 200。

### 4. `location /`

当前配置：

```nginx
location / {
    root D:/mywork/demo/fee-pro/client;
    index index.html;
    try_files $uri $uri/ /index.html;

    if ($request_filename ~* .*\.(?:htm|html)$) {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
    }
}
```

意图：

- 托管 Vue 管理后台。
- `try_files $uri $uri/ /index.html;` 用于 Vue Router history 模式：真实文件不存在时返回 `index.html`。

当前问题：

- Vue 构建产物在 `client/dist`。
- 当前 `client/dist/index.html` 引用的是 `/1.0.0/js/897b86b/index.js`。
- `root D:/mywork/demo/fee-pro/client;` 会让 Nginx 去找 `D:/mywork/demo/fee-pro/client/index.html` 和 `D:/mywork/demo/fee-pro/client/1.0.0/js/...`。
- 实际文件在 `D:/mywork/demo/fee-pro/client/dist/index.html` 和 `D:/mywork/demo/fee-pro/client/dist/1.0.0/js/...`。

所以，如果使用 Nginx 直接托管前端，这里应该指向：

```nginx
root D:/mywork/demo/fee-pro/client/dist;
```

如果是开发模式，则更建议把 `/` 代理到 Vue dev server：

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
}
```

### 5. `location /api/`

当前配置：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    ...
}
```

意图：

- 把管理后台的 API 请求转给 Node/Express 后端。
- 后端服务端口在 `server/src/configs/app.js` 中是 `3000`。

当前有一个关键错误：`proxy_pass http://127.0.0.1:3000/;` 末尾带 `/`。

在 `location /api/` 中，`proxy_pass` 如果写成带 URI 的形式，Nginx 会把匹配到的 `/api/` 前缀替换成 `/`。

实际效果类似：

```text
浏览器请求：/api/login/normal
转发后端：  /login/normal
```

但本项目 Express 真实路由就是 `/api/login/normal`，所以后端会匹配不到。

推荐改为不带末尾 URI：

```nginx
location ^~ /api/ {
    proxy_pass http://127.0.0.1:3000;
}
```

这样实际效果是：

```text
浏览器请求：/api/login/normal
转发后端：  /api/login/normal
```

这才符合本项目后端路由。

### 6. 缺少 `/project/:id/api/` 代理

这是当前 `fee-pro.conf` 另一个关键问题。

本项目前端既会请求：

```text
/api/login/normal
/api/project/item/list
```

也会请求：

```text
/project/1/api/pv/count
/project/1/api/error/distribution/summary
/project/1/api/performance/url_list
```

后端 `server/src/app.js` 也明确只响应：

```js
_.startsWith(path, '/api') || path.search(/^\/project\/\d+\/api/i) === 0
```

但当前 Nginx 只配置了：

```nginx
location /api/ { ... }
```

没有配置：

```nginx
location ~ ^/project/\d+/api/ { ... }
```

因此，在 Nginx 静态托管前端时，`/project/1/api/...` 会落到 `location /`，最后返回前端 `index.html`，而不是后端 JSON。这会导致看板数据、错误列表、性能数据等接口异常。

### 7. 静态资源缓存 location

当前配置：

```nginx
location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
    root D:/mywork/demo/fee-pro/client;
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

意图：

- 对静态资源设置长期缓存。

当前问题：

- root 同样应该指向 `client/dist`，否则 `/1.0.0/js/...` 会 404。
- 正则 location 可能覆盖普通前缀 location。虽然正常 API 很少以 `.js`、`.css` 结尾，但为了稳妥，建议 API 使用 `^~ /api/`，并把 `/project/:id/api/` 的正则代理放在静态资源正则前面。

### 8. 错误页和敏感文件

当前配置：

```nginx
error_page 404 /404.html;
error_page 500 502 503 504 /50x.html;

location = /50x.html {
    root html;
}

location ~ /\.git {
    deny all;
}

location ~ /\.env {
    deny all;
}
```

评价：

- 禁止 `.git`、`.env` 访问是好习惯。
- 当前 `client/dist` 下没有 `404.html`、`50x.html`。
- 本机 `D:/phpstudy_pro/Extensions/Nginx1.15.11/html/50x.html` 也不存在。
- 因此错误页配置目前更多是形式上的，实际可能返回不到预期页面。

## 八、结合本项目的配置评价

### 做得好的地方

1. **`/dig` 使用精确匹配是对的**
   - 打点接口不容易被其他路径误命中。
   - `/dig?d=...` 仍能命中，因为 query string 不参与 location 匹配。

2. **`empty_gif` 适合 SDK 当前上报方式**
   - SDK 使用 `new Image().src` 发 GET 请求。
   - 返回 1px GIF 轻量、兼容性好。

3. **`fee-access.log` 与 Server 配置路径能对上**
   - Nginx 写入 `logs/fee-access.log`。
   - Server 读取 `D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/`。
   - `SaveLog:Nginx` 会优先识别 `fee-access.log`。

4. **`fee_main` 字段位置基本符合解析代码**
   - 第 15 列是 `$request_uri`。
   - 第 17 列是 `$http_user_agent`。
   - 第 3 列是 `$remote_addr`。

5. **`server_name test.com` 可用于本地 SDK 联调**
   - 业务方把 `reportUrl` 显式配置为 `http://test.com/dig`。
   - 只要 hosts 配好，SDK 打点就能进入这个 server。

### 需要修正或注意的问题

| 级别 | 问题 | 影响 | 建议 |
| --- | --- | --- | --- |
| 高 | `proxy_pass http://127.0.0.1:3000/;` 会剥掉 `/api/` 前缀 | 登录、用户、项目等 `/api/...` 后端路由可能 404 | 改成 `proxy_pass http://127.0.0.1:3000;` |
| 高 | 缺少 `/project/:id/api/` 代理 | 看板类项目接口会被当成前端路由，返回 HTML 而不是 JSON | 增加 `location ~ ^/project/\d+/api/` 代理到 `3000` |
| 高 | 前端 root 指向 `client`，不是 `client/dist` | Nginx 直接托管前端时，`index.html` 和 `/1.0.0/js/...` 可能 404 | 静态托管时 root 改为 `client/dist` |
| 中 | `nginx_html` 目录不存在 | server 级 root 和错误页 fallback 不可靠 | 创建目录和错误页，或直接统一 root 到 `client/dist` |
| 中 | `127.0.0.1_80.conf` 是另一个项目 | 访问 `127.0.0.1` 看到的不是 fee-pro，容易误判 | 访问 fee-pro 用 `test.com`，或停用无关站点 |
| 中 | `vhosts` 下中文文件名会让 Windows Nginx 报错 | 例如 `fee-pro - 副本.conf` 会导致 Nginx 启动失败 | 配置文件名只用英文、数字、下划线、短横线 |
| 低 | `log_format` 注释说“只在当前虚拟主机中生效”不准确 | 容易误解作用域 | 改注释为“定义在 http 上下文，当前仅 fee-pro 使用” |
| 低 | 旧的注释版 `log_format` 很多 | 增加维护干扰 | 保留一个正确版本即可 |
| 低 | `if` 用于 HTML 禁缓存 | Nginx 中 `if` 容易产生误解 | 可改为 `location = /index.html` 单独设置 no-cache |

## 九、推荐配置示例

下面是更贴合当前项目的本地静态托管版本。它假设：

- 前端已经执行过 `cd client && npm run build`。
- 构建产物在 `D:/mywork/demo/fee-pro/client/dist`。
- 后端已经执行过 `cd server && npm run build`，并通过 `npm run dev` 或等价方式监听 `3000`。
- hosts 中有 `127.0.0.1 test.com`。

```nginx
log_format fee_main '$time_iso8601\t-\t-\t$remote_addr\t$http_host\t$status\t$request_time\t$request_length\t$body_bytes_sent\t15d04347-be16-b9ab-0029-24e4b6645950\t-\t-\t9689c3ea-5155-2df7-a719-e90d2dedeb2c\t937ba755-116a-18e6-0735-312cba23b00c\t$request_method $server_protocol\t$request_uri\t-\t$http_user_agent\t-\tsample=-&_UC_agent=-&test_device_id=-&-\t-\t-\t-';

server {
    listen 80;
    server_name test.com;
    charset utf-8;

    root D:/mywork/demo/fee-pro/client/dist;
    index index.html;

    # SDK 打点入口。必须写入 fee-access.log，Server 才能读取。
    location = /dig {
        empty_gif;
        access_log logs/fee-access.log fee_main;

        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type" always;
    }

    # 通用 API。注意 proxy_pass 后面不要加 /，否则会剥掉 /api/ 前缀。
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 项目维度 API，例如 /project/1/api/pv/count。
    # 这个路径是 fee-pro 看板数据接口的关键。
    location ~ ^/project/\d+/api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 带 hash 或版本目录的静态资源可以长期缓存。
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        try_files $uri =404;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # 首页不建议强缓存，避免重新发版后用户一直拿旧 index.html。
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
    }

    # Vue Router history fallback。
    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~ /\.(git|env) {
        deny all;
    }
}
```

如果你希望走 Vue 开发服务器，而不是 Nginx 直接托管 `client/dist`，可以使用开发版思路：

```nginx
server {
    listen 80;
    server_name test.com;
    charset utf-8;

    location = /dig {
        empty_gif;
        access_log logs/fee-access.log fee_main;
        add_header Access-Control-Allow-Origin * always;
    }

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ~ ^/project/\d+/api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

开发版需要同时启动：

```powershell
cd server
npm run build
npm run dev

cd client
npm run dev
```

## 十、排查与验证

### 1. 检查 hosts

如果业务页面把 `reportUrl` 配成 `http://test.com/dig`，Windows hosts 需要有：

```text
127.0.0.1 test.com
```

hosts 文件通常在：

```text
C:/Windows/System32/drivers/etc/hosts
```

### 2. 检查 Nginx 配置语法

在 phpStudy 的 Nginx 目录下执行类似命令：

```powershell
D:/phpstudy_pro/Extensions/Nginx1.15.11/nginx.exe -t -p D:/phpstudy_pro/Extensions/Nginx1.15.11/
```

如果出现类似：

```text
CreateFile() ".../vhosts/fee-pro - 副本.conf" failed
No mapping for the Unicode character exists in the target multi-byte code page
```

说明 Windows 版 Nginx 读取中文文件名失败。处理方式：

- 删除多余的 `fee-pro - 副本.conf`。
- 或改名为 `fee-pro-copy.conf`。
- vhosts 下建议只使用英文、数字、下划线、短横线。

### 3. 检查 `/dig`

浏览器访问：

```text
http://test.com/dig?d=%7B%7D
```

预期：

- 页面显示一个空白小图片或直接空白。
- `D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/fee-access.log` 增加一行。

### 4. 检查 API 是否被正确代理

重点检查 URI 有没有被剥掉 `/api`：

```text
http://test.com/api/login/type
```

如果 Nginx 配置正确，请求会到后端 `/api/login/type`。

还要检查项目 API：

```text
http://test.com/project/1/api/pv/count
```

这个路径必须代理到后端，而不是返回前端 `index.html`。

### 5. 检查静态资源

如果使用静态托管版本，浏览器访问：

```text
http://test.com/1.0.0/js/897b86b/index.js
```

预期返回 JavaScript 文件。

如果返回 404，通常是 `root` 没有指向 `client/dist`。

### 6. 检查 Server 日志读取

当前 Server 配置：

```js
nginxLogFilePath: 'D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/'
```

`SaveLog:Nginx` 会优先找：

```text
D:/phpstudy_pro/Extensions/Nginx1.15.11/logs/fee-access.log
```

如果 `fee-access.log` 不存在，它可能退而读取 `access.log`。但 `access.log` 通常是普通 Nginx 日志格式，不是 fee-pro 的 Tab 分隔格式，解析大概率失败。因此要确保 `/dig` 写的是 `fee-access.log`。

## 十一、结论

当前 `fee-pro.conf` 的 `/dig` 和日志格式方向是对的，已经具备“SDK 打点 -> Nginx fee-access.log -> Server SaveLog:Nginx”的基础条件。

但如果要通过 `http://test.com/` 完整访问管理后台，当前配置还不够好，主要问题是：

1. `/api/` 代理写法会剥掉 `/api` 前缀。
2. 缺少 `/project/:id/api/` 代理。
3. 前端静态 root 指向了 `client`，不是构建产物 `client/dist`。
4. `nginx_html`、`404.html`、`50x.html` 等错误页路径目前不完整。
5. `vhosts` 下不能保留中文名复制文件，否则 Windows Nginx 可能启动失败。

优先修正前 3 项，fee-pro 的本地 Nginx 链路会稳定很多。
