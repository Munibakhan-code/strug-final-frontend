import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const retryUpload = vi.fn();
const dismissUpload = vi.fn();
let mockJobs;
let mockIsMobile;
vi.mock('../utils/uploadManager.js', () => ({
  subscribeUploads: (callback) => {
    callback(mockJobs);
    return () => {};
  },
  retryUpload: (...args) => retryUpload(...args),
  dismissUpload: (...args) => dismissUpload(...args),
}));
vi.mock('../hooks/useViewport.js', () => ({ useViewport: () => ({ isMobile: mockIsMobile }) }));

import UploadProgressWidget from './UploadProgressWidget.jsx';

describe('UploadProgressWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMobile = false;
    mockJobs = [{ id: 8, name: 'Lesson', progress: 42, status: 'error', error: 'Connection lost' }];
  });

  it('lets the creator retry a failed upload without reopening the modal', async () => {
    render(<UploadProgressWidget />);
    expect(screen.getByText('Connection lost')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /retry/i }));
    expect(retryUpload).toHaveBeenCalledWith(8);
  });

  it('shows an accurate finalizing state after the file transfer completes', () => {
    mockJobs = [{ id: 9, name: 'Interview', progress: 99, status: 'finalizing', error: null }];
    render(<UploadProgressWidget />);
    expect(screen.getByText(/Finalizing video/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('reports mobile progress through a silent notification without covering the app', async () => {
    mockIsMobile = true;
    const showNotification = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('Notification', { permission: 'granted' });
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      ready: Promise.resolve({ showNotification, getNotifications: vi.fn().mockResolvedValue([]) }),
    } });
    mockJobs = [
      { id: 1, name: 'First video', progress: 20, status: 'uploading' },
      { id: 2, name: 'Second video', progress: 60, status: 'uploading' },
    ];
    render(<UploadProgressWidget />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('First video')).not.toBeInTheDocument();
    await waitFor(() => expect(showNotification).toHaveBeenCalledWith('Uploading video', expect.objectContaining({
      body: '2 videos · 40%', tag: 'strug-video-upload-progress', silent: true, renotify: false,
    })));
    vi.unstubAllGlobals();
  });
});
