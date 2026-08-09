import fs from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve("data");
const settingsPath = path.join(dataDir, "settings.json");
const audioDevicePath = path.join(dataDir, "audio-device.json");

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(dataDir, { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temporaryPath, filePath);
}

export async function getSettings() {
  const stored = await readJson(settingsPath, {});
  return {
    DASHSCOPE_API_KEY:
      stored.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || "",
    WORKSPACE_ID: stored.WORKSPACE_ID || process.env.WORKSPACE_ID || "",
    DEFAULT_MODEL:
      stored.DEFAULT_MODEL ||
      process.env.DEFAULT_MODEL ||
      "cosyvoice-v3.5-plus",
    DEFAULT_VOICE: stored.DEFAULT_VOICE || process.env.DEFAULT_VOICE || "",
  };
}

export async function saveSettings(settings) {
  await writeJson(settingsPath, settings);
  return settings;
}

export async function getAudioDeviceSelection() {
  return readJson(audioDevicePath, { deviceId: null });
}

export async function saveAudioDeviceSelection(deviceId) {
  const selection = { deviceId };
  await writeJson(audioDevicePath, selection);
  return selection;
}
