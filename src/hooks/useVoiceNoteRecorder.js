import { useCallback, useEffect, useRef, useState } from 'react';
import { extractWaveformPeaks } from '../utils/voiceWaveformHelpers.js';

function pickRecorderMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

function blobToVoiceFile(blob, mimeType, durationSeconds) {
  const base = (mimeType || blob.type || 'audio/webm').split(';')[0];
  const ext =
    base === 'audio/mp4'
      ? 'm4a'
      : base === 'audio/ogg'
        ? 'ogg'
        : base === 'audio/mpeg'
          ? 'mp3'
          : 'webm';
  const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: base });
  file.durationSeconds = durationSeconds;
  if (Array.isArray(blob.waveformPeaks)) file.waveformPeaks = blob.waveformPeaks;
  return file;
}

export function useVoiceNoteRecorder({ onRecorded, onError, minSeconds = 1 }) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState(() => Array(24).fill(0.15));
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const discardRef = useRef(false);
  const secondsRef = useRef(0);
  const startedAtRef = useRef(0);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const levelRafRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearLevelLoop = useCallback(() => {
    if (levelRafRef.current) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
  }, []);

  const releaseAnalyser = useCallback(() => {
    clearLevelLoop();
    try {
      audioContextRef.current?.close();
    } catch {
      /* ignore */
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    setLevels(Array(24).fill(0.15));
  }, [clearLevelLoop]);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    releaseAnalyser();
  }, [releaseAnalyser]);

  const resetState = useCallback(() => {
    clearTimer();
    releaseStream();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    discardRef.current = false;
    setIsRecording(false);
    setSeconds(0);
    secondsRef.current = 0;
    startedAtRef.current = 0;
  }, [clearTimer, releaseStream]);

  const cancel = useCallback(() => {
    discardRef.current = true;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        resetState();
      }
      return;
    }
    resetState();
  }, [resetState]);

  const start = useCallback(async () => {
    if (isRecording) return;

    if (!window.isSecureContext) {
      onError?.(
        new Error(
          'Microphone needs localhost or HTTPS. Open the app on http://localhost:5173 or use HTTPS.',
        ),
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.(new Error('Microphone is not available in this browser.'));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorderOptions = { audioBitsPerSecond: 128000 };
      if (mimeType) recorderOptions.mimeType = mimeType;

      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          const audioContext = new AC();
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.65;
          source.connect(analyser);
          audioContextRef.current = audioContext;
          analyserRef.current = analyser;
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tickLevels = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(data);
            const bucketSize = Math.floor(data.length / 24) || 1;
            const next = Array.from({ length: 24 }, (_, i) => {
              let sum = 0;
              const start = i * bucketSize;
              for (let j = start; j < start + bucketSize; j++) sum += data[j] ?? 0;
              return 0.12 + (sum / bucketSize / 255) * 0.88;
            });
            setLevels(next);
            levelRafRef.current = requestAnimationFrame(tickLevels);
          };
          levelRafRef.current = requestAnimationFrame(tickLevels);
        }
      } catch {
        releaseAnalyser();
      }

      const recorder = new MediaRecorder(stream, recorderOptions);

      chunksRef.current = [];
      discardRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        onError?.(new Error('Recording failed.'));
        resetState();
      };

      recorder.onstop = async () => {
        const elapsedSeconds = startedAtRef.current
          ? Math.ceil((Date.now() - startedAtRef.current) / 1000)
          : 0;
        const recordedSeconds = Math.max(secondsRef.current, elapsedSeconds);
        const shouldDiscard = discardRef.current;
        const chunks = [...chunksRef.current];
        const type = recorder.mimeType || mimeType || 'audio/webm';
        resetState();

        if (shouldDiscard) return;

        const blob = new Blob(chunks, { type });
        if (blob.size < 200 || recordedSeconds < minSeconds) {
          onError?.(
            new Error(
              recordedSeconds < minSeconds
                ? `Hold at least ${minSeconds}s to record.`
                : 'Recording too short.',
            ),
          );
          return;
        }

        try {
          blob.waveformPeaks = await extractWaveformPeaks(blob, 32);
        } catch {
          blob.waveformPeaks = null;
        }

        onRecorded?.(blobToVoiceFile(blob, type, recordedSeconds));
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setSeconds(0);
      secondsRef.current = 0;
      startedAtRef.current = Date.now();
      clearTimer();
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
      }, 1000);
    } catch (err) {
      resetState();
      onError?.(
        err?.name === 'NotAllowedError'
          ? new Error('Allow microphone access to send voice notes.')
          : err,
      );
    }
  }, [clearTimer, isRecording, minSeconds, onError, onRecorded, releaseAnalyser, resetState]);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    try {
      recorder.stop();
    } catch {
      resetState();
    }
  }, [resetState]);

  useEffect(() => () => {
    discardRef.current = true;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    resetState();
  }, [resetState]);

  return {
    isRecording,
    seconds,
    levels,
    start,
    stop,
    cancel,
  };
}

export function formatVoiceDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
