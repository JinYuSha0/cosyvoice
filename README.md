# CosyVoice MCP

将阿里云 CosyVoice 封装为本地 MCP 工具 `synthesize_speech`，供 Codex 等 MCP 客户端调用。

## 环境变量

在项目根目录 `.env` 中配置：

```env
DASHSCOPE_API_KEY=你的百炼API Key
WORKSPACE_ID=你的业务空间ID
```

## 本地运行

```powershell
npm run mcp
```

MCP 使用 stdio 传输，客户端应以项目根目录作为工作目录启动 `node mcp-server.js`。

默认情况下，`synthesize_speech` 合成后会自动播放到名称含 `CABLE`、`VB-Audio`、`Voicemeeter` 或 `Virtual` 的虚拟声卡。可在 `.env` 精确指定：

```env
COSYVOICE_OUTPUT_DEVICE=CABLE Input (VB-Audio Virtual Cable)
```

每次成功合成后都会自动播放，返回结果中的 `playback.deviceName` 表示实际使用的虚拟声卡。
生成的 MP3 默认保存在项目的 `tmp/` 目录中；该目录不会纳入 Git。

## Codex 配置

```toml
[mcp_servers.cosyvoice]
command = "node"
args = ["C:/Users/a1009/Downloads/voice_change/cosyvoice/mcp-server.js"]
cwd = "C:/Users/a1009/Downloads/voice_change/cosyvoice"
```

配置后新开一个 Codex 任务，工具列表中应出现 `synthesize_speech`。
