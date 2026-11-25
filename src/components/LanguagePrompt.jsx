import React from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n/index.js';
import {
  applyLanguage,
  getSupportedLanguageCode,
  languageDisplayName,
  markLanguagePromptSeen,
} from '../utils/languagePrefs.js';

export function LanguagePrompt({ suggestedCode, countryName, onChooseOther, onClose }) {
  const { t } = useTranslation();
  const suggested = getSupportedLanguageCode(suggestedCode || 'en');
  const suggestedLabel = languageDisplayName(suggested);

  async function acceptSuggested() {
    markLanguagePromptSeen();
    await applyLanguage(suggested);
    onClose();
  }

  async function keepEnglish() {
    markLanguagePromptSeen();
    await applyLanguage('en');
    onClose();
  }

  function openPicker() {
    markLanguagePromptSeen();
    onChooseOther();
    onClose();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="bg-surface-raised border border-border"
        style={{
          borderRadius: 20,
          padding: '28px 24px',
          width: '100%',
          maxWidth: 420,
          animation: 'fadeUp 0.25s ease both',
        }}
      >
        <h2
          className="text-text-primary"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: 24,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          {t('language.welcomeTitle')}
        </h2>
        {countryName && (
          <p
            className="text-text-secondary"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            {t('language.detectedIn', { country: countryName })}
          </p>
        )}
        <p
          className="text-text-secondary"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            textAlign: 'center',
            marginBottom: 24,
            lineHeight: 1.5,
          }}
        >
          {t('language.suggestedLanguage', { language: suggestedLabel })}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={acceptSuggested}
            style={{
              width: '100%',
              padding: '13px',
              background: '#2563eb',
              border: 'none',
              borderRadius: 12,
              color: '#fff',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('language.useSuggested', { language: suggestedLabel })}
          </button>
          <button
            type="button"
            onClick={openPicker}
            className="bg-surface-raised border border-border text-text-primary"
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: 12,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('language.chooseOther')}
          </button>
          {suggested !== 'en' && (
            <button
              type="button"
              onClick={keepEnglish}
              className="text-text-secondary"
              style={{
                width: '100%',
                padding: '11px',
                background: 'none',
                border: 'none',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {t('language.keepEnglish')}
            </button>
          )}
        </div>
        <p
          className="text-text-muted"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            textAlign: 'center',
            marginTop: 16,
          }}
        >
          {LANGUAGES.length} {t('language.availableCount')}
        </p>
      </div>
    </div>
  );
}
