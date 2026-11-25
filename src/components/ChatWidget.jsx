import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslation } from 'react-i18next'
import { useChatbot } from '../hooks/useChatbot'
import { isSafeHttpUrl } from '../utils/safeUrl.js'

export default function ChatWidget({ verticalSlug, verticalName, color = '#00d68f' }) {
  const { t } = useTranslation()
  const { messages, isLoading, isOpen, error, sendMessage, toggle, close } = useChatbot(verticalSlug)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  const handleSend = () => {
    if (!input.trim() || isLoading) return
    sendMessage(input.trim())
    setInput('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      {/* ── Floating bubble ─────────────────────────────────────────────── */}
      <button
        onClick={toggle}
        aria-label={t('chatWidget.openAssistant')}
        style={{ background: color }}
        className="fixed bottom-6 right-6 z-[9999] w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-transform duration-200 hover:scale-110 focus:outline-none"
      >
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="fixed bottom-24 right-6 z-[9998] w-[360px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
          // Neutral floating-panel chrome (rule 1) — same role as ChatToast/QuickReplyPopup's
          // panels, so the gradient re-themes with the app instead of staying fixed-dark.
          style={{
            background: 'linear-gradient(160deg, var(--color-surface-raised) 0%, var(--color-surface) 100%)',
            border: `1px solid ${color}33`,
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 border-b"
            style={{ borderColor: `${color}22`, background: `${color}11` }}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ background: color, color: '#000' }}
            >
              AI
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-text-primary text-sm font-semibold truncate">{t('chatWidget.assistantTitle', { name: verticalName })}</p>
              <p className="text-xs" style={{ color: `${color}cc` }}>{t('chatWidget.poweredBy')}</p>
            </div>
            <button
              onClick={close}
              className="text-text-secondary hover:text-text-primary transition-colors shrink-0"
              aria-label={t('shared.ariaClose')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ maxHeight: '380px', minHeight: '200px' }}>
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold mx-auto mb-3"
                  style={{ background: `${color}22`, color }}
                >
                  ✦
                </div>
                <p className="text-text-secondary text-sm font-medium">{t('chatWidget.greeting', { name: verticalName })}</p>
                <p className="text-text-muted text-xs mt-1">{t('chatWidget.askAnything')}</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                  // Assistant bubble is a neutral surface role (same pattern as Messages.jsx's
                  // MessageBubble "them" side); its text follows suit rather than a fixed light
                  // gray that would go invisible once the bubble re-themes light (rule 4).
                  style={
                    msg.role === 'user'
                      ? { background: color, color: '#000', borderBottomRightRadius: '4px' }
                      : { background: 'var(--color-surface-raised)', color: 'var(--color-text-primary)', borderBottomLeftRadius: '4px' }
                  }
                >
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
                        li: ({ children }) => <li className="text-sm">{children}</li>,
                        // Inline code/code-block chips keep a deliberate fixed "terminal" look
                        // (dark chip, green text) regardless of theme — a stylistic choice, not
                        // page chrome, same rationale as rule 3's media-chrome exceptions.
                        code: ({ inline, children }) =>
                          inline ? (
                            <code className="bg-black/30 text-green-300 text-xs px-1 py-0.5 rounded font-mono">{children}</code>
                          ) : (
                            <pre className="bg-black/40 text-green-300 text-xs p-2 rounded my-1 overflow-x-auto font-mono whitespace-pre-wrap">
                              <code>{children}</code>
                            </pre>
                          ),
                        a: ({ href, children }) => (
                          isSafeHttpUrl(href) ? (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100" style={{ color }}>
                              {children}
                            </a>
                          ) : (
                            <span>{children}</span>
                          )
                        ),
                        h1: ({ children }) => <p className="font-bold text-text-primary mb-1">{children}</p>,
                        h2: ({ children }) => <p className="font-semibold text-text-primary mb-1">{children}</p>,
                        h3: ({ children }) => <p className="font-medium text-text-primary mb-0.5">{children}</p>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 pl-2 opacity-70 my-1" style={{ borderColor: color }}>{children}</blockquote>
                        ),
                        hr: () => <hr className="border-border-subtle my-2" />,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--color-surface-raised)', borderBottomLeftRadius: '4px' }}>
                  <div className="flex gap-1 items-center">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="block w-1.5 h-1.5 rounded-full"
                        style={{
                          background: color,
                          animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <p className="text-red-400 text-xs text-center">{error}</p>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            className="flex items-center gap-2 px-3 py-3 border-t"
            style={{ borderColor: `${color}22` }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chatWidget.askAboutPlaceholder', { name: verticalName })}
              disabled={isLoading}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              aria-label={t('common.sendMessage')}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-110"
              style={{ background: color }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </>
  )
}
