# 本地合成演示

需要 Node.js 24+ 和 npm。应用使用 Node 内置 SQLite。以下流程只运行固定合成资料和 1×1 占位图，不调用模型、不需要密钥。它适合验证界面、存储、恢复和分享，不能证明真实生成质量或学术准确性。

在项目目录安装并构建：

```text
npm ci
npm test
npm run build
```

PowerShell：

```powershell
$env:NODE_ENV = 'development'
$env:STUDIO_HOST = '127.0.0.1'
$env:STUDIO_PORT = '4318'
$env:STUDIO_DATA_DIR = './data-demo'
$env:STUDIO_SYNTHETIC = '1'
$env:STUDIO_ENABLE_AI = '0'
Remove-Item Env:ECNU_API_KEY -ErrorAction SilentlyContinue
npm run local
```

macOS / Linux：

```sh
NODE_ENV=development STUDIO_HOST=127.0.0.1 STUDIO_PORT=4318 STUDIO_DATA_DIR=./data-demo STUDIO_SYNTHETIC=1 STUDIO_ENABLE_AI=0 ECNU_API_KEY= npm run local
```

打开 <http://127.0.0.1:4318/in>，使用本地演示邀请码 `1025` 注册一个自建账户。可体验文字或漫画、读—解—议、书架及可撤销分享。新任务生成一则故事，预置示例和旧格式仍支持两则故事。合成漫画占位图很小，属于预期行为。

以上命令绑定 `127.0.0.1`，演示资料写入独立的 `data-demo/`；未配置 `STUDIO_DATA_DIR` 时程序默认使用 `data/`。用 `STUDIO_PORT`、`STUDIO_HOST`、`STUDIO_DATA_DIR` 调整实例。运行两个实例时使用不同端口和数据目录；同一数据目录只允许一个服务进程。数据包含账号、会话、内容和分享信息，不应提交到仓库。按 Ctrl+C 停止本地实例。

## 使用环境文件

npm 脚本不会自动读取 `.env`。可复制 `.env.example` 为自己的 `.env`，然后直接启动：

```text
node --env-file=.env --import tsx server/index.ts
```

示例文件只启用本地合成模式。生产配置需要独立生成的会话密钥、访问码哈希和 HTTPS 站点来源；生产拒绝合成模式和 `1025` 的哈希。详见 [部署](DEPLOYMENT.md)。真实接口需另外阅读 [模型服务边界](MODEL_SERVICE.md)。

## 开发界面

先在一个终端启动合成后端，再在另一个终端运行 `npx vite`，打开 <http://127.0.0.1:5174/learn/>。开发代理指向本地 4318 端口。正式自部署使用构建结果和 Node 服务。
