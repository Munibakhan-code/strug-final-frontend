import { useEffect, useState } from 'react';
import {
  getChatSettings,
  updateChatSettings,
  getChatModerators,
  addChatModerator,
  removeChatModerator,
  getChatBans,
  banChatUser,
  unbanChatUser,
  getBannedWords,
  addBannedWord,
  removeBannedWord,
} from '../../api/live.js';

/**
 * Streamer-facing moderation dashboard (#258). Manages the chat controls the backend
 * already enforces on the live socket: chat mode, slow mode, blocked words (automod),
 * timed/permanent bans, and channel moderators. All actions are scoped server-side to
 * the calling streamer's own channel.
 */

const font = "'DM Sans', sans-serif";
const fontDisplay = "'Barlow Condensed', sans-serif";
// This is a streamer-facing settings/management dashboard (docked panel, not video-overlay
// chrome), so its colors are page-chrome roles and follow theme tokens.
const TEXT = 'var(--color-text-primary)';
const MUTED = 'var(--color-text-secondary)';
const MUTED_DIM = 'var(--color-text-muted)';
const BORDER = 'var(--color-border)';
const PANEL = 'var(--color-surface)';
const FIELD = 'var(--color-surface)';

const CHAT_MODES = [
  { value: 'PUBLIC', label: 'Everyone' },
  { value: 'FOLLOWERS_ONLY', label: 'Followers only' },
  { value: 'SUBSCRIBERS_ONLY', label: 'Subscribers only' },
];
const SLOW_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 3000, label: '3s' },
  { value: 5000, label: '5s' },
  { value: 10000, label: '10s' },
  { value: 30000, label: '30s' },
];
const BAN_DURATIONS = [
  { value: '', label: 'Permanent' },
  { value: '10', label: '10 minutes' },
  { value: '60', label: '1 hour' },
  { value: '1440', label: '24 hours' },
  { value: '10080', label: '7 days' },
];

function displayName(user) {
  if (!user) return 'Unknown user';
  return user.username ? `@${user.username}` : user.name || `User #${user.user_id}`;
}

function XIcon({ s = 14 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  );
}

