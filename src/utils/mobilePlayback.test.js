import { describe, it, expect, vi, afterEach } from 'vitest';
import { installMobilePlayback } from './mobilePlayback';

let dispose;
afterEach(() => { dispose?.(); document.body.replaceChildren(); vi.restoreAllMocks(); });
function media(tag = 'video', stream = false) {
  const el = document.createElement(tag);
  Object.defineProperty(el, 'paused', { value: false, configurable: true });
  if (stream) el.srcObject = {};
  el.pause = vi.fn();
  document.body.append(el);
  return el;
}
function setup(mobile = true) {
  dispose = installMobilePlayback(document, { HTMLMediaElement, CustomEvent, matchMedia: () => ({ matches: mobile }) });
}
describe('mobile playback ownership', () => {
  it('notifies a paused mini-player to close when another video starts', () => {
    setup(); const previous = media();
    Object.defineProperty(previous, 'paused', { value: true });
    const close = vi.fn();
    previous.addEventListener('strug:playback-replaced', close);
    media().dispatchEvent(new Event('play'));
    expect(close).toHaveBeenCalledOnce();
    expect(previous.pause).not.toHaveBeenCalled();
  });
  it('pauses video and audio when another video starts, including muted clips', () => {
    setup();
    const previous = media(); previous.muted = true;
    const audio = media('audio');
    const current = media();
    current.dispatchEvent(new Event('play'));
    expect(previous.pause).toHaveBeenCalledOnce();
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(current.pause).not.toHaveBeenCalled();
  });
  it('preserves live call streams', () => {
    setup(); const call = media('video', true); const current = media();
    current.dispatchEvent(new Event('play'));
    expect(call.pause).not.toHaveBeenCalled();
    call.dispatchEvent(new Event('play'));
    expect(current.pause).not.toHaveBeenCalled();
  });
  it('does not change desktop playback', () => {
    setup(false); const previous = media(); media().dispatchEvent(new Event('play'));
    expect(previous.pause).not.toHaveBeenCalled();
  });
  it('supports mobile WebViews without matchMedia', () => {
    dispose = installMobilePlayback(document, { HTMLMediaElement, CustomEvent, Event, innerWidth: 390, navigator: { maxTouchPoints: 1 } });
    const previous = media(); media().dispatchEvent(new Event('play'));
    expect(previous.pause).toHaveBeenCalledOnce();
  });
  it('removes its listener on cleanup', () => {
    setup(); dispose(); const previous = media(); media().dispatchEvent(new Event('play'));
    expect(previous.pause).not.toHaveBeenCalled();
  });
});
