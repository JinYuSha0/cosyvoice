import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let portAudio;

function getPortAudio() {
  portAudio ??= require("naudiodon");
  return portAudio;
}

const VIRTUAL_DEVICE_PATTERNS = ["CABLE Input", "VB-Audio", "Voicemeeter", "Virtual"];

function buildNaturalLossFilter(profile = process.env.COSYVOICE_AUDIO_PROFILE || "natural") {
  const normalized = String(profile || "natural").trim();
  if (normalized === "raw") return [];
  if (normalized === "lofi") {
    return [
      "-af",
      [
        "highpass=f=130",
        "lowpass=f=7200",
        "acompressor=threshold=-26dB:ratio=3.2:attack=30:release=260:makeup=4",
        "acrusher=bits=12:mode=log:mix=0.35",
        "afftdn=nf=-20",
        "volume=0.88",
      ].join(","),
    ];
  }
  if (normalized === "warm") {
    return [
      "-af",
      [
        "highpass=f=80",
        "lowpass=f=10200",
        "acompressor=threshold=-22dB:ratio=2.1:attack=18:release=220:makeup=2.5",
        "dynaudnorm=f=100:g=8:p=0.88",
        "volume=0.93",
      ].join(","),
    ];
  }
  if (profile === "raw") return [];
  return [
    "-af",
    [
      "highpass=f=75",
      "lowpass=f=11800",
      "acompressor=threshold=-20dB:ratio=1.9:attack=18:release=200:makeup=2",
      "dynaudnorm=f=85:g=7:p=0.9",
      "volume=0.94",
    ].join(","),
  ];
}

function formatFfmpegError(error, stderr = "") {
  if (error?.code === "ENOENT") {
    return new Error("未找到 ffmpeg。请先安装 ffmpeg 并将其加入 PATH，然后重试。");
  }
  if (stderr?.trim()) {
    return new Error(`ffmpeg 解码失败：${stderr.trim()}`);
  }
  return new Error(`无法启动 ffmpeg：${error?.message || String(error)}`);
}

export function listAudioOutputDevices() {
  return getPortAudio().getDevices()
    .filter((device) => device.maxOutputChannels > 0)
    .map((device) => ({
      id: device.id,
      name: device.name,
      hostAPIName: device.hostAPIName,
      maxOutputChannels: device.maxOutputChannels,
      defaultSampleRate: device.defaultSampleRate,
    }));
}

export function findAudioOutputDevice(query = process.env.COSYVOICE_OUTPUT_DEVICE) {
  const devices = listAudioOutputDevices();
  const normalizedQuery = String(query ?? "").trim();
  const requestedId = Number(normalizedQuery);
  if (normalizedQuery && Number.isInteger(requestedId)) {
    const deviceById = devices.find((device) => device.id === requestedId);
    if (deviceById) return deviceById;
  }
  const terms = normalizedQuery ? [normalizedQuery] : VIRTUAL_DEVICE_PATTERNS;
  const matches = devices.filter((device) =>
    terms.some((term) => device.name.toLowerCase().includes(term.toLowerCase())),
  );

  // naudiodon's Windows MME backend drains reliably; WASAPI can hang on quit.
  const device = matches.sort((a, b) => {
    const score = (item) =>
      (item.hostAPIName === "MME" ? 100 : 0) +
      (item.maxOutputChannels === 2 ? 10 : 0) +
      (item.name.toLowerCase().startsWith("cable input") ? 5 : 0);
    return score(b) - score(a);
  })[0];

  if (!device) {
    const names = devices.map(({ id, name, hostAPIName }) => `${id}: ${name} [${hostAPIName}]`).join("\n");
    throw new Error(`未找到虚拟声卡${query ? `（匹配：${query}）` : ""}。可用输出设备：\n${names}`);
  }
  return device;
}

