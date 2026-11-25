/** Normalize stored peaks to 0–1 floats for rendering (max 64 bars). */
export function normalizeWaveformPeaks(raw, barCount = 32) {
  if (!Array.isArray(raw) || raw.length === 0) return buildFallbackWaveform(barCount);
  const nums = raw
    .slice(0, 64)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v >= 0);
  if (!nums.length) return buildFallbackWaveform(barCount);
  const max = Math.max(...nums, 0.01);
  const scaled = nums.map((v) => Math.min(1, v / max));
  if (scaled.length >= barCount) return scaled.slice(0, barCount);
  const out = [...scaled];
  while (out.length < barCount) out.push(scaled[out.length % scaled.length]);
  return out.slice(0, barCount);
}

/** Placeholder waveform when peaks are missing (deterministic pseudo-random bars). */
export function buildFallbackWaveform(barCount = 32) {
  const out = [];
  for (let i = 0; i < barCount; i++) {
    const t = i / barCount;
    out.push(0.25 + 0.55 * Math.abs(Math.sin(t * Math.PI * 3 + 0.4)));
  }
  return out;
}

/**
 * Decode audio blob and return normalized peak bars (0–1). Returns fallback on failure.
 */
export async function extractWaveformPeaks(blob, barCount = 32) {
  if (!blob || typeof blob.arrayBuffer !== "function") {
    return buildFallbackWaveform(barCount);
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return buildFallbackWaveform(barCount);

  let audioContext;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    if (!arrayBuffer?.byteLength) return buildFallbackWaveform(barCount);

    audioContext = new AC();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    if (!channel?.length) return buildFallbackWaveform(barCount);

    const blockSize = Math.max(1, Math.floor(channel.length / barCount));
    const peaks = [];
    for (let i = 0; i < barCount; i++) {
      let max = 0;
      const start = i * blockSize;
      const end = Math.min(channel.length, start + blockSize);
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    return normalizeWaveformPeaks(peaks, barCount);
  } catch {
    return buildFallbackWaveform(barCount);
  } finally {
    try {
      await audioContext?.close();
    } catch {
      /* ignore */
    }
  }
}
