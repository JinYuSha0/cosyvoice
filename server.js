#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import dotenv from "dotenv";
import { v4 as uuid } from "uuid";
import { synthesizeSpeechStream } from "./src/cosyvoice.js";
import {
  createStreamAudioPlayer,
  listAudioOutputDevices,
} from "./src/audio-output.js";
import { generateRandomSSML } from "./src/ssml-random.js";
import { translateText } from "./src/translate.js";
import {
  getAudioDeviceSelection,
  getSettings,
  saveAudioDeviceSelection,
  saveSettings,
} from "./src/storage.js";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(projectDir, ".env"), quiet: true });

const app = new Hono();
let playbackQueue = Promise.resolve();
let activePlayback = null;
let activeGenerationController = null;
let playbackSession = 0;

function buildEmotionInstruction(emotion) {
  const normalized = String(emotion || "none").trim();
  if (normalized === "none") return "";
  const emotions = [
    "neutral",
    "happy",
    "surprised",
    "fearful",
    "angry",
    "sad",
    "disgusted",
  ];
  const selected =
    normalized === "random"
      ? emotions[Math.floor(Math.random() * emotions.length)]
      : normalized;
  return `你正在进行办公互动，你说话的情感是${selected}。`;
}

app.get("/api/settings", async (c) => c.json(await getSettings()));

app.put("/api/settings", async (c) => {
  const body = await c.req.json();
  const settings = Object.fromEntries(
    ["DASHSCOPE_API_KEY", "WORKSPACE_ID", "DEFAULT_MODEL", "DEFAULT_VOICE"].map(
      (key) => [key, String(body[key] || "").trim()]
    )
  );
  if (Object.values(settings).some((value) => !value)) {
    return c.json({ error: "四项配置均不能为空" }, 400);
  }
  await saveSettings(settings);
  return c.json({ ok: true, settings });
});

app.get("/api/audio-devices", async (c) => {
  const hostAPIName = process.platform === "darwin" ? "Core Audio" : "MME";
  const devices = listAudioOutputDevices().filter(
    (device) => device.hostAPIName === hostAPIName
  );
  const selection = await getAudioDeviceSelection();
  const fallbackDevice =
    devices.find((device) =>
      /CABLE Input|VB-Audio|Voicemeeter|Virtual/i.test(device.name)
    ) || devices[0];
  const selectedDeviceId = devices.some(
    (device) => device.id === selection.deviceId
  )
    ? selection.deviceId
    : fallbackDevice?.id ?? null;
  if (selectedDeviceId !== selection.deviceId) {
    await saveAudioDeviceSelection(selectedDeviceId);
  }
  return c.json({ devices, selectedDeviceId });
});

app.put("/api/audio-device", async (c) => {
  const body = await c.req.json();
  const deviceId = Number(body.deviceId);
  const hostAPIName = process.platform === "darwin" ? "Core Audio" : "MME";
  const device = listAudioOutputDevices().find(
    (item) => item.id === deviceId && item.hostAPIName === hostAPIName
  );
  if (!device) return c.json({ error: "选择的输出设备不存在" }, 400);
  await saveAudioDeviceSelection(deviceId);
  return c.json({ ok: true, device });
});

app.post("/api/playback/cancel", async (c) => {
  playbackSession += 1;
  if (activeGenerationController) {
    activeGenerationController.abort();
    activeGenerationController = null;
  }
  if (activePlayback) {
    activePlayback.cancel();
    activePlayback = null;
  }
  return c.json({ ok: true });
});

