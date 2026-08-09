#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DEFAULT_MODEL, DEFAULT_VOICE, synthesizeSpeech } from "./src/cosyvoice.js";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(projectDir, ".env"), quiet: true });

const server = new McpServer({ name: "cosyvoice", version: "1.0.0" });

server.registerTool(
  "synthesize_speech",
  {
    title: "CosyVoice 语音合成",
    description: "使用阿里云 CosyVoice 将文本或 SSML 合成为本地音频文件。",
    inputSchema: {
      text: z.string().min(1).describe("要朗读的文本或完整的 <speak>...</speak> SSML"),
      output_path: z.string().optional().describe("输出文件路径；默认是项目 tmp 目录下的 output.mp3"),
      model: z.string().default(DEFAULT_MODEL),
      voice: z.string().default(DEFAULT_VOICE),
      format: z.enum(["mp3", "wav", "pcm"]).default("mp3"),
      sample_rate: z.number().int().positive().default(22050),
      volume: z.number().min(0).max(100).default(50),
      rate: z.number().min(0.5).max(2).default(1),
      pitch: z.number().min(0.5).max(2).default(1),
      enable_ssml: z.boolean().default(false),
    },
  },
  async (args) => {
    const totalStartedAt = performance.now();
    try {
      const synthesisStartedAt = performance.now();
      const result = await synthesizeSpeech({
        text: args.text,
        outputPath: args.output_path,
        model: args.model,
        voice: args.voice,
        format: args.format,
        sampleRate: args.sample_rate,
        volume: args.volume,
        rate: args.rate,
        pitch: args.pitch,
        enableSsml: args.enable_ssml,
      });
      const synthesisMs = performance.now() - synthesisStartedAt;

      const { playAudioFile } = await import("./src/audio-output.js");
      const playbackStartedAt = performance.now();
      result.playback = await playAudioFile(result.outputPath);
      const playbackMs = performance.now() - playbackStartedAt;
      result.timings = {
        synthesisMs: Math.round(synthesisMs),
        playbackMs: Math.round(playbackMs),
        totalMs: Math.round(performance.now() - totalStartedAt),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: error.message }] };
    }
  },
);

await server.connect(new StdioServerTransport());
