const form = document.querySelector("#settings-form");
const statusBox = document.querySelector("#status");
const fields = ["DASHSCOPE_API_KEY", "WORKSPACE_ID", "DEFAULT_MODEL", "DEFAULT_VOICE"];

function showStatus(message, type) {
  statusBox.hidden = false;
  statusBox.className = `status ${type}`;
  statusBox.textContent = message;
}

async function loadSettings() {
  const response = await fetch("/api/settings");
  const settings = await response.json();
  fields.forEach((field) => { form[field].value = settings[field] || ""; });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(fields.map((field) => [field, form[field].value.trim()]));
  try {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "保存失败");
    showStatus("配置已保存到本机。", "success");
  } catch (error) {
    showStatus(error.message, "error");
  }
});

loadSettings().catch((error) => showStatus(error.message, "error"));
