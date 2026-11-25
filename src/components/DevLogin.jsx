import React, { useState } from 'react';
import { login, establishRefreshCookie } from '../api/auth';
import { getUser } from '../store/auth';

export default function DevLogin({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email.trim(), password);
      if (!data?.accessToken) {
        setError(data?.message || 'Login failed — no token returned.');
        return;
      }
      // Direct API login already Set-Cookies the refresh; claim handoff if present (proxy-safe).
      if (data.session_handoff) {
        await establishRefreshCookie(data.session_handoff).catch(() => {});
      }
      onSuccess?.(getUser());
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Login failed. Is the backend running on port 5001?';
      setError(typeof msg === 'string' ? msg : 'Login failed.');
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
          maxWidth: 400,
          borderRadius: 16,
          padding: '32px 28px',
        }}
      >
        <div className="text-text-primary" style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
          Strug — local dev
        </div>
        <p className="text-text-secondary" style={{ fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
          Sign in against your local backend with your account credentials.
        </p>

        <label style={labelStyle}>Email or username</label>
        <input
          type="text"
          autoComplete="username"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
          required
        />

        <label style={{ ...labelStyle, marginTop: 16 }}>Password</label>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          required
        />

        {error ? (
          <p style={{ color: '#f87171', fontSize: 13, marginTop: 14 }}>{error}</p>
        ) : null}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
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
  background: 'var(--color-bg)',
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
