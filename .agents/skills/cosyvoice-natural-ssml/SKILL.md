---
name: cosyvoice-natural-ssml
description: Convert Chinese or mixed-language text into restrained, human-sounding SSML and synthesize it through the configured CosyVoice MCP. Use when the user asks to read, narrate, voice, speak, dub, or generate audio naturally, especially when they request quieter speech, low-pass effect, varied delivery, conversational pacing, or less robotic TTS.
---

# CosyVoice Natural SSML

Turn the user's text into natural SSML, then call the CosyVoice MCP tool `synthesize_speech`.

## Workflow

1. Preserve the words, meaning, names, numbers, and sentence order. Do not add filler words unless explicitly requested.
2. Infer delivery from the text: conversational, informative, reassuring, serious, or energetic. Keep the result restrained.
3. Favor speed over variation when the user asks for faster turnaround: use the simplest valid SSML that still sounds natural, and avoid extra pauses or elaborate phrasing.
4. Wrap the complete text in exactly one root element:

   ```xml
   <speak rate="RATE" effect="lowpass" volume="VOLUME">CONTENT</speak>
   ```

5. Keep `effect="lowpass"` on every invocation. Choose `volume` from 24–30; prefer 27. Never exceed 32 unless the user explicitly asks for louder audio.
6. Choose the root `rate` from 0.98–1.04 when speed matters. Use at most one or two sparse `<break time="...ms"/>` elements for longer passages, and skip them entirely for short text.
7. XML-escape literal `&`, `<`, and `>` in source text. Do not escape the SSML tags themselves.
8. Call `synthesize_speech` with:
   - `text`: the generated SSML
   - `enable_ssml`: `true`
   - `volume`: `50` because loudness is controlled in SSML
   - `rate`: `1` and `pitch`: `1` unless explicitly requested otherwise
   - `output_path`: a unique, descriptive `.mp3` path inside the project `tmp/` directory so repeated calls do not overwrite earlier audio
9. The MCP automatically plays every successful synthesis to the virtual device configured by `COSYVOICE_OUTPUT_DEVICE`, or auto-selects CABLE/Virtual/Voicemeeter. Treat playback failure as an incomplete request. Never silently fall back to physical speakers.
10. Return the generated audio path and the virtual device reported in `playback.deviceName`.

## Naturalness constraints

- Keep variation minimal when prioritizing speed: one stable delivery pattern is fine unless the user asks for more personality.
- Keep most pauses between 120–280 ms. Use 350–520 ms only at genuine section boundaries.
- Use no more than one inserted break per short sentence and no more than two per 100 Chinese characters when speed is the goal.
- Avoid mechanical equal-length pauses. Never place a break after every comma.
- Do not use extreme pitch, rate, emphasis, or emotion markup.
- Do not claim biological randomness. Variation means selecting a different valid delivery pattern each invocation.
- For user-supplied SSML, preserve compatible markup but enforce one root `<speak>` with lowpass and quiet volume.

## Preflight check

Before calling the MCP, verify exactly one `<speak>` root exists, `effect="lowpass"` is present, root volume is 24–30, `enable_ssml` is true, spoken wording matches the source, and the output filename is unique. Confirm the MCP result includes `playback.deviceName`.
