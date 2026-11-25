// Background video upload manager (#382/#383).
//
// Uploads used to run inside the Videos upload modal, so the user couldn't leave the screen
// while a large file uploaded — closing the modal / navigating away aborted it. This module
// hoists the upload out of the React tree into a plain singleton so it keeps running across
// navigation. Components subscribe for progress (the global UploadProgressWidget) and for the
// "video created" event (the Videos page, for its optimistic list insert).
//
// The upload path itself is unchanged: presign → direct-to-blob block upload (SAS) → finalize.
// Server-side transcoding then happens in the background (distributed chunked transcode).

import { presignVideoUpload, uploadVideoThumbnail, finalizeVideoUpload, getVideo } from '../api/videos';
import { stripVideoFileExtension } from './videoTitle.js';

const progressSubs = new Set();
const createdSubs = new Set();
let jobs = [];
let seq = 0;
const jobContexts = new Map();

function emit() {
  const snapshot = jobs.slice();
  for (const cb of progressSubs) { try { cb(snapshot); } catch { /* noop */ } }
}
function emitCreated(payload) {
  for (const cb of createdSubs) { try { cb(payload); } catch { /* noop */ } }
}

// Subscribe to the live job list (called immediately with the current jobs). Returns unsubscribe.
export function subscribeUploads(cb) {
  progressSubs.add(cb);
  cb(jobs.slice());
  return () => progressSubs.delete(cb);
}

// Subscribe to "a video finished uploading and is now processing" — { videoId, title, isShort,
// channelId, category, thumbPreview }. Used for the optimistic feed insert. Returns unsubscribe.
export function onVideoCreated(cb) {
  createdSubs.add(cb);
  return () => createdSubs.delete(cb);
}

export function getUploadJobs() { return jobs.slice(); }
export function hasActiveUploads() { return jobs.some(j => j.status === 'uploading' || j.status === 'waiting' || j.status === 'finalizing'); }

function disposeContext(id) {
  const context = jobContexts.get(id);
  if (context?.onlineHandler && typeof window !== 'undefined') {
    window.removeEventListener('online', context.onlineHandler);
  }
  jobContexts.delete(id);
}
export function dismissUpload(id) {
  jobs = jobs.filter(j => j.id !== id);
  disposeContext(id);
  emit();
}
export function clearFinishedUploads() {
  const retained = jobs.filter(j => j.status === 'uploading' || j.status === 'waiting' || j.status === 'finalizing' || j.status === 'processing');
  const retainedIds = new Set(retained.map(j => j.id));
  for (const id of jobContexts.keys()) if (!retainedIds.has(id)) disposeContext(id);
  jobs = retained;
  emit();
}

