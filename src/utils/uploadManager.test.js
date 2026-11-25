import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/videos', () => ({
  presignVideoUpload: vi.fn(),
  uploadVideoThumbnail: vi.fn(),
  finalizeVideoUpload: vi.fn(),
  getVideo: vi.fn(),
}));

import { finalizeVideoUpload, presignVideoUpload, getVideo } from '../api/videos';
import { dismissUpload, enqueueUpload, getUploadJobs, hasActiveUploads, retryUpload } from './uploadManager.js';

class SuccessfulUploadXhr {
  static sends = 0;
  upload = {};
  status = 201;
  open(_method, url) { this.url = url; }
  setRequestHeader() {}
  send(body) {
    SuccessfulUploadXhr.sends += 1;
    queueMicrotask(() => {
      if (body instanceof Blob) this.upload.onprogress?.({ lengthComputable: true, loaded: body.size, total: body.size });
      this.onload?.();
    });
  }
}

function uploadInput(name = 'lesson.mp4') {
  return {
    file: new File(['abc'], name, { type: 'video/mp4' }),
    meta: { title: 'A useful lesson', isShort: false },
    channelId: 7,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  SuccessfulUploadXhr.sends = 0;
  vi.stubGlobal('XMLHttpRequest', SuccessfulUploadXhr);
  presignVideoUpload.mockResolvedValue({
    video_id: 41,
    sas_url: 'https://storage.test/raw?sig=x',
    blob_url: 'https://storage.test/raw',
    recommended_chunk_size_bytes: 1024,
  });
  finalizeVideoUpload.mockResolvedValue({ successful: true });
});

afterEach(() => {
  for (const job of getUploadJobs()) dismissUpload(job.id);
  vi.unstubAllGlobals();
});

describe('background upload recovery', () => {
  it('cleans up a draft only after successful finalization, including a retry', async () => {
    const onComplete = vi.fn();
    finalizeVideoUpload.mockRejectedValueOnce(new Error('Try later'));
    const id = enqueueUpload({ ...uploadInput(), onComplete });
    await vi.waitFor(() => expect(getUploadJobs()[0]?.status).toBe('error'));
    expect(onComplete).not.toHaveBeenCalled();
    retryUpload(id);
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
  });
  it('exposes a timed-out blob commit as a recoverable error without finalizing', async () => {
    class CommitTimeoutXhr extends SuccessfulUploadXhr {
      send(body) {
        if (this.url.includes('comp=blocklist')) {
          expect(this.timeout).toBeGreaterThan(0);
          queueMicrotask(() => this.ontimeout());
        } else super.send(body);
      }
    }
    vi.stubGlobal('XMLHttpRequest', CommitTimeoutXhr);
    enqueueUpload(uploadInput());
    await vi.waitFor(() => expect(getUploadJobs()[0]?.status).toBe('error'));
    expect(getUploadJobs()[0].error).toMatch(/timed out/i);
    expect(finalizeVideoUpload).not.toHaveBeenCalled();
  });

  it('recovers a lost finalization response only after confirming the server state', async () => {
    finalizeVideoUpload.mockRejectedValueOnce({ response: { status: 409 } });
    getVideo.mockResolvedValueOnce({ video_id: 41, channel: { channel_id: 7 }, processing_status: 'processing' });
    enqueueUpload(uploadInput());
    await vi.waitFor(() => expect(getUploadJobs()[0]?.status).toBe('processing'));
    expect(getVideo).toHaveBeenCalledWith(41);
    expect(presignVideoUpload).toHaveBeenCalledTimes(1);
  });

  it.each(['error', 'pending'])('does not report success for a conflict with server status %s', async (processing_status) => {
    finalizeVideoUpload.mockRejectedValueOnce({ response: { status: 409 } });
    getVideo.mockResolvedValueOnce({ video_id: 41, channel: { channel_id: 7 }, processing_status });
    enqueueUpload(uploadInput());
    await vi.waitFor(() => expect(getUploadJobs()[0]?.status).toBe('error'));
  });

  it('retries finalization without uploading the completed blob again', async () => {
    finalizeVideoUpload.mockRejectedValueOnce(new Error('Finalization temporarily failed'));
    const id = enqueueUpload(uploadInput());

    await vi.waitFor(() => expect(getUploadJobs()[0]?.status).toBe('error'));
    const sendsAfterUpload = SuccessfulUploadXhr.sends;
    expect(retryUpload(id)).toBe(true);

    await vi.waitFor(() => expect(getUploadJobs()[0]?.status).toBe('processing'));
    expect(presignVideoUpload).toHaveBeenCalledTimes(1);
    expect(SuccessfulUploadXhr.sends).toBe(sendsAfterUpload);
    expect(finalizeVideoUpload).toHaveBeenCalledTimes(2);
  });

  it('waits offline and resumes automatically when connectivity returns', async () => {
    let online = false;
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => online);
    enqueueUpload(uploadInput('mobile.mp4'));

    expect(getUploadJobs()[0]).toMatchObject({ status: 'waiting', error: 'Waiting for an internet connection' });
    expect(presignVideoUpload).not.toHaveBeenCalled();

    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(getUploadJobs()[0]?.status).toBe('processing'));
    expect(presignVideoUpload).toHaveBeenCalledTimes(1);
  });

  it('keeps navigation protection active while the uploaded video is finalizing', async () => {
    let finishFinalization;
    finalizeVideoUpload.mockImplementation(() => new Promise(resolve => { finishFinalization = resolve; }));
    enqueueUpload(uploadInput('finalizing.mp4'));

    await vi.waitFor(() => expect(getUploadJobs()[0]?.status).toBe('finalizing'));
    expect(hasActiveUploads()).toBe(true);

    finishFinalization({ successful: true });
    await vi.waitFor(() => expect(getUploadJobs()[0]?.status).toBe('processing'));
    expect(hasActiveUploads()).toBe(false);
  });
});