export function playAudioFile(filePath, { deviceQuery, audioProfile } = {}) {
  const portAudio = getPortAudio();
  const device = findAudioOutputDevice(deviceQuery);
  const sampleRate = device.defaultSampleRate || 48000;
  const channelCount = Math.min(2, device.maxOutputChannels);

  return new Promise((resolve, reject) => {
    const audioOutput = new portAudio.AudioIO({
      outOptions: {
        channelCount,
        sampleFormat: portAudio.SampleFormat16Bit,
        sampleRate,
        deviceId: device.id,
        closeOnError: true,
      },
    });
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", filePath,
      ...buildNaturalLossFilter(audioProfile),
      "-f", "s16le", "-acodec", "pcm_s16le",
      "-ar", String(sampleRate), "-ac", String(channelCount), "pipe:1",
    ], { windowsHide: true });

    let stderr = "";
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve({ deviceId: device.id, deviceName: device.name, hostAPIName: device.hostAPIName });
    };

    ffmpeg.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    ffmpeg.on("error", (error) => finish(formatFfmpegError(error)));
    ffmpeg.on("close", (code) => {
      if (code !== 0) finish(formatFfmpegError(new Error(`exit ${code}`), stderr));
    });
    audioOutput.on("error", finish);
    audioOutput.on("finished", () => finish());
    ffmpeg.stdout.pipe(audioOutput);
    audioOutput.start();
  });
}

export function createStreamAudioPlayer({ deviceQuery, audioProfile } = {}) {
  const portAudio = getPortAudio();
  const device = findAudioOutputDevice(deviceQuery);
  const sampleRate = device.defaultSampleRate || 48000;
  const channelCount = Math.min(2, device.maxOutputChannels);
  const prebufferBytes = sampleRate * channelCount * 2;
  const audioOutput = new portAudio.AudioIO({
    outOptions: {
      channelCount,
      sampleFormat: portAudio.SampleFormat16Bit,
      sampleRate,
      deviceId: device.id,
      closeOnError: true,
    },
  });

  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      ...buildNaturalLossFilter(audioProfile),
      "-f",
      "s16le",
      "-acodec",
      "pcm_s16le",
      "-ar",
      String(sampleRate),
      "-ac",
      String(channelCount),
      "pipe:1",
    ],
    { windowsHide: true }
  );

  let stderr = "";
  let settled = false;
  let started = false;
  let bufferedBytes = 0;
  let drainTimer;
  const pendingChunks = [];
  let resolveWait;
  let rejectWait;
  const waitPromise = new Promise((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });

  function settleOk() {
    if (settled) return;
    settled = true;
    clearTimeout(drainTimer);
    resolveWait({
      deviceId: device.id,
      deviceName: device.name,
      hostAPIName: device.hostAPIName,
    });
  }

  function settleError(error) {
    if (settled) return;
    settled = true;
    clearTimeout(drainTimer);
    rejectWait(error);
  }

  function isUnderflowError(error) {
    return String(error?.message || error).toLowerCase().includes("underflow");
  }

  ffmpeg.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  ffmpeg.on("error", (error) => {
    settleError(formatFfmpegError(error));
  });
  ffmpeg.on("close", (code) => {
    if (code === 0) {
      if (!started) {
        audioOutput.start();
        started = true;
        for (const pending of pendingChunks.splice(0)) {
          audioOutput.write(pending);
        }
      }
      // Some PortAudio backends never emit naudiodon's custom "finished" event.
      drainTimer = setTimeout(settleOk, 3000);
      audioOutput.end();
    } else {
      settleError(formatFfmpegError(new Error(`exit ${code}`), stderr));
    }
  });
  audioOutput.on("error", (error) => {
    if (isUnderflowError(error)) return;
    settleError(error);
  });
  audioOutput.on("finish", settleOk);
  audioOutput.on("finished", settleOk);

  ffmpeg.stdout.on("data", (chunk) => {
    if (settled) return;
    if (!started) {
      pendingChunks.push(chunk);
      bufferedBytes += chunk.length;
      if (bufferedBytes < prebufferBytes) return;
      audioOutput.start();
      started = true;
      for (const pending of pendingChunks.splice(0)) {
        audioOutput.write(pending);
      }
      return;
    }
    audioOutput.write(chunk);
  });

  return {
    deviceId: device.id,
    deviceName: device.name,
    hostAPIName: device.hostAPIName,
    write(chunk) {
      return ffmpeg.stdin.write(chunk);
    },
    end() {
      if (!ffmpeg.stdin.destroyed) ffmpeg.stdin.end();
    },
    cancel() {
      if (!settled) {
        settled = true;
        clearTimeout(drainTimer);
        rejectWait(new Error("已取消播放"));
      }
      try {
        if (!ffmpeg.stdin.destroyed) ffmpeg.stdin.destroy();
      } catch {}
      try {
        ffmpeg.kill("SIGKILL");
      } catch {}
      try {
        audioOutput.end();
      } catch {}
      try {
        audioOutput.quit?.();
      } catch {}
    },
    wait() {
      return waitPromise;
    },
  };
}
