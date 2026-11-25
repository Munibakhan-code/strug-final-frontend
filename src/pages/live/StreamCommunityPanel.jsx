import { useCallback, useEffect, useState } from 'react';
import {
  createLiveSchedule,
  createLiveCommunityPost,
  getMyCommunityContent,
  deleteLiveSchedule,
  deleteLiveCommunityPost,
} from '../../api/live';

const font = "'DM Sans', sans-serif";
const fontDisplay = "'Barlow Condensed', sans-serif";

/**
 * Streamer dashboard Community tab — create + manage schedule / posts.
 */
export default function StreamCommunityPanel({ color = '#9146FF', isMobile }) {
  const [tab, setTab] = useState('post');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [schedule, setSchedule] = useState([]);
  const [posts, setPosts] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  const [schedTitle, setSchedTitle] = useState('');
  const [schedDesc, setSchedDesc] = useState('');
  const [schedAt, setSchedAt] = useState('');

  const [postContent, setPostContent] = useState('');
  const [pollA, setPollA] = useState('');
  const [pollB, setPollB] = useState('');
  const [usePoll, setUsePoll] = useState(false);

  const inputClassName = 'bg-surface-raised border border-border text-text-primary';

  const input = {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 10,
    padding: '10px 12px',
    fontFamily: font,
    fontSize: 13,
    outline: 'none',
    marginBottom: 10,
  };

  const flash = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 3500);
  };

  const reload = useCallback(() => {
    setListLoading(true);
    return getMyCommunityContent()
      .then((res) => {
        const d = res?.data ?? res;
        setSchedule(Array.isArray(d?.schedule) ? d.schedule : []);
        setPosts(Array.isArray(d?.posts) ? d.posts : []);
      })
      .catch(() => {
        setSchedule([]);
        setPosts([]);
      })
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const submitSchedule = async () => {
    if (!schedTitle.trim() || !schedAt) {
      flash('Title and date/time are required');
      return;
    }
    setBusy(true);
    try {
      const iso = new Date(schedAt).toISOString();
      await createLiveSchedule({
        title: schedTitle.trim(),
        description: schedDesc.trim() || undefined,
        scheduled_at: iso,
      });
      setSchedTitle('');
      setSchedDesc('');
      setSchedAt('');
      flash('Schedule published — viewers will see it on your channel.');
      await reload();
    } catch (e) {
      flash(e?.response?.data?.message || 'Could not create schedule');
    } finally {
      setBusy(false);
    }
  };

  const submitPost = async () => {
    if (!postContent.trim() && !usePoll) {
      flash('Write something to post');
      return;
    }
    const poll_options = usePoll
      ? [pollA, pollB].map((s) => s.trim()).filter(Boolean)
      : undefined;
    if (usePoll && (!poll_options || poll_options.length < 2)) {
      flash('Polls need at least two options');
      return;
    }
    setBusy(true);
    try {
      await createLiveCommunityPost({
        content: postContent.trim() || undefined,
        poll_options,
      });
      setPostContent('');
      setPollA('');
      setPollB('');
      setUsePoll(false);
      flash('Posted to your channel community feed.');
      await reload();
    } catch (e) {
      flash(e?.response?.data?.message || 'Could not create post');
    } finally {
      setBusy(false);
    }
  };

  const removeSchedule = async (id) => {
    setBusy(true);
    try {
      await deleteLiveSchedule(id);
      flash('Schedule cancelled.');
      await reload();
    } catch (e) {
      flash(e?.response?.data?.message || 'Could not cancel schedule');
    } finally {
      setBusy(false);
    }
  };

  const removePost = async (id) => {
    setBusy(true);
    try {
      await deleteLiveCommunityPost(id);
      flash('Post deleted.');
      await reload();
    } catch (e) {
      flash(e?.response?.data?.message || 'Could not delete post');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <p className="text-text-secondary" style={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: 15, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 12px' }}>
        Community
      </p>
      <p className="text-text-secondary" style={{ fontFamily: font, fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
        Post updates and schedule streams. Manage what viewers see on your public channel page.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'post', label: 'New post' },
          { id: 'schedule', label: 'Schedule' },
          { id: 'manage', label: 'Manage' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: tab === t.id ? color : 'var(--color-surface-raised)',
              color: tab === t.id ? '#fff' : 'var(--color-text-primary)',
              fontFamily: font,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-surface border border-border" style={{ borderRadius: 14, padding: isMobile ? 16 : 20 }}>
        {tab === 'schedule' && (
          <>
            <input className={inputClassName} style={input} placeholder="Stream title" value={schedTitle} onChange={(e) => setSchedTitle(e.target.value)} />
            <input className={inputClassName} style={input} type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)} />
            <textarea className={inputClassName} style={{ ...input, minHeight: 80, resize: 'vertical' }} placeholder="Description (optional)" value={schedDesc} onChange={(e) => setSchedDesc(e.target.value)} />
            <button type="button" disabled={busy} onClick={submitSchedule} style={{ padding: '10px 18px', background: color, border: 'none', borderRadius: 10, color: '#fff', fontFamily: font, fontWeight: 700, fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Saving…' : 'Publish schedule'}
            </button>
          </>
        )}
        {tab === 'post' && (
          <>
            <textarea className={inputClassName} style={{ ...input, minHeight: 100, resize: 'vertical' }} placeholder="Share an update with your community…" value={postContent} onChange={(e) => setPostContent(e.target.value)} />
            <label className="text-text-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: font, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={usePoll} onChange={(e) => setUsePoll(e.target.checked)} />
              Add a poll
            </label>
            {usePoll && (
              <>
                <input className={inputClassName} style={input} placeholder="Option A" value={pollA} onChange={(e) => setPollA(e.target.value)} />
                <input className={inputClassName} style={input} placeholder="Option B" value={pollB} onChange={(e) => setPollB(e.target.value)} />
              </>
            )}
            <button type="button" disabled={busy} onClick={submitPost} style={{ padding: '10px 18px', background: color, border: 'none', borderRadius: 10, color: '#fff', fontFamily: font, fontWeight: 700, fontSize: 13, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Posting…' : 'Post'}
            </button>
          </>
        )}
        {tab === 'manage' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {listLoading ? (
              <p className="text-text-muted" style={{ fontFamily: font, fontSize: 13, margin: 0 }}>Loading…</p>
            ) : (
              <>
                <div>
                  <p className="text-text-secondary" style={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 8px' }}>Upcoming schedule</p>
                  {schedule.length === 0 ? (
                    <p className="text-text-muted" style={{ fontFamily: font, fontSize: 13, margin: 0 }}>No upcoming schedules.</p>
                  ) : schedule.map((row) => (
                    <div key={row.schedule_id} className="border border-border" style={{ borderRadius: 10, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div>
                        <p className="text-text-primary" style={{ fontFamily: font, fontWeight: 600, fontSize: 13, margin: '0 0 4px' }}>{row.title}</p>
                        <p className="text-text-muted" style={{ fontFamily: font, fontSize: 12, margin: 0 }}>{new Date(row.scheduled_at).toLocaleString()}</p>
                      </div>
                      <button type="button" disabled={busy} onClick={() => removeSchedule(row.schedule_id)} style={{ background: 'transparent', border: '1px solid #f87171', color: '#f87171', borderRadius: 8, padding: '6px 10px', fontFamily: font, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-text-secondary" style={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 8px' }}>Recent posts</p>
                  {posts.length === 0 ? (
                    <p className="text-text-muted" style={{ fontFamily: font, fontSize: 13, margin: 0 }}>No posts yet.</p>
                  ) : posts.map((row) => (
                    <div key={row.post_id} className="border border-border" style={{ borderRadius: 10, padding: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="text-text-primary" style={{ fontFamily: font, fontSize: 13, margin: '0 0 4px', whiteSpace: 'pre-wrap' }}>{row.content || (row.is_poll ? 'Poll' : 'Post')}</p>
                        <p className="text-text-muted" style={{ fontFamily: font, fontSize: 11, margin: 0 }}>
                          {row.created_at ? new Date(row.created_at).toLocaleDateString() : ''}
                          {row._count?.likes != null ? ` · ${row._count.likes} likes` : ''}
                        </p>
                      </div>
                      <button type="button" disabled={busy} onClick={() => removePost(row.post_id)} style={{ background: 'transparent', border: '1px solid #f87171', color: '#f87171', borderRadius: 8, padding: '6px 10px', fontFamily: font, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {msg && (
          <p style={{ margin: '12px 0 0', fontFamily: font, fontSize: 12, color: msg.includes('Could') || msg.includes('required') || msg.includes('need') ? '#f87171' : '#4ade80' }}>
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
