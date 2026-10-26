# 自部署

需要 Node.js 24+。部署者自行准备服务账户、模型资格、域名、HTTPS、数据保护和备份。以下均为示例路径与主机名，不连接任何现有服务器。学习界面使用固定 `/learn/` 前缀，`/in` 是文字／漫画双入口门户。

## 构建与配置

在独立目录执行 `npm ci`、`npm test`、`npm run build`。服务必须从项目目录运行，以便找到 `dist/`。不要公开 `data/` 或把数据目录放在 `public/`、`dist/` 中。

生产环境要求：

| 变量 | 配置 |
| --- | --- |
| `NODE_ENV` | `production` |
| `STUDIO_HOST` | `127.0.0.1`，由同机反向代理访问 |
| `STUDIO_PORT` | 选择未占用端口，例如 `4318` |
| `STUDIO_DATA_DIR` | 专用绝对目录，例如 `/var/lib/fablelab` |
| `STUDIO_COOKIE_SECRET` | 独立生成、至少 32 字符的随机值 |
| `STUDIO_ACCESS_CODE_HASH` | 自定义随机邀请码的 SHA-256 小写十六进制值；禁止 `1025` |
| `STUDIO_PUBLIC_ORIGIN` | 真实 HTTPS 来源，例如 `https://fablelab.example`，不带路径或末尾斜杠 |
| `STUDIO_SYNTHETIC` | `0`；生产拒绝合成模式 |
| `STUDIO_ENABLE_AI` | 默认 `0`；真实生成按 [模型说明](MODEL_SERVICE.md) 配置 |

在可信的本地终端用 Node 的 `crypto.randomBytes()` 分别生成会话密钥和长随机邀请码，用 `crypto.createHash('sha256')` 计算邀请码哈希。将邀请码通过自己的安全渠道提供给受邀用户；不要将原码或密钥放入仓库、工单、截图或浏览器脚本。生产即使显式配置 `1025` 的哈希也会拒绝启动。

环境文件权限应仅允许服务账户和管理员读取。在项目目录可使用：

```text
node --env-file=/etc/fablelab.env --import tsx server/index.ts
```

没有配置真实服务时，预置示例可阅读，新生成任务会提示接口未配置。确认服务资格、费用和数据规则后才开启真实生成。不要以生产模式绕过合成模式的限制；离线演示应使用仅绑定本机的开发模式。

## 反向代理

以下 Nginx 片段应放进已经正确配置 HTTPS 的独立站点；证书由部署者配置。`proxy_pass` 保留 `/learn/` 前缀，转发协议便于正确设置安全 Cookie。

```nginx
server_name fablelab.example;

location = /in/ { return 302 /in; }
location = /in {
    proxy_pass http://127.0.0.1:4318;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
}
location = /learn { return 302 /learn/; }
location /learn/ {
    proxy_pass http://127.0.0.1:4318;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_read_timeout 300s;
}
```

应用只信任回环代理；如采用容器或远程代理，需单独审查代理信任边界。避免在访问日志中保留完整分享 URL，其令牌持有者可读取分享副本。

## 独立进程示例

以下 systemd 单元假定独立的 `fablelab` 用户、项目目录 `/opt/fablelab`、可写数据目录 `/var/lib/fablelab`，且 `/usr/bin/node` 已是 Node.js 24+。按本机实际安装位置调整。

```ini
[Unit]
Description=FableLab Studio
After=network.target

[Service]
Type=simple
User=fablelab
Group=fablelab
WorkingDirectory=/opt/fablelab
ExecStart=/usr/bin/node --env-file=/etc/fablelab.env --import tsx server/index.ts
Restart=on-failure
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/fablelab

[Install]
WantedBy=multi-user.target
```

先检查配置和端口，再只启动自己的独立服务。上线前用合成账户验证 HTTPS 登录、私有书架、匿名访问拒绝、分享和撤销，不使用真实用户数据进行验收。

## 数据与升级

`STUDIO_DATA_DIR` 保存账户数据库、会话、恢复码哈希、任务内容、媒体、分享副本及调用元数据。它属于部署者管理的私有运行数据。分享是可撤销的只读快照，任何得到链接的人都可能读取；撤销不能收回已被他人保存的副本。

同一数据目录只允许一个应用进程。升级前停止该实例并备份整个数据目录，保留对应代码版本；在副本上验证升级和恢复后再上线。不要在运行中仅复制 SQLite 主文件作为完整备份。使用受限权限、适当的存储加密和自己的保留/删除规则；避免采集不必要的个人信息。

构建产物、依赖和运行目录均在 `.gitignore` 中。分发依赖或包含依赖的部署包时，保留相应依赖自带的许可证和声明。
