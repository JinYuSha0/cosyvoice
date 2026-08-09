const form = document.querySelector("#generate-form");
const statusBox = document.querySelector("#status");
const systemPromptKey = "cosyvoice.systemPrompt";
const outputDevice = document.querySelector("#outputDevice");

form.systemPrompt.value = localStorage.getItem(systemPromptKey) || "";
form.systemPrompt.addEventListener("input", () => {
  localStorage.setItem(systemPromptKey, form.systemPrompt.value);
});

const voiceSettingsSummary = document.querySelector("#voice-settings-summary");
function updateVoiceSettingsSummary() {
  voiceSettingsSummary.textContent = `音量 ${form.minVolume.value}–${form.maxVolume.value} · 语速 ${form.minRate.value}–${form.maxRate.value} · ${form.effect.value}`;
}
[form.minVolume, form.maxVolume, form.minRate, form.maxRate, form.effect].forEach((input) => {
  input.addEventListener("input", updateVoiceSettingsSummary);
});

function showStatus(message, type = "working") {
  statusBox.hidden = false;
  statusBox.className = `status ${type}`;
  statusBox.textContent = message;
}

async function loadAudioDevices() {
  const response = await fetch("/api/audio-devices");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "读取输出设备失败");
  outputDevice.replaceChildren(
    ...result.devices.map((device) => {
      const option = document.createElement("option");
      option.value = String(device.id);
      option.textContent = `${device.name} · ${device.hostAPIName}`;
      return option;
    })
  );
  if (!result.devices.length) {
    outputDevice.add(new Option("没有可用的输出设备", ""));
  } else if (result.devices.some((device) => device.id === result.selectedDeviceId)) {
    outputDevice.value = String(result.selectedDeviceId);
  }
}

outputDevice.addEventListener("change", async () => {
  try {
    const response = await fetch("/api/audio-device", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: Number(outputDevice.value) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "保存输出设备失败");
    showStatus(`输出设备已保存：${result.device.name}`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  showStatus("正在合成并播放，请稍候...");
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: form.text.value,
        systemPrompt: form.systemPrompt.value,
        minVolume: Number(form.minVolume.value),
        maxVolume: Number(form.maxVolume.value),
        minRate: Number(form.minRate.value),
        maxRate: Number(form.maxRate.value),
        effect: form.effect.value.trim(),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "生成失败");
    showStatus(`播放完成：${result.playback.deviceName}`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

loadAudioDevices().catch((error) => showStatus(error.message, "error"));
