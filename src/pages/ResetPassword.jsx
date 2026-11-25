import React, { useMemo, useState } from 'react';
import client from '../api/client';

export default function ResetPassword() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [email, setEmail] = useState(() => params.get('email') || '');
  const [token] = useState(() => params.get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !token || !password) {
      setError('Email, reset token, and new password are required.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      await client.post('/auth/reset-password-confirm', {
        email: email.trim(),
        token,
        newPassword: password,
      });
      setSuccess(true);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Could not reset password. The link may have expired.';
      setError(typeof msg === 'string' ? msg : 'Could not reset password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="bg-bg"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif",
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-border"
        style={{
          width: '100%',
          maxWidth: 420,
          borderRadius: 16,
          padding: '32px 28px',
        }}
      >
        <div className="text-text-primary" style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          Reset password
        </div>
        <p className="text-text-secondary" style={{ fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
          Choose a new password for your Strug account.
        </p>

        {success ? (
          <>
            <p style={{ color: '#4ade80', fontSize: 14, lineHeight: 1.5, marginBottom: 20 }}>
              Your password was updated. You can sign in with the new password.
            </p>
            <a
              href={import.meta.env.VITE_LOGIN_URL ?? 'https://strug.ca/en/login'}
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '13px 0',
                borderRadius: 10,
                background: '#2563eb',
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Go to sign in
            </a>
          </>
        ) : (
          <>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              required
            />

            {!token && (
              <p style={{ color: '#facc15', fontSize: 13, marginTop: 12 }}>
                Missing reset token. Open the link from your email.
              </p>
            )}

            <label style={{ ...labelStyle, marginTop: 16 }}>New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              required
            />

            <label style={{ ...labelStyle, marginTop: 16 }}>Confirm password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={inputStyle}
              required
            />

            {error ? (
              <p style={{ color: '#f87171', fontSize: 13, marginTop: 14 }}>{error}</p>
            ) : null}

            <button type="submit" disabled={loading || !token} style={buttonStyle}>
              {loading ? 'Saving…' : 'Update password'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  marginBottom: 8,
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-raised)',
  color: 'var(--color-text-primary)',
  fontSize: 15,
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
};

const buttonStyle = {
  width: '100%',
  marginTop: 22,
  padding: '13px 0',
  borderRadius: 10,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontSize: 15,
  fontWeight: 700,
  fontFamily: "'DM Sans', sans-serif",
  cursor: 'pointer',
};