app.post("/api/generate", async (c) => {
  const body = await c.req.json();
  const text = String(body.text || "").trim();
  const instruction = String(body.systemPrompt || "").trim();
  const emotion = String(body.emotion || "none").trim();
  const audioProfile = String(body.audioProfile || "natural").trim();
  const minVolume = Number(body.minVolume);
  const maxVolume = Number(body.maxVolume);
  const minRate = Number(body.minRate);
  const maxRate = Number(body.maxRate);
  const effect = String(body.effect || "").trim();
  if (!text) return c.json({ error: "请输入要生成的文本" }, 400);
  if (![minVolume, maxVolume, minRate, maxRate].every(Number.isFinite)) {
    return c.json({ error: "音量和语速必须是有效数字" }, 400);
  }
  if (minVolume < 0 || maxVolume > 100 || minVolume > maxVolume) {
    return c.json({ error: "音量范围应为 0–100，且最小值不能大于最大值" }, 400);
  }
  if (minRate < 0.5 || maxRate > 2 || minRate > maxRate) {
    return c.json({ error: "语速范围应为 0.5–2，且最小值不能大于最大值" }, 400);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(effect)) {
    return c.json({ error: "effect 只能包含字母、数字、下划线和短横线" }, 400);
  }

  const settings = await getSettings();
  if (
    !settings.DASHSCOPE_API_KEY ||
    !settings.WORKSPACE_ID ||
    !settings.DEFAULT_VOICE
  ) {
    return c.json({ error: "请先在设置页完成 CosyVoice 配置" }, 400);
  }

  const { ssml, volume, rate, pitch } = generateRandomSSML(text, {
    minVolume,
    maxVolume,
    minRate,
    maxRate,
    effect,
  });
  console.log(ssml);
  const id = uuid();
  const session = playbackSession;
  const controller = new AbortController();

  try {
    const generateAndPlay = async () => {
      if (session !== playbackSession) {
        throw new Error("已取消播放");
      }
      activeGenerationController = controller;
      const { deviceId } = await getAudioDeviceSelection();
      const player = createStreamAudioPlayer({
        deviceQuery: deviceId ?? process.env.COSYVOICE_OUTPUT_DEVICE,
        audioProfile,
      });
      activePlayback = player;
      // Attach a handler immediately so an early PortAudio failure never becomes unhandled.
      const playbackPromise = player.wait();
      playbackPromise.catch(() => {});

      try {
        if (session !== playbackSession) {
          player.cancel();
          throw new Error("已取消播放");
        }
        await synthesizeSpeechStream({
          text: ssml,
          model: settings.DEFAULT_MODEL,
          voice: settings.DEFAULT_VOICE,
          apiKey: settings.DASHSCOPE_API_KEY,
          workspaceId: settings.WORKSPACE_ID,
          enableSsml: true,
          instruction: [buildEmotionInstruction(emotion), instruction]
            .filter(Boolean)
            .join("\n"),
          volume,
          rate,
          // pitch,
          signal: controller.signal,
          onChunk(chunk) {
            player.write(chunk);
          },
        });
      } finally {
        player.end();
        if (activePlayback === player) activePlayback = null;
        if (activeGenerationController === controller)
          activeGenerationController = null;
      }

      const playback = await playbackPromise;
      if (session !== playbackSession) {
        throw new Error("已取消播放");
      }
      return playback;
    };

    playbackQueue = playbackQueue.catch(() => {}).then(generateAndPlay);
    const playback = await playbackQueue;
    const generation = {
      id,
      text,
      systemPrompt: instruction,
      ssml,
      volume,
      rate,
      effect,
      playback,
      createdAt: new Date().toISOString(),
    };
    return c.json(generation);
  } catch (error) {
    return c.json({ error: error.message || String(error) }, 500);
  }
});

app.post("/api/translate", async (c) => {
  const body = await c.req.json();
  const text = String(body.text || "").trim();
  const targetLanguage = String(body.targetLanguage || "中文").trim();
  const sourceLanguage = String(body.sourceLanguage || "自动").trim();
  if (!text) return c.json({ error: "请输入要翻译的文本" }, 400);
  try {
    const result = await translateText({
      text,
      targetLanguage,
      sourceLanguage,
    });
    return c.json(result);
  } catch (error) {
    return c.json({ error: error.message || String(error) }, 500);
  }
});

app.get("/settings", serveStatic({ path: "./public/settings.html" }));
app.use("/*", serveStatic({ root: "./public" }));

const port = Number(process.env.PORT || 3000);
serve({ fetch: app.fetch, port }, ({ port: actualPort }) => {
  console.log(`CosyVoice Web: http://localhost:${actualPort}`);
});
