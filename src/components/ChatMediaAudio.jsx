import React, { useCallback, useEffect, useRef, useState } from "react";
import { useChatMediaUrl } from "../hooks/useChatMediaUrl.js";
import { isAzureBlobUrl } from "../utils/chatMedia.js";
import {
  buildFallbackWaveform,
  normalizeWaveformPeaks,
} from "../utils/voiceWaveformHelpers.js";
import { VoiceWaveformBars } from "./VoiceWaveformBars.jsx";

function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getFiniteDuration(audio, fallback) {
  const nativeDuration = Number(audio?.duration);
  if (Number.isFinite(nativeDuration) && nativeDuration > 0) return nativeDuration;

  const fallbackDuration = Number(fallback);
  if (Number.isFinite(fallbackDuration) && fallbackDuration > 0) return fallbackDuration;

  return 0;
}

export function ChatMediaAudio({
  url,
  durationSeconds,
  waveformPeaks,
  isMe = false,
  onLoad,
}) {
  const displayUrl = useChatMediaUrl(url);
  const audioRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [knownDuration, setKnownDuration] = useState(() => Number(durationSeconds) || 0);
  const peaks = normalizeWaveformPeaks(waveformPeaks ?? buildFallbackWaveform(32), 32);

  const isWaitingForSignedUrl = isAzureBlobUrl(url) && !displayUrl;
  const safeDuration = knownDuration > 0 ? knownDuration : Number(durationSeconds) || 0;
  const progress = safeDuration > 0 ? currentTime / safeDuration : 0;

  useEffect(() => {
    setFailed(false);
    setPlaying(false);
    setCurrentTime(0);
    setKnownDuration(Number(durationSeconds) || 0);
  }, [displayUrl, durationSeconds]);

  const updateDuration = useCallback(
    (event) => {
      const nextDuration = getFiniteDuration(event.currentTarget, durationSeconds);
      if (nextDuration > 0) setKnownDuration(nextDuration);
      onLoad?.();
    },
    [durationSeconds, onLoad],
  );

  const updateTime = useCallback(
    (event) => {
      setCurrentTime(event.currentTarget.currentTime || 0);
      const nextDuration = getFiniteDuration(event.currentTarget, durationSeconds);
      if (nextDuration > 0) setKnownDuration(nextDuration);
    },
    [durationSeconds],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  }, []);

  const seekByPointer = useCallback(
    (event) => {
      const audio = audioRef.current;
      if (!audio || !safeDuration) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * safeDuration;
      setCurrentTime(audio.currentTime);
    },
    [safeDuration],
  );

  if (!url) return null;

  if (failed) {
    return (
      <a
        href={displayUrl || url}
        target="_blank"
        rel="noopener noreferrer"
        data-noswipe
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: 12,
          background: "var(--color-surface-raised)",
          border: "1px dashed var(--color-border)",
          color: "#93c5fd",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "none",
          minWidth: 200,
        }}
      >
        Open audio
      </a>
    );
  }

  if (isWaitingForSignedUrl) {
    return (
      <div
        data-noswipe
        style={{
          minWidth: 220,
          maxWidth: "min(72vw, 320px)",
          padding: "11px 14px",
          borderRadius: 18,
          background: "rgba(255,255,255,0.92)",
          color: "#1f2937",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        Loading...
      </div>
    );
  }

  const playBtnBg = isMe ? "rgba(255,255,255,0.2)" : "var(--color-surface)";
  const playIconColor = isMe ? "#fff" : "var(--color-text-primary)";

  return (
    <div
      data-noswipe
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      style={{
        width: "min(72vw, 320px)",
        minWidth: 220,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "4px 2px",
      }}
    >
      <audio
        ref={audioRef}
        src={displayUrl}
        preload="metadata"
        onLoadedMetadata={updateDuration}
        onDurationChange={updateDuration}
        onCanPlay={updateDuration}
        onTimeUpdate={updateTime}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />
      <button
        type="button"
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        onClick={togglePlay}
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "none",
          background: playBtnBg,
          color: playIconColor,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {playing ? (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
            <polygon points="8 5 19 12 8 19" />
          </svg>
        )}
      </button>
      <div
        role="slider"
        aria-label="Voice message progress"
        aria-valuemin={0}
        aria-valuemax={safeDuration}
        aria-valuenow={currentTime}
        onClick={seekByPointer}
        style={{ flex: 1, minWidth: 0, cursor: "pointer", padding: "4px 0" }}
      >
        <VoiceWaveformBars
          peaks={peaks}
          progress={progress}
          isMe={isMe}
          activeColor={isMe ? "#53bdeb" : "#2563eb"}
        />
      </div>
      <span
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          color: isMe ? "rgba(255,255,255,0.7)" : "var(--color-text-muted)",
          flexShrink: 0,
          minWidth: 32,
          textAlign: "right",
        }}
      >
        {playing || currentTime > 0
          ? formatDuration(currentTime)
          : formatDuration(safeDuration)}
      </span>
    </div>
  );
}
