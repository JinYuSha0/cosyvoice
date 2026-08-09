# CosyVoice MCP

将阿里云 CosyVoice 封装为本地 MCP 工具 `synthesize_speech`，供 Codex 等 MCP 客户端调用。

## 环境变量

在项目根目录 `.env` 中配置：

```env
DASHSCOPE_API_KEY=你的百炼API Key
WORKSPACE_ID=你的业务空间ID
```

翻译功能默认使用 `qwen3.5-flash`，如果你想改模型，可以额外设置：

```env
TRANSLATION_MODEL=qwen3.5-flash
```

## 依赖安装

项目需要系统里可直接执行 `ffmpeg`。如果还没有安装，请先安装后再运行项目。

Windows 可以用下面任一种方式：

```powershell
winget install Gyan.FFmpeg
```

或者手动下载 ffmpeg，并把 `bin` 目录加入 `PATH`。

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
args = ["cosyvoice/mcp-server.js"]
cwd = "cosyvoice"
```

配置后新开一个 Codex 任务，工具列表中应出现 `synthesize_speech`。

## 翻译功能

网页端提供“翻译到文本框”按钮，会调用 `/api/translate`：

- 输入原文后，选择目标语言
- 点击翻译，结果会直接回填到“文本”输入框
- 再点击“生成并播放”即可合成翻译后的内容

## 情绪控制

网页端新增了“情绪”下拉框，会按阿里云 CosyVoice 的 `instruct` 规范传入情绪控制指令。

支持的情绪包括：

- `neutral`
- `happy`
- `surprised`
- `fearful`
- `angry`
- `sad`
- `disgusted`

注意：

- 这项能力需要使用支持情绪控制的 CosyVoice 音色
- 如果当前默认音色不支持情绪，合成可能会失败
- 官方文档里 `cosyvoice-v3-plus` 和 `cosyvoice-v3-flash` 的部分音色支持情绪控制
