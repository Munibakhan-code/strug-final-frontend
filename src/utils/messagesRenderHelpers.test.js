/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  coerceChatText,
  coerceContextTypeKey,
  convAccentColor,
  formatContextTypeLabel,
  isReactComponentType,
  normalizeMessageReactions,
  normalizePollOptions,
  parseChatMessageMetadata,
  parseIdSetFromStorage,
  parseLocationCoords,
} from './messagesRenderHelpers.js';

describe('coerceChatText', () => {
  it('returns strings unchanged', () => {
    expect(coerceChatText(' hello ')).toBe(' hello ');
  });

  it('coerces numbers and booleans', () => {
    expect(coerceChatText(42)).toBe('42');
    expect(coerceChatText(true)).toBe('true');
  });

  it('returns empty for nullish and objects (avoids .trim/.toLowerCase throws)', () => {
    expect(coerceChatText(null)).toBe('');
    expect(coerceChatText(undefined)).toBe('');
    expect(coerceChatText({ body: 'x' })).toBe('');
  });
});

describe('parseChatMessageMetadata', () => {
  it('parses JSON string metadata objects', () => {
    expect(parseChatMessageMetadata('{"reply_to":{"text":"hi"}}')).toEqual({ reply_to: { text: 'hi' } });
  });

  it('rejects arrays and malformed JSON', () => {
    expect(parseChatMessageMetadata([])).toBe(null);
    expect(parseChatMessageMetadata('[]')).toBe(null);
    expect(parseChatMessageMetadata('not-json')).toBe(null);
  });
});

describe('normalizeMessageReactions', () => {
  it('keeps emoji map objects', () => {
    expect(normalizeMessageReactions({ '👍': [1, 2] })).toEqual({ '👍': [1, 2] });
  });

  it('returns empty object for arrays and null', () => {
    expect(normalizeMessageReactions(['👍'])).toEqual({});
    expect(normalizeMessageReactions(null)).toEqual({});
  });
});

describe('parseLocationCoords', () => {
  it('parses finite lat/lng pairs', () => {
    expect(parseLocationCoords({ lat: '45.5', lng: '-75.7' })).toEqual({ lat: 45.5, lng: -75.7 });
  });

  it('returns null when lng is missing', () => {
    expect(parseLocationCoords({ lat: 45.5 })).toBe(null);
  });
});

describe('convAccentColor', () => {
  const palette = ['#111', '#222', '#333'];

  it('indexes by channel id', () => {
    expect(convAccentColor(4, palette)).toBe('#222');
  });

  it('falls back safely for missing channel id', () => {
    expect(convAccentColor(undefined, palette)).toBe('#111');
  });
});

describe('isReactComponentType', () => {
  it('accepts function components', () => {
    function PlainIcon() {
      return null;
    }
    expect(isReactComponentType(PlainIcon)).toBe(true);
  });

  it('accepts React.memo component types (JobsIcon pattern)', () => {
    const memoIcon = { $$typeof: Symbol.for('react.memo'), type: () => null, compare: null };
    expect(isReactComponentType(memoIcon)).toBe(true);
  });

  it('rejects emoji/string glyphs', () => {
    expect(isReactComponentType('🍔')).toBe(false);
  });
});

describe('coerceContextTypeKey', () => {
  it('keeps string context types', () => {
    expect(coerceContextTypeKey('food')).toBe('food');
  });

  it('coerces numeric context types from prod payloads', () => {
    expect(coerceContextTypeKey(12)).toBe('12');
  });

  it('returns empty for objects (avoids charAt throws)', () => {
    expect(coerceContextTypeKey({ type: 'food' })).toBe('');
  });
});

describe('formatContextTypeLabel', () => {
  it('title-cases a string key', () => {
    expect(formatContextTypeLabel('rideshare')).toBe('Rideshare');
  });

  it('returns empty for invalid keys', () => {
    expect(formatContextTypeLabel(null)).toBe('');
  });
});

describe('normalizePollOptions', () => {
  it('coerces option text and voter arrays', () => {
    expect(normalizePollOptions([{ text: 42, voters: 'bad' }])).toEqual([
      { text: '42', voters: [] },
    ]);
  });

  it('returns empty array when options is not an array', () => {
    expect(normalizePollOptions({ 0: { text: 'A' } })).toEqual([]);
  });
});

describe('parseIdSetFromStorage', () => {
  it('parses id arrays into a Set', () => {
    expect(parseIdSetFromStorage('[1,2,3]')).toEqual(new Set([1, 2, 3]));
  });

  it('returns empty Set for objects and malformed JSON', () => {
    expect(parseIdSetFromStorage('{"1":true}')).toEqual(new Set());
    expect(parseIdSetFromStorage('not-json')).toEqual(new Set());
  });
});
