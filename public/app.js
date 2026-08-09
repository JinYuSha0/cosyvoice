const form = document.querySelector("#generate-form");
const statusBox = document.querySelector("#status");
const systemPromptKey = "cosyvoice.systemPrompt";
const outputDevice = document.querySelector("#outputDevice");
const translateButton = document.querySelector("#translate-button");
const cancelButton = document.querySelector("#cancel-playback");
const targetLanguage = document.querySelector("#targetLanguage");
const textInput = document.querySelector("#text");
const translatedTextInput = document.querySelector("#translatedText");
const audioProfile = document.querySelector("#audioProfile");
const emotion = document.querySelector("#emotion");
const defaultSystemPrompt =
  "不要播音腔 不要字正腔圆 咬字稍微模糊一点 每个字后轻微拖尾 语气自然像真人聊天 短文本读慢一点 句子中间多一点停顿";

function submitOnEnter(textarea, handler) {
  textarea.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    handler();
  });
}

form.systemPrompt.value = localStorage.getItem(systemPromptKey) || defaultSystemPrompt;
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

function setPlaybackControls(isBusy) {
  cancelButton.disabled = !isBusy;
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

async function translateText() {
  const sourceText = translatedTextInput.value.trim() || textInput.value.trim();
  const text = sourceText;
  if (!text) {
    showStatus("请先输入要翻译的文本", "error");
    return;
  }
  translateButton.disabled = true;
  showStatus(`正在翻译成${targetLanguage.value}...`);
  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        targetLanguage: targetLanguage.value,
        sourceLanguage: "自动",
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "翻译失败");
    textInput.value = result.translatedText;
    showStatus(`翻译完成（${result.model}）`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    translateButton.disabled = false;
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

translateButton.addEventListener("click", translateText);
cancelButton.addEventListener("click", async () => {
  cancelButton.disabled = true;
  try {
    await fetch("/api/playback/cancel", { method: "POST" });
    showStatus("已取消播放", "success");
  } catch (error) {
    showStatus(error.message, "error");
  }
});
submitOnEnter(textInput, () => form.requestSubmit());
submitOnEnter(translatedTextInput, () => form.requestSubmit());

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  setPlaybackControls(true);
  showStatus("正在合成并播放，请稍候...");
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: textInput.value,
        systemPrompt: form.systemPrompt.value,
        minVolume: Number(form.minVolume.value),
        maxVolume: Number(form.maxVolume.value),
        minRate: Number(form.minRate.value),
        maxRate: Number(form.maxRate.value),
        effect: form.effect.value.trim(),
        audioProfile: audioProfile.value,
        emotion: emotion.value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "生成失败");
    showStatus(`播放完成：${result.playback.deviceName}`, "success");
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    button.disabled = false;
    setPlaybackControls(false);
  }
});

loadAudioDevices().catch((error) => showStatus(error.message, "error"));