const CAPACITY_RETRY_DELAYS_MS = [15_000, 30_000, 60_000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableCapacityError(err) {
  const status = err?.response?.status;
  const code = err?.response?.data?.code;
  return status === 429 || code === 'VIDEO_PIPELINE_BUSY' || code === 'UPLOAD_CONCURRENCY_LIMIT';
}

function uploadErrorMessage(err) {
  return err?.response?.data?.message || err?.message || 'Upload failed';
}

async function presignWithRetry(meta, onWaiting) {
  let lastErr;
  for (let attempt = 0; attempt <= CAPACITY_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await presignVideoUpload(meta);
    } catch (err) {
      lastErr = err;
      if (!isRetryableCapacityError(err) || attempt >= CAPACITY_RETRY_DELAYS_MS.length) throw err;
      onWaiting?.(uploadErrorMessage(err));
      await sleep(CAPACITY_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastErr;
}

function detectIsShort(file, override) {
  if (override !== null && override !== undefined) return Promise.resolve(override);
  return new Promise(resolve => {
    const vid = document.createElement('video');
    let settled = false;
    let timer;
    const finish = (isShort) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      vid.onloadedmetadata = null;
      vid.onerror = null;
      URL.revokeObjectURL(vid.src);
      vid.removeAttribute('src');
      resolve(isShort);
    };
    vid.preload = 'metadata';
    vid.onloadedmetadata = () => finish(Number.isFinite(vid.duration) && vid.duration <= 60);
    vid.onerror = () => finish(false);
    timer = setTimeout(() => finish(false), 15_000);
    vid.src = URL.createObjectURL(file);
  });
}

/** XHR PutBlock — fetch() has no upload.onprogress, which made the bar jump to 100%. */
function putBlockXhr(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.timeout = 120_000;
    xhr.ontimeout = () => reject(new Error('Upload request timed out. Please retry.'));
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.status);
      else reject(new Error(`Block upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during block upload'));
    xhr.onabort = () => reject(new Error('Block upload aborted'));
    xhr.send(body);
  });
}

function putBlockXhrWithProgress(url, body, headers, onBytes) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.timeout = 120_000;
    xhr.ontimeout = () => reject(new Error('Upload request timed out. Please retry.'));
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onBytes?.(ev.loaded, ev.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.status);
      else reject(new Error(`Block upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during block upload'));
    xhr.onabort = () => reject(new Error('Block upload aborted'));
    xhr.send(body);
  });
}

// Chunked block-blob upload directly to Azure using a SAS URL.
// Uses recommended_chunk_size_bytes from the API when provided; XHR for real byte progress.
async function uploadBlockBlob(sasUrl, file, onProgress, recommendedChunkBytes) {
  const fallback = file.size > 256 * 1024 * 1024 ? 16 * 1024 * 1024 : 8 * 1024 * 1024;
  const CHUNK = Math.max(
    256 * 1024,
    Number(recommendedChunkBytes) > 0 ? Number(recommendedChunkBytes) : fallback,
  );
  const PARALLEL = 6;
  const MAX_RETRIES = 3;
  const total = Math.ceil(file.size / CHUNK);
  const blockIds = Array.from({ length: total }, (_, i) => btoa(String(i).padStart(6, '0')));
  const committed = new Array(total).fill(0); // bytes committed per block (full size when done)
  let inFlightLoaded = new Array(total).fill(0);

  const report = () => {
    const doneBytes = committed.reduce((a, b) => a + b, 0);
    const liveBytes = inFlightLoaded.reduce((a, b) => a + b, 0);
    const pct = Math.min(95, Math.round(((doneBytes + liveBytes) / file.size) * 95));
    onProgress?.(pct);
  };

  async function uploadBlock(i) {
    const start = i * CHUNK;
    const end = Math.min(start + CHUNK, file.size);
    const chunk = file.slice(start, end);
    const blockId = blockIds[i];
    const size = end - start;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await putBlockXhrWithProgress(
          `${sasUrl}&comp=block&blockid=${encodeURIComponent(blockId)}`,
          chunk,
          { 'x-ms-blob-type': 'BlockBlob' },
          (loaded) => {
            inFlightLoaded[i] = Math.min(loaded, size);
            report();
          },
        );
        inFlightLoaded[i] = 0;
        committed[i] = size;
        report();
        return;
      } catch (err) {
        inFlightLoaded[i] = 0;
        if (attempt === MAX_RETRIES) throw err;
        await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
      }
    }
  }

  for (let i = 0; i < total; i += PARALLEL) {
    // Drain the current batch before allowing a retry to start another transfer.
    const results = await Promise.allSettled(Array.from({ length: Math.min(PARALLEL, total - i) }, (_, k) => uploadBlock(i + k)));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  }

  const xml = `<?xml version="1.0" encoding="utf-8"?><BlockList>${blockIds.map(id => `<Latest>${id}</Latest>`).join('')}</BlockList>`;
  await putBlockXhr(`${sasUrl}&comp=blocklist`, xml, { 'Content-Type': 'application/xml' });
  onProgress?.(99);
}

function waitForConnection(job) {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return false;
  const context = jobContexts.get(job.id);
  job.status = 'waiting';
  job.error = 'Waiting for an internet connection';
  emit();
  if (context?.onlineHandler || typeof window === 'undefined') return true;
  context.onlineHandler = () => {
    window.removeEventListener('online', context.onlineHandler);
    context.onlineHandler = null;
    // Let an in-flight failure finish its cleanup before attempting the resume.
    queueMicrotask(() => retryUpload(job.id));
  };
  window.addEventListener('online', context.onlineHandler, { once: true });
  return true;
}

