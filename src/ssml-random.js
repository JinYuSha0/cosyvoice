function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, precision = 2) {
  const value = Math.random() * (max - min) + min;
  return Number(value.toFixed(precision));
}

function splitTextForSSML(text) {
  return String(text)
    .replace(/\s+/g, " ")
    .trim()
    .split(/([，,。！？；;：:])/)
    .filter((part) => part && part.trim());
}

function buildRandomBody(text) {
  const hasPunctuation = /[，,。！？；;：:]/.test(text);
  const targetSegments = hasPunctuation ? randomInt(1, 3) : randomInt(1, 2);
  const parts = splitTextForSSML(text);
  const chunks = [];
  let buffer = "";
  let lastWasComma = false;

  for (const part of parts) {
    buffer += part;
    const isComma = /[，,]/.test(part);
    const isStrongPunctuation = /[。！？；;：:]/.test(part);
    const shouldBreak =
      isStrongPunctuation || (!lastWasComma && isComma) || Math.random() < 0.35;
    if (shouldBreak || chunks.length + 1 === targetSegments) {
      chunks.push(buffer.trim());
      buffer = "";
    }
    lastWasComma = isComma;
  }

  if (buffer.trim()) chunks.push(buffer.trim());

  return chunks
    .filter(Boolean)
    .map((chunk, index) => {
      const inner = escapeXml(chunk);
      if (index === 0) return inner;
      const breakMs = randomInt(60, 100);
      return `<break time="${breakMs}ms"/>${inner}`;
    })
    .join("");
}

export function generateRandomSSML(text, options = {}) {
  const {
    minVolume = 25,
    maxVolume = 30,
    minRate = 1.0,
    maxRate = 1.5,
    effect = "lowpass",
  } = options;

  const volume = randomInt(minVolume, maxVolume);
  const rate = randomFloat(minRate, maxRate, 2);
  const body = buildRandomBody(text);

  return {
    ssml: `<speak rate="${rate}" effect="${effect}" volume="${volume}">${body}</speak>`,
    volume,
    rate,
  };
}
