import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { v4 as uuid } from "uuid";
import dotenv from "dotenv";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env"),
  quiet: true,
});

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "cosyvoice-v3.5-plus";
export const DEFAULT_VOICE = process.env.DEFAULT_VOICE || "cosyvoice-v3.5-plus-bailian-3908bec7d7e048dda0fa4bb0824fb48e";
const DEFAULT_OUTPUT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "tmp",
  "output.mp3"
);

export function synthesizeSpeech({
  text,
  outputPath = DEFAULT_OUTPUT_PATH,
  model = DEFAULT_MODEL,
  voice = DEFAULT_VOICE,
  format = "mp3",
  sampleRate = 22050,
  volume = 50,
  rate = 1,
  pitch = 1,
  enableSsml = false,
  instruction = "",
  apiKey = process.env.DASHSCOPE_API_KEY,
  workspaceId = process.env.WORKSPACE_ID,
  timeoutMs = 120000,
  signal,
} = {}) {
  if (!text?.trim()) throw new Error("text 不能为空");
  if (!apiKey) throw new Error("缺少环境变量 DASHSCOPE_API_KEY");
  if (!workspaceId) throw new Error("缺少环境变量 WORKSPACE_ID");

  const resolvedOutput = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
  const taskId = uuid();
  const url = `wss://${workspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference`;

  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `bearer ${apiKey}`,
        "X-DashScope-DataInspection": "enable",
      },
    });

    const timer = setTimeout(
      () => finish(new Error(`语音合成超时（${timeoutMs}ms）`)),
      timeoutMs
    );

    function abortWithSignal() {
      finish(new Error("已取消播放"));
    }

    if (signal) {
      if (signal.aborted) {
        finish(new Error("已取消播放"));
        return;
      }
      signal.addEventListener("abort", abortWithSignal, { once: true });
    }

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", abortWithSignal);
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        if (error?.message === "已取消播放") ws.terminate();
        else ws.close();
      }
      if (error) return reject(error);
      const audio = Buffer.concat(chunks);
      fs.writeFileSync(resolvedOutput, audio);
      resolve({
        outputPath: resolvedOutput,
        bytes: audio.length,
        model,
        voice,
        format,
        taskId,
      });
    }

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          header: { action: "run-task", task_id: taskId, streaming: "duplex" },
          payload: {
            task_group: "audio",
            task: "tts",
            function: "SpeechSynthesizer",
            model,
            parameters: {
              text_type: enableSsml ? "SSML" : "PlainText",
              voice,
              format,
              sample_rate: sampleRate,
              volume,
              rate,
              pitch,
              enable_ssml: enableSsml,
              instruction,
            },
            input: {},
          },
        })
      );
    });

    ws.on("message", (data, isBinary) => {
      if (isBinary) return chunks.push(Buffer.from(data));
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return finish(new Error("服务返回了无法解析的消息"));
      }

      if (message.header?.event === "task-started") {
        ws.send(
          JSON.stringify({
            header: {
              action: "continue-task",
              task_id: taskId,
              streaming: "duplex",
            },
            payload: { input: { text } },
          })
        );
        ws.send(
          JSON.stringify({
            header: {
              action: "finish-task",
              task_id: taskId,
              streaming: "duplex",
            },
            payload: { input: {} },
          })
        );
      } else if (message.header?.event === "task-finished") {
        finish();
      } else if (message.header?.event === "task-failed") {
        finish(
          new Error(
            message.header?.error_message ||
              message.header?.error_code ||
              "语音合成失败"
          )
        );
      }
    });

    ws.on("error", finish);
    ws.on("close", () => {
      if (!settled) finish(new Error("WebSocket 在任务完成前断开"));
    });
  });
}

export function synthesizeSpeechStream({
  text,
  model = DEFAULT_MODEL,
  voice = DEFAULT_VOICE,
  format = "mp3",
  sampleRate = 22050,
  volume = 50,
  rate = 1,
  pitch = 1,
  enableSsml = false,
  instruction = "",
  apiKey = process.env.DASHSCOPE_API_KEY,
  workspaceId = process.env.WORKSPACE_ID,
  timeoutMs = 120000,
  onChunk,
  signal,
} = {}) {
  if (!text?.trim()) throw new Error("text 不能为空");
  if (!apiKey) throw new Error("缺少环境变量 DASHSCOPE_API_KEY");
  if (!workspaceId) throw new Error("缺少环境变量 WORKSPACE_ID");

  const taskId = uuid();
  const url = `wss://${workspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference`;

  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `bearer ${apiKey}`,
        "X-DashScope-DataInspection": "enable",
      },
    });

    const timer = setTimeout(
      () => finish(new Error(`语音合成超时（${timeoutMs}ms）`)),
      timeoutMs
    );

    function abortWithSignal() {
      finish(new Error("已取消播放"));
    }

    if (signal) {
      if (signal.aborted) {
        finish(new Error("已取消播放"));
        return;
      }
      signal.addEventListener("abort", abortWithSignal, { once: true });
    }

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", abortWithSignal);
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        if (error?.message === "已取消播放") ws.terminate();
        else ws.close();
      }
      if (error) return reject(error);
      resolve({ model, voice, format, taskId });
    }

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          header: { action: "run-task", task_id: taskId, streaming: "duplex" },
          payload: {
            task_group: "audio",
            task: "tts",
            function: "SpeechSynthesizer",
            model,
            parameters: {
              text_type: enableSsml ? "SSML" : "PlainText",
              voice,
              format,
              sample_rate: sampleRate,
              volume,
              rate,
              pitch,
              enable_ssml: enableSsml,
              instruction,
            },
            input: {},
          },
        })
      );
    });

    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        if (onChunk) onChunk(Buffer.from(data));
        return;
      }
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return finish(new Error("服务返回了无法解析的消息"));
      }

      if (message.header?.event === "task-started") {
        ws.send(
          JSON.stringify({
            header: {
              action: "continue-task",
              task_id: taskId,
              streaming: "duplex",
            },
            payload: { input: { text } },
          })
        );
        ws.send(
          JSON.stringify({
            header: {
              action: "finish-task",
              task_id: taskId,
              streaming: "duplex",
            },
            payload: { input: {} },
          })
        );
      } else if (message.header?.event === "task-finished") {
        finish();
      } else if (message.header?.event === "task-failed") {
        finish(
          new Error(
            message.header?.error_message ||
              message.header?.error_code ||
              "语音合成失败"
          )
        );
      }
    });

    ws.on("error", finish);
    ws.on("close", () => {
      if (!settled) finish(new Error("WebSocket 在任务完成前断开"));
    });
  });
}
