const DEFAULT_TRANSLATION_MODEL =
  process.env.TRANSLATION_MODEL || "qwen-mt-plus";

function getTranslationBaseUrl() {
  const workspaceId = String(process.env.WORKSPACE_ID || "").trim();
  if (!workspaceId) throw new Error("缺少环境变量 WORKSPACE_ID");
  return `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`;
}

function stripPunctuation(value) {
  return String(value)
    .replace(/[，,。．\.！？!?；;：:、]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function translateText({
  text,
  targetLanguage = "中文",
  sourceLanguage = "自动",
  apiKey = process.env.DASHSCOPE_API_KEY,
  model = DEFAULT_TRANSLATION_MODEL,
} = {}) {
  const input = String(text || "").trim();
  if (!input) throw new Error("请输入要翻译的文本");
  if (!apiKey) throw new Error("缺少环境变量 DASHSCOPE_API_KEY");

  const response = await fetch(`${getTranslationBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            `你是一个非常擅长口语化改写的翻译助手。`,
            `请把下面内容从${sourceLanguage}翻译成${targetLanguage}。`,
            `要求：`,
            `1. 译文要像日常聊天里自然说出来的话，别太书面。`,
            `2. 尽量简短直接，去掉生硬的直译痕迹。`,
            `3. 保留原意、数字、专有名词。`,
            `4. 不要输出逗号、句号、顿号、分号、冒号等标点，尽量保持口语断句。`,
            `5. 只输出译文，不要解释，不要加前后缀。`,
            ``,
            input,
          ].join("\n"),
        },
      ],
      stream: false,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      data?.error ||
      `翻译失败（${response.status}）`;
    throw new Error(String(message));
  }

  const translated = stripPunctuation(data?.choices?.[0]?.message?.content);
  if (!translated) throw new Error("翻译服务没有返回内容");
  return {
    translatedText: translated,
    model,
  };
}
