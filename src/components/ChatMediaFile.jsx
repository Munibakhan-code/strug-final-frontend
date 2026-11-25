import React from 'react';
import { useChatMediaUrl } from '../hooks/useChatMediaUrl.js';

export function ChatMediaFile({ url, name = 'Attachment' }) {
  const displayUrl = useChatMediaUrl(url);

  if (!url) return null;

  return (
    <a
      href={displayUrl || url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 12,
        // Neutral elevated-card chrome (rule 1) — this attachment card sits inside either the
        // accent "me" bubble or the neutral "them" bubble (see Messages.jsx MessageBubble), so
        // it re-themes like every other batch of neutral chat chrome.
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-primary)',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
        maxWidth: 'min(72vw, 280px)',
        wordBreak: 'break-word',
      }}
    >
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#93c5fd" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span>{name}</span>
    </a>
  );
}