export default function StreamModerationPanel({ color = '#dc2626', isMobile = false }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ chat_mode: 'PUBLIC', slow_mode_ms: 0 });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  const [words, setWords] = useState([]);
  const [wordInput, setWordInput] = useState('');

  const [bans, setBans] = useState([]);
  const [banForm, setBanForm] = useState({ username: '', reason: '', duration: '' });
  const [banMsg, setBanMsg] = useState('');
  const [banBusy, setBanBusy] = useState(false);

  const [mods, setMods] = useState([]);
  const [modInput, setModInput] = useState('');
  const [modMsg, setModMsg] = useState('');

  useEffect(() => {
    let active = true;
    Promise.allSettled([getChatSettings(), getBannedWords(), getChatBans(), getChatModerators()])
      .then(([s, w, b, m]) => {
        if (!active) return;
        if (s.status === 'fulfilled' && s.value?.data) {
          setSettings({ chat_mode: s.value.data.chat_mode ?? 'PUBLIC', slow_mode_ms: s.value.data.slow_mode_ms ?? 0 });
        }
        if (w.status === 'fulfilled') setWords(Array.isArray(w.value?.data) ? w.value.data : []);
        if (b.status === 'fulfilled') setBans(Array.isArray(b.value?.data) ? b.value.data : []);
        if (m.status === 'fulfilled') setMods(Array.isArray(m.value?.data) ? m.value.data : []);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    setSettingsMsg('');
    try {
      await updateChatSettings({ chat_mode: settings.chat_mode, slow_mode_ms: Number(settings.slow_mode_ms) });
      setSettingsMsg('Saved');
      setTimeout(() => setSettingsMsg(''), 2000);
    } catch {
      setSettingsMsg('Could not save');
    } finally {
      setSavingSettings(false);
    }
  };

  const submitWord = async (e) => {
    e.preventDefault();
    const w = wordInput.trim().toLowerCase();
    if (!w) return;
    try {
      const r = await addBannedWord(w);
      if (r?.data) setWords((prev) => [...prev, r.data].sort((a, b) => a.word.localeCompare(b.word)));
      setWordInput('');
    } catch {
      setWordInput('');
    }
  };

  const deleteWord = async (wordId) => {
    setWords((prev) => prev.filter((x) => x.word_id !== wordId));
    try { await removeBannedWord(wordId); } catch { /* optimistic */ }
  };

  const submitBan = async (e) => {
    e.preventDefault();
    const username = banForm.username.trim().replace(/^@/, '');
    if (!username) return;
    setBanBusy(true);
    setBanMsg('');
    try {
      await banChatUser({
        target_username: username,
        reason: banForm.reason.trim() || undefined,
        duration_minutes: banForm.duration ? Number(banForm.duration) : undefined,
      });
      const fresh = await getChatBans();
      setBans(Array.isArray(fresh?.data) ? fresh.data : []);
      setBanForm({ username: '', reason: '', duration: '' });
      setBanMsg('User banned');
      setTimeout(() => setBanMsg(''), 2000);
    } catch (err) {
      setBanMsg(err?.response?.data?.message === 'Target_Not_Found' ? 'No user with that username' : 'Could not ban');
    } finally {
      setBanBusy(false);
    }
  };

  const lift = async (userId) => {
    setBans((prev) => prev.filter((b) => b.user_id !== userId));
    try { await unbanChatUser(userId); } catch { /* optimistic */ }
  };

  const submitMod = async (e) => {
    e.preventDefault();
    const username = modInput.trim().replace(/^@/, '');
    if (!username) return;
    setModMsg('');
    try {
      const r = await addChatModerator(username);
      if (r?.data) setMods((prev) => [r.data, ...prev]);
      setModInput('');
    } catch (err) {
      const code = err?.response?.data?.message;
      setModMsg(code === 'Already_Moderator' ? 'Already a moderator' : code === 'Target_Not_Found' ? 'No user with that username' : 'Could not add');
    }
  };

  const removeMod = async (userId) => {
    setMods((prev) => prev.filter((m) => m.user_id !== userId));
    try { await removeChatModerator(userId); } catch { /* optimistic */ }
  };

  const banState = (b) => {
    if (!b.expires_at) return { label: 'Permanent', expired: false };
    const exp = new Date(b.expires_at);
    if (exp <= new Date()) return { label: 'Expired', expired: true };
    return { label: `Until ${exp.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, expired: false };
  };

  if (loading) {
    return <p style={{ color: MUTED, fontFamily: font, fontSize: 14, padding: '8px 0' }}>Loading moderation tools…</p>;
  }

  const card = {
    background: PANEL,
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    padding: isMobile ? 16 : 20,
    marginBottom: 16,
  };
  const cardTitle = { fontFamily: fontDisplay, fontWeight: 700, fontSize: 16, letterSpacing: '0.05em', textTransform: 'uppercase', color: TEXT, margin: '0 0 4px' };
  const cardHint = { fontSize: 12.5, color: MUTED_DIM, margin: '0 0 16px', fontFamily: font, lineHeight: 1.4 };
  const fieldStyle = { background: FIELD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', color: TEXT, fontSize: 13.5, fontFamily: font, outline: 'none' };
  const btnPrimary = { background: color, border: 'none', borderRadius: 10, padding: '10px 18px', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: font, cursor: 'pointer', flexShrink: 0 };
  const chip = { display: 'inline-flex', alignItems: 'center', gap: 8, border: `1px solid ${BORDER}`, borderRadius: 999, padding: '5px 6px 5px 14px', fontSize: 13, color: TEXT, fontFamily: font };
  const chipX = { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', border: 'none', color: MUTED, cursor: 'pointer', flexShrink: 0 };
  const rowItem = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderTop: `1px solid ${BORDER}` };
  const label = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: MUTED, marginBottom: 6, fontFamily: font };

  return (
    <div style={{ maxWidth: 720, fontFamily: font }}>
      {/* Chat controls */}
      <div style={card}>
        <h3 style={cardTitle}>Chat controls</h3>
        <p style={cardHint}>Who can chat and how often. Changes apply to your live chat instantly.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <span style={label}>Who can chat</span>
            <select
              value={settings.chat_mode}
              onChange={(e) => setSettings((s) => ({ ...s, chat_mode: e.target.value }))}
              style={{ ...fieldStyle, width: '100%' }}
            >
              {CHAT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <span style={label}>Slow mode</span>
            <select
              value={settings.slow_mode_ms}
              onChange={(e) => setSettings((s) => ({ ...s, slow_mode_ms: Number(e.target.value) }))}
              style={{ ...fieldStyle, width: '100%' }}
            >
              {SLOW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button type="button" onClick={saveSettings} disabled={savingSettings} style={{ ...btnPrimary, opacity: savingSettings ? 0.6 : 1 }}>
            {savingSettings ? 'Saving…' : 'Save'}
          </button>
          {settingsMsg && <span style={{ fontSize: 13, color: settingsMsg === 'Saved' ? '#4ade80' : '#f87171', alignSelf: 'center' }}>{settingsMsg}</span>}
        </div>
      </div>

      {/* Blocked words (automod) */}
      <div style={card}>
        <h3 style={cardTitle}>Blocked words</h3>
        <p style={cardHint}>Messages containing any of these are automatically rejected from your chat.</p>
        <form onSubmit={submitWord} style={{ display: 'flex', gap: 10, marginBottom: words.length ? 16 : 0 }}>
          <input
            value={wordInput}
            onChange={(e) => setWordInput(e.target.value)}
            placeholder="Add a word or phrase"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <button type="submit" style={btnPrimary}>Add</button>
        </form>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {words.map((w) => (
            <span key={w.word_id} className="bg-surface-raised" style={chip}>
              {w.word}
              <button type="button" aria-label={`Remove ${w.word}`} onClick={() => deleteWord(w.word_id)} className="bg-surface-raised" style={chipX}><XIcon /></button>
            </span>
          ))}
          {words.length === 0 && <span style={{ fontSize: 13, color: MUTED_DIM }}>No blocked words yet.</span>}
        </div>
      </div>

      {/* Bans */}
      <div style={card}>
        <h3 style={cardTitle}>Bans &amp; timeouts</h3>
        <p style={cardHint}>Ban a viewer permanently or time them out. Enter their @username.</p>
        <form onSubmit={submitBan} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: bans.length ? 18 : 0 }}>
          <input
            value={banForm.username}
            onChange={(e) => setBanForm((f) => ({ ...f, username: e.target.value }))}
            placeholder="@username"
            style={{ ...fieldStyle, flex: '1 1 150px', minWidth: 0 }}
          />
          <input
            value={banForm.reason}
            onChange={(e) => setBanForm((f) => ({ ...f, reason: e.target.value }))}
            placeholder="Reason (optional)"
            style={{ ...fieldStyle, flex: '2 1 180px', minWidth: 0 }}
          />
          <select
            value={banForm.duration}
            onChange={(e) => setBanForm((f) => ({ ...f, duration: e.target.value }))}
            style={{ ...fieldStyle, flex: '1 1 130px', minWidth: 0 }}
          >
            {BAN_DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <button type="submit" disabled={banBusy} style={{ ...btnPrimary, opacity: banBusy ? 0.6 : 1 }}>{banBusy ? 'Banning…' : 'Ban'}</button>
          {banMsg && <span style={{ fontSize: 13, color: banMsg === 'User banned' ? '#4ade80' : '#f87171', alignSelf: 'center', width: '100%' }}>{banMsg}</span>}
        </form>
        <div>
          {bans.map((b) => {
            const st = banState(b);
            return (
              <div key={b.ban_id} style={rowItem}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(b.user)}</div>
                  <div style={{ fontSize: 12, color: MUTED_DIM, marginTop: 2 }}>
                    <span style={{ color: st.expired ? MUTED_DIM : color }}>{st.label}</span>
                    {b.reason ? ` · ${b.reason}` : ''}
                  </div>
                </div>
                <button type="button" onClick={() => lift(b.user_id)} style={{ ...btnPrimary, background: 'var(--color-surface-raised)', color: TEXT, padding: '7px 14px', fontSize: 12.5 }}>Unban</button>
              </div>
            );
          })}
          {bans.length === 0 && <span style={{ fontSize: 13, color: MUTED_DIM }}>No banned viewers.</span>}
        </div>
      </div>

      {/* Moderators */}
      <div style={card}>
        <h3 style={cardTitle}>Moderators</h3>
        <p style={cardHint}>Moderators can ban and time out viewers in your chat on your behalf.</p>
        <form onSubmit={submitMod} style={{ display: 'flex', gap: 10, marginBottom: mods.length ? 16 : 0 }}>
          <input
            value={modInput}
            onChange={(e) => setModInput(e.target.value)}
            placeholder="@username"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <button type="submit" style={btnPrimary}>Add mod</button>
        </form>
        {modMsg && <p style={{ fontSize: 13, color: '#f87171', margin: '0 0 12px' }}>{modMsg}</p>}
        <div>
          {mods.map((m) => (
            <div key={m.mod_id} style={rowItem}>
              <span style={{ fontSize: 14, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(m.user)}</span>
              <button type="button" onClick={() => removeMod(m.user_id)} className="bg-surface-raised" style={{ ...chipX, width: 28, height: 28 }} aria-label="Remove moderator"><XIcon s={15} /></button>
            </div>
          ))}
          {mods.length === 0 && <span style={{ fontSize: 13, color: MUTED_DIM }}>No moderators yet.</span>}
        </div>
      </div>
    </div>
  );
}
