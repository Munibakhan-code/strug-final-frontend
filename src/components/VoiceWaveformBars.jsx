import React from "react";

/**
 * WhatsApp-style waveform bars. `progress` is 0–1 scrub position for played portion tint.
 */
export function VoiceWaveformBars({
  peaks,
  progress = 0,
  barCount = 32,
  height = 28,
  activeColor = "#53bdeb",
  inactiveColor = "rgba(255,255,255,0.45)",
  inactiveColorThem = "var(--color-text-muted)",
  isMe = false,
  className = "",
}) {
  const bars = Array.isArray(peaks) && peaks.length ? peaks : null;
  const count = bars?.length ?? barCount;
  const safeProgress = Math.min(1, Math.max(0, Number(progress) || 0));
  const playedBars = Math.floor(safeProgress * count);

  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        height,
        minWidth: 0,
        flex: 1,
      }}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => {
        const raw = bars ? bars[i] : 0.3 + 0.5 * Math.abs(Math.sin((i / count) * Math.PI * 2.5));
        const barH = Math.max(4, Math.round(raw * height));
        const played = i < playedBars;
        const color = played
          ? activeColor
          : isMe
            ? inactiveColor
            : inactiveColorThem;
        return (
          <span
            key={i}
            style={{
              width: 3,
              height: barH,
              borderRadius: 2,
              background: color,
              flexShrink: 0,
              transition: "background 0.08s linear",
            }}
          />
        );
      })}
    </div>
  );
}
