import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToastQueue } from './useToastQueue.js';

beforeEach(() => vi.useFakeTimers());

describe('useToastQueue', () => {
  it('queues in FIFO order and limits the visible stack', () => {
    const { result } = renderHook(() => useToastQueue({ maxVisible: 2 }));
    act(() => { result.current.enqueue({ key: 'a', title: 'A' }); result.current.enqueue({ key: 'b', title: 'B' }); result.current.enqueue({ key: 'c', title: 'C' }); });
    expect(result.current.visible.map((t) => t.key)).toEqual(['a', 'b']);
    act(() => result.current.dismiss('a'));
    expect(result.current.visible.map((t) => t.key)).toEqual(['b', 'c']);
  });

  it('deduplicates stable keys and can replace an existing toast', () => {
    const { result } = renderHook(() => useToastQueue());
    act(() => { result.current.enqueue({ key: 'x', title: 'First' }); result.current.enqueue({ key: 'x', title: 'Duplicate' }); });
    expect(result.current.visible).toHaveLength(1);
    act(() => result.current.replace('x', { title: 'Updated', state: 'error' }));
    expect(result.current.visible[0]).toMatchObject({ title: 'Updated', state: 'error' });
  });

  it('auto-dismisses ambient items but keeps actionable items', () => {
    const { result } = renderHook(() => useToastQueue({ timeoutMs: 1000 }));
    act(() => { result.current.enqueue({ key: 'ambient', title: 'A' }); result.current.enqueue({ key: 'action', title: 'B', persistent: true }); });
    act(() => vi.advanceTimersByTime(1001));
    expect(result.current.visible.map((t) => t.key)).toEqual(['action']);
  });
});
