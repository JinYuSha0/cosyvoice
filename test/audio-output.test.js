import assert from "node:assert/strict";
import test from "node:test";
import { findAudioOutputDevice, listAudioOutputDevices } from "../src/audio-output.js";

test("可以枚举并自动选择虚拟声卡", { skip: process.platform !== "win32" }, () => {
  const devices = listAudioOutputDevices();
  assert.ok(devices.length > 0);
  const device = findAudioOutputDevice();
  assert.match(device.name, /CABLE|VB-Audio|Voicemeeter|Virtual/i);
  assert.ok(device.maxOutputChannels > 0);
});

test("macOS 可以安全枚举 Core Audio 输出设备", {
  skip: process.platform !== "darwin",
}, () => {
  assert.ok(Array.isArray(listAudioOutputDevices()));
});