async function run(job) {
  const context = jobContexts.get(job.id);
  if (!context || context.running || waitForConnection(job)) return;
  context.running = true;
  const { file, meta, channelId, visibility, category } = context;
  try {
    if (!context.prepared) {
      context.prepared = {
        isShort: await detectIsShort(file, meta.isShort ?? null),
        title: (meta.title && String(meta.title).trim()) || stripVideoFileExtension(file.name) || file.name,
      };
    }
    const { isShort, title } = context.prepared;
    if (!context.presign) context.presign = await presignWithRetry({
      title,
      description: meta.desc ?? '',
      channel_id: channelId,
      visibility: visibility || 'public',
      video_type: isShort ? 'shorts' : 'long',
      filename: file.name,
      file_size_bytes: file.size,
      is_monetizable: false,
      category: meta.category || category,
    }, (msg) => {
      job.status = 'waiting';
      job.error = msg;
      emit();
    });
    const presign = context.presign;
    job.status = 'uploading';
    job.error = null;
    job.videoId = presign.video_id;
    emit();
    if (meta.thumbnail && !context.thumbnailAttempted) {
      context.thumbnailAttempted = true;
      const tfd = new FormData();
      tfd.append('image', meta.thumbnail);
      try { await uploadVideoThumbnail(presign.video_id, tfd); } catch { /* thumbnail is optional */ }
    }
    if (!context.uploaded) {
      await uploadBlockBlob(
        presign.sas_url,
        file,
        (p) => { job.progress = p; emit(); },
        presign.recommended_chunk_size_bytes,
      );
      context.uploaded = true;
    }
    job.status = 'finalizing';
    job.progress = 99;
    emit();
    try {
      await finalizeVideoUpload(presign.video_id, presign.blob_url, {
        title,
        description: meta.desc ?? '',
        category: meta.category || category,
        video_type: isShort ? 'shorts' : 'long',
      });
    } catch (error) {
      // A successful finalize may lose its response during a connection failure.
      // Confirm the server state; a generic conflict is not proof of success.
      if (error?.response?.status !== 409) throw error;
      const video = await getVideo(presign.video_id);
      if (Number(video?.video_id) !== Number(presign.video_id)
          || Number(video?.channel?.channel_id) !== Number(channelId)
          || !['processing', 'done'].includes(video?.processing_status)) throw error;
    }
    job.progress = 100;
    job.status = 'processing';
    try { await context.onComplete?.(); } catch { /* Keep the recoverable draft if storage cleanup fails. */ }
    emit();
    emitCreated({ videoId: presign.video_id, title, isShort, channelId, category: meta.category || category, thumbPreview: meta.thumbPreview });
    // The potentially very large File object is no longer needed once finalization succeeds.
    disposeContext(job.id);
    // Auto-clear the finished tile from the widget after a bit so it doesn't linger forever.
    setTimeout(() => { if (job.status === 'processing') { dismissUpload(job.id); } }, 12000);
  } catch (err) {
    if (!waitForConnection(job)) {
      job.status = 'error';
      job.error = uploadErrorMessage(err);
      emit();
    }
  } finally {
    context.running = false;
  }
}

export function retryUpload(id) {
  const job = jobs.find(item => item.id === id);
  const context = jobContexts.get(id);
  if (!job || !context || context.running || (job.status !== 'error' && job.status !== 'waiting')) return false;
  job.status = 'uploading';
  job.error = null;
  emit();
  run(job);
  return true;
}

// Enqueue a file to upload in the background. Returns the job id. Fire-and-forget — the returned
// promise is intentionally not awaited by callers; progress is delivered via subscribeUploads.
export function enqueueUpload({ file, meta = {}, channelId, visibility = 'public', category = 'auto', onComplete }) {
  const id = ++seq;
  const job = { id, name: (meta.title && String(meta.title).trim()) || stripVideoFileExtension(file.name) || file.name, progress: 0, status: 'uploading', videoId: null, error: null };
  jobContexts.set(id, { file, meta, channelId, visibility, category, onComplete, prepared: null, presign: null, uploaded: false, thumbnailAttempted: false, running: false, onlineHandler: null });
  jobs = [...jobs, job];
  emit();
  run(job);
  return id;
}
