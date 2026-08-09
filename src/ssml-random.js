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

function normalizeText(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function getTextLengthScore(text) {
  const length = normalizeText(text).replace(/[，,。！？；;：:、\s]/g, "").length;
  if (length <= 2) return -0.9;
  if (length <= 4) return -0.7;
  if (length <= 8) return -0.35;
  if (length <= 16) return 0;
  if (length <= 28) return 0.25;
  if (length <= 45) return 0.5;
  return 1;
}

function splitIntoTokens(text) {
  return normalizeText(text)
    .split(/([，,。！？；;：:、])/)
    .filter((part) => part && part.trim());
}

function stripEndPunctuation(value) {
  return String(value).replace(/[，,。！？；;：:、]+$/g, "").trim();
}

function classifySentence(text) {
  const value = normalizeText(text);
  if (/[?？]/.test(value)) return "question";
  if (/[!！]/.test(value)) return "exclaim";
  if (/[吗呢吧呀啊哦诶欸]/.test(value)) return "soft";
  return "statement";
}

function buildSentenceProfile(text) {
  const kind = classifySentence(text);
  if (kind === "question") {
    return {
      tailChance: 0.5,
      pauseStrength: 1.15,
      rateBias: -0.08,
      pitchBias: 0.03,
    };
  }
  if (kind === "exclaim") {
    return {
      tailChance: 0.35,
      pauseStrength: 0.95,
      rateBias: 0.03,
      pitchBias: 0.04,
    };
  }
  if (kind === "soft") {
    return {
      tailChance: 0.6,
      pauseStrength: 1.05,
      rateBias: -0.05,
      pitchBias: 0.02,
    };
  }
  return {
    tailChance: 0.28,
    pauseStrength: 1,
    rateBias: 0,
    pitchBias: 0,
  };
}

function maybeAddTailLengthening(text, amount = 0.14) {
  if (!text) return text;
  if (Math.random() > amount) return text;
  const lastChar = text.at(-1);
  if (!lastChar || /[\s<>&]/.test(lastChar)) return text;
  if (/[，,。！？；;：:、]/.test(lastChar)) return text;
  return `${text}<break time="${randomInt(40, 95)}ms"/>`;
}

function pickPauseMs({ kind, emphasis = 1 }) {
  const scale = Math.max(0.8, Math.min(1.4, emphasis));
  if (kind === "strong") return randomInt(180, Math.round(320 * scale));
  if (kind === "medium") return randomInt(110, Math.round(220 * scale));
  if (kind === "light") return randomInt(60, Math.round(130 * scale));
  return randomInt(80, Math.round(160 * scale));
}

function buildRandomBody(text, options = {}) {
  const tokens = splitIntoTokens(text);
  if (!tokens.length) return "";

  const {
    minChunkLength = 4,
    maxChunkLength = 11,
    pauseStrength = 1,
  } = options;

  const chunks = [];
  let buffer = "";

  for (const token of tokens) {
    buffer += token;

    const isLightPunctuation = /[，,、]/.test(token);
    const isStrongPunctuation = /[。！？；;：:]/.test(token);
    const chunkLength = normalizeText(buffer).length;
    const prevToken = chunks[chunks.length - 1] || "";
    const prevEndedStrong = /[。！？；;：:]/.test(prevToken);
    const shouldFlush =
      isStrongPunctuation ||
      (isLightPunctuation && Math.random() < 0.55) ||
      (chunkLength >= maxChunkLength && Math.random() < 0.85) ||
      (chunkLength >= minChunkLength && Math.random() < 0.12) ||
      (prevEndedStrong && chunkLength >= Math.max(3, Math.floor(minChunkLength / 2)));

    if (shouldFlush) {
      chunks.push(buffer.trim());
      buffer = "";
    }
  }

  if (buffer.trim()) chunks.push(buffer);

  return chunks
    .map((chunk, index) => {
      const clean = stripEndPunctuation(chunk);
      if (!clean) return "";
      const tailChance =
        clean.length <= 4 ? 0.55 : clean.length <= 8 ? 0.28 : 0.12;
      const voiced = maybeAddTailLengthening(escapeXml(clean), tailChance);
      if (index === 0) return voiced;

      const previous = chunks[index - 1] || "";
      const endedStrong = /[。！？；;：:]/.test(previous);
      const endedLight = /[，,、]/.test(previous);
      const pauseKind = endedStrong ? "strong" : endedLight ? "medium" : "light";
      const pauseMs = pickPauseMs({
        kind: pauseKind,
        emphasis: pauseStrength,
      });
      return `<break time="${pauseMs}ms"/>${voiced}`;
    })
    .join("");
}

export function generateRandomSSML(text, options = {}) {
  const {
    minVolume = 25,
    maxVolume = 30,
    minRate = 0.92,
    maxRate = 1.06,
    minPitch = 0.98,
    maxPitch = 1.03,
    effect = "lowpass",
    pauseStrength = 1,
    minChunkLength = 2,
    maxChunkLength = 7,
  } = options;

  const sentenceProfile = buildSentenceProfile(text);
  const lengthScore = getTextLengthScore(text);
  const rateMid = (minRate + maxRate) / 2;
  const rateBias = lengthScore < 0
    ? lengthScore * (maxRate - minRate) * 1.0
    : lengthScore * (maxRate - minRate) * 0.25;
  const targetRate = rateMid + rateBias + sentenceProfile.rateBias;
  const rateFloor = Math.max(minRate * 0.75, targetRate - (maxRate - minRate) * 0.12);
  const rateCeiling = Math.min(maxRate, targetRate + (maxRate - minRate) * 0.1);
  const volume = randomInt(minVolume, maxVolume);
  const rate = Math.max(0.65, randomFloat(rateFloor, rateCeiling, 2));
  const pitch = randomFloat(
    Math.max(0.9, minPitch + sentenceProfile.pitchBias),
    Math.min(1.08, maxPitch + sentenceProfile.pitchBias),
    2
  );
  const body = buildRandomBody(text, {
    pauseStrength: Math.max(0.85, pauseStrength * sentenceProfile.pauseStrength),
    minChunkLength,
    maxChunkLength,
  });

  return {
    ssml: `<speak rate="${rate}" pitch="${pitch}" effect="${effect}" volume="${volume}">${body}</speak>`,
    volume,
    rate,
    pitch,
  };
}
