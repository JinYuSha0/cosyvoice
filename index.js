#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { synthesizeSpeechStream } from "./src/cosyvoice.js";
import { createStreamAudioPlayer } from "./src/audio-output.js";
import { generateRandomSSML } from "./src/ssml-random.js";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(projectDir, ".env"), quiet: true });

const text = process.argv.slice(2).join(" ").trim() || "已经解决了";

const ssml = text.startsWith("<speak")
  ? text
  : generateRandomSSML(text, {
      minVolume: 18,
      maxVolume: 20,
      minRate: 0.98,
      maxRate: 1.1,
      effect: "lowpass",
    }).ssml;

console.log(ssml);

const outputPath = path.join(
  projectDir,
  "tmp",
  `demo-${new Date().toISOString().replace(/[:.]/g, "-")}.mp3`
);

async function main() {
  console.log("开始合成...");
  const player = createStreamAudioPlayer({
    deviceQuery: process.env.COSYVOICE_OUTPUT_DEVICE,
  });
  const instruction = "咬字不清晰，像是平常说话的语气，时快时慢";
  const result = await synthesizeSpeechStream({
    text: ssml,
    enableSsml: true,
    volume: 50,
    rate: 1,
    pitch: 1,
    instruction,
    onChunk(chunk) {
      player.write(chunk);
    },
  });

  player.end();
  const playback = await player.wait();

  console.log(
    JSON.stringify(
      {
        outputPath,
        model: result.model,
        voice: result.voice,
        playback,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
