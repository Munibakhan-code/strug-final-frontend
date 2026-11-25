// #334 Community Spaces — live group-audio UI (scaffold).
//
// Self-contained launcher: a button that opens a portal overlay with two views —
// a browse list of live spaces (+ start a space) and the live room itself
// (participant roster by role, raise hand, mic mute, host controls). Audio runs
// over the WebRTC mesh in ../api/spacesRTC.js; roster changes arrive over sockets.

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getUser } from "../store/auth";
import { connectSocket } from "../api/socket";
import { listSpaces, listPastSpaces, createSpace, joinSpace, leaveSpace, endSpace, setSpaceRole, raiseHand } from "../api/spaces";
import { createSpaceRTC } from "../api/spacesRTC";
import { Avatar as SharedAvatar } from "../components/SafeImage.jsx";

const FONT = "'DM Sans', sans-serif";
const HEAD = "'Barlow Condensed', sans-serif";

// #457: delegate to the shared Avatar so a purged/404 photo falls back to the initial rather than
// the browser's broken-image icon. The ring + colours are preserved via the style override.
function Avatar({ url, name, size = 44, ring }) {
  const initial = (name || "?").trim()[0]?.toUpperCase() || "?";
  return (
    <SharedAvatar
      url={url}
      initials={initial}
      size={size}
      style={{ background: "#2563eb", fontFamily: FONT, fontSize: size * 0.4, border: ring ? `2px solid ${ring}` : "2px solid transparent" }}
    />
  );
}

function HandIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
  );
}

function MicIcon({ on, size = 14 }) {
  return on ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
  );
}

function SpacesOverlay({ onClose, communityId, communityName }) {
  const { t } = useTranslation();
  const me = getUser();
  const myId = me?.user_id;

  const [view, setView] = useState("browse");
  const [spaces, setSpaces] = useState([]);
  const [pastSpaces, setPastSpaces] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [space, setSpace] = useState(null);
  const [micMuted, setMicMuted] = useState(true);
  const [remoteStreams, setRemoteStreams] = useState(() => new Map());
  const rtcRef = useRef(null);

  const refreshList = useCallback(() => {
    setLoadingList(true);
    listSpaces(communityId)
      .then((list) => setSpaces(Array.isArray(list) ? list : []))
      .catch(() => setSpaces([]))
      .finally(() => setLoadingList(false));
    // #6: previous spaces of people you follow (best-effort, doesn't gate the live list).
    listPastSpaces(communityId)
      .then((list) => setPastSpaces(Array.isArray(list) ? list : []))
      .catch(() => setPastSpaces([]));
  }, [communityId]);

  useEffect(() => { if (view === "browse") refreshList(); }, [view, refreshList]);

  const myParticipant = space?.participants?.find((p) => p.user_id === myId) || null;
  const canSpeak = myParticipant?.role === "host" || myParticipant?.role === "speaker";
  const isHost = space?.host_id === myId;

  // Tear down audio + membership when leaving the room.
  const teardown = useCallback(async (endIt) => {
    try { rtcRef.current?.leave(); } catch { /* ignore */ }
    rtcRef.current = null;
    setRemoteStreams(new Map());
    const id = space?.id;
    if (id) {
      try { endIt ? await endSpace(id) : await leaveSpace(id); } catch { /* ignore */ }
    }
  }, [space?.id]);

  // Subscribe to roster + lifecycle events while in a room.
  useEffect(() => {
    if (view !== "room" || !space?.id) return undefined;
    const socket = connectSocket();
    const onUpdated = (s) => { if (s?.id === space.id) setSpace(s); };
    const onEnded = (payload) => {
      if (payload?.space_id === space.id) {
        try { rtcRef.current?.leave(); } catch { /* ignore */ }
        rtcRef.current = null;
        setError(t("spaces.ended", { defaultValue: "This space has ended." }));
        setView("browse");
        setSpace(null);
      }
    };
    socket.on("space-updated", onUpdated);
    socket.on("space-ended", onEnded);
    return () => { socket.off("space-updated", onUpdated); socket.off("space-ended", onEnded); };
  }, [view, space?.id, t]);

  // If we get promoted to speaker mid-session, start publishing the mic.
  useEffect(() => {
    if (view === "room" && canSpeak && rtcRef.current && !rtcRef.current.isSpeaking()) {
      rtcRef.current.promoteToSpeaker();
    }
  }, [view, canSpeak]);

  async function enterRoom(spaceId) {
    setBusy(true); setError("");
    try {
      const detail = await joinSpace(spaceId);
      setSpace(detail);
      setView("room");
      const speak = detail.host_id === myId || detail.participants?.find((p) => p.user_id === myId)?.role !== "listener";
      const rtc = createSpaceRTC({
        spaceId,
        onRemoteStream: (id, stream) => setRemoteStreams((prev) => { const next = new Map(prev); next.set(id, stream); return next; }),
        onRemoteGone: (id) => setRemoteStreams((prev) => { const next = new Map(prev); next.delete(id); return next; }),
        onError: () => {},
      });
      rtcRef.current = rtc;
      await rtc.join(speak);
      // Speakers start muted; they explicitly unmute.
      rtc.setMuted(true);
      setMicMuted(true);
    } catch (e) {
      setError(e?.response?.data?.error || t("spaces.joinFailed", { defaultValue: "Couldn't join this space." }));
    } finally { setBusy(false); }
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setBusy(true); setError("");
    try {
      const created = await createSpace(title.trim(), communityId);
      setShowCreate(false); setTitle("");
      await enterRoom(created.id);
    } catch (e) {
      setError(e?.response?.data?.error || t("spaces.createFailed", { defaultValue: "Couldn't start the space." }));
      setBusy(false);
    }
  }

  async function handleLeave(endIt) {
    setBusy(true);
    await teardown(endIt);
    setSpace(null); setView("browse"); setBusy(false);
  }

  function toggleMute() {
    const next = !micMuted;
    setMicMuted(next);
    rtcRef.current?.setMuted(next);
  }

  async function toggleHand() {
    if (!space?.id) return;
    try { const s = await raiseHand(space.id, !myParticipant?.hand_raised); setSpace(s); } catch { /* ignore */ }
  }

  async function changeRole(userId, role) {
    if (!space?.id) return;
    try { const s = await setSpaceRole(space.id, userId, role); setSpace(s); } catch { /* ignore */ }
  }

  const speakers = (space?.participants || []).filter((p) => p.role === "host" || p.role === "speaker");
  const listeners = (space?.participants || []).filter((p) => p.role === "listener");

  // Modal backdrop scrims (here and on the create-space modal below) stay a fixed dark
  // overlay in both themes — a deliberate "dim everything behind the modal" treatment,
  // matching the convention already used for modals across the app.
  const overlay = (
    <div style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(6,8,15,0.72)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget && view === "browse") onClose(); }}>
      <div className="bg-surface border border-border" style={{ width: "100%", maxWidth: 560, maxHeight: "88vh", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", width: 30, height: 30, borderRadius: 9, background: "rgba(139,92,246,0.18)", border: "1px solid rgba(139,92,246,0.4)", alignItems: "center", justifyContent: "center", color: "#c4b5fd" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
            </span>
            <div>
              <p className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 19, margin: 0, letterSpacing: "0.03em" }}>{t("spaces.title", { defaultValue: "Spaces" })}</p>
              {communityName ? <p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 11, margin: 0 }}>{communityName}</p> : null}
            </div>
          </div>
          <button onClick={() => (view === "room" ? handleLeave(false) : onClose())} className="text-text-secondary" style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {error ? <div style={{ padding: "10px 20px", background: "rgba(248,113,113,0.12)", color: "#fca5a5", fontFamily: FONT, fontSize: 12 }}>{error}</div> : null}

        <div style={{ overflowY: "auto", padding: 20, flex: 1 }}>
          {view === "browse" ? (
            <>
              <button onClick={() => { setShowCreate(true); setTitle(""); setError(""); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(90deg,#7c3aed,#2563eb)", color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 18 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {t("spaces.start", { defaultValue: "Start a space" })}
              </button>
              {loadingList ? (
                <p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13, textAlign: "center", padding: 24 }}>{t("common.loading", { defaultValue: "Loading…" })}</p>
              ) : spaces.length === 0 ? (
                <p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 13, textAlign: "center", padding: 24 }}>{t("spaces.empty", { defaultValue: "No live spaces right now. Start one!" })}</p>
              ) : (
                spaces.map((s) => (
                  <button key={s.id} onClick={() => enterRoom(s.id)} disabled={busy} className="border border-border-subtle bg-surface-raised" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, cursor: "pointer", marginBottom: 10 }}>
                    <Avatar url={s.host?.profile_pic_url} name={s.host?.name} size={40} ring="#8b5cf6" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444" }} />
                        <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: "#f87171", letterSpacing: "0.06em" }}>LIVE</span>
                      </div>
                      <p className="text-text-primary" style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, margin: "2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</p>
                      <p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12, margin: 0 }}>{s.host?.name} · {s.participant_count} {t("spaces.listening", { defaultValue: "listening" })}</p>
                    </div>
                  </button>
                ))
              )}

              {/* #6: Previous spaces of people you follow. Audio replay isn't captured yet
                  (spaces are P2P/WebRTC), so these open the space page for details rather
                  than a recording — a player appears here once recording_url is populated. */}
              {pastSpaces.length > 0 && (
                <div style={{ marginTop: 26 }}>
                  <p className="text-text-secondary" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>{t("spaces.previous", { defaultValue: "Previous spaces" })}</p>
                  {pastSpaces.map((s) => (
                    <div key={s.id} className="border border-border-subtle bg-surface-raised" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, marginBottom: 10, opacity: 0.92 }}>
                      <Avatar url={s.host?.profile_pic_url} name={s.host?.name} size={40} ring="var(--color-border)" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="text-text-primary" style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</p>
                        <p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12, margin: 0 }}>{s.host?.name} · {s.participant_count} {t("spaces.joined", { defaultValue: "joined" })}{s.ended_at ? ` · ${new Date(s.ended_at).toLocaleDateString()}` : ""}</p>
                      </div>
                      <span className="text-text-muted border border-border" style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", flexShrink: 0 }}>
                        {s.recording_url ? t("spaces.replay", { defaultValue: "REPLAY" }) : t("spaces.ended", { defaultValue: "ENDED" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 22, margin: "0 0 4px", letterSpacing: "0.02em" }}>{space?.title}</p>
              <p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12, margin: "0 0 18px" }}>{(space?.participants?.length || 0)} {t("spaces.inRoom", { defaultValue: "in the room" })}</p>

              <p className="text-text-muted" style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 12px" }}>{t("spaces.speakers", { defaultValue: "SPEAKERS" })}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(84px,1fr))", gap: 14, marginBottom: 22 }}>
                {speakers.map((p) => (
                  <div key={p.user_id} onClick={() => { if (isHost && p.role === "speaker" && p.user_id !== myId) changeRole(p.user_id, "listener"); }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: isHost && p.role === "speaker" && p.user_id !== myId ? "pointer" : "default" }}>
                    <div style={{ position: "relative" }}>
                      <Avatar url={p.profile_pic_url} name={p.name} size={56} ring={p.role === "host" ? "#f59e0b" : "#8b5cf6"} />
                      <span className="bg-surface text-text-secondary" style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}><MicIcon on size={11} /></span>
                    </div>
                    <p className="text-text-primary" style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, margin: 0, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>{p.user_id === myId ? t("spaces.you", { defaultValue: "You" }) : p.name}</p>
                    {p.role === "host" ? <span style={{ fontFamily: FONT, fontSize: 10, color: "#fbbf24", fontWeight: 700 }}>{t("spaces.host", { defaultValue: "Host" })}</span> : null}
                  </div>
                ))}
              </div>

              {listeners.length > 0 && (
                <>
                  <p className="text-text-muted" style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", margin: "0 0 12px" }}>{t("spaces.listeners", { defaultValue: "LISTENERS" })}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(72px,1fr))", gap: 12, marginBottom: 20 }}>
                    {listeners.map((p) => (
                      <div key={p.user_id} onClick={() => { if (isHost && p.user_id !== myId) changeRole(p.user_id, "speaker"); }} title={isHost ? t("spaces.makeSpeaker", { defaultValue: "Make speaker" }) : undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: isHost && p.user_id !== myId ? "pointer" : "default" }}>
                        <div style={{ position: "relative" }}>
                          <Avatar url={p.profile_pic_url} name={p.name} size={44} />
                          {p.hand_raised ? <span style={{ position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%", background: "#8b5cf6", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><HandIcon size={10} /></span> : null}
                        </div>
                        <p className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 11, margin: 0, maxWidth: 68, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>{p.user_id === myId ? t("spaces.you", { defaultValue: "You" }) : p.name}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Room control bar */}
        {view === "room" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--color-border-subtle)" }}>
            {/* Leave/End: background and color ternaries each mix a token with a non-token
                (rgba red wash / #fca5a5), so left inline. */}
            <button onClick={() => handleLeave(isHost)} style={{ padding: "10px 18px", borderRadius: 22, border: "none", background: isHost ? "rgba(248,113,113,0.18)" : "var(--color-surface-raised)", color: isHost ? "#fca5a5" : "var(--color-text-primary)", fontFamily: FONT, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              {isHost ? t("spaces.endSpace", { defaultValue: "End" }) : t("spaces.leave", { defaultValue: "Leave" })}
            </button>
            <div style={{ flex: 1 }} />
            {canSpeak ? (
              // Text stays hardcoded #fff only on the blue-bg (unmuted) branch — that bg is
              // brand blue in both themes. The muted branch's bg is now theme-aware, so its
              // text must be too, or it'd go invisible (white-on-white) in light mode.
              // Both background and color ternaries mix a token with a non-token (#2563eb / #fff),
              // so left inline.
              <button onClick={toggleMute} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 22, border: "none", background: micMuted ? "var(--color-surface-raised)" : "#2563eb", color: micMuted ? "var(--color-text-primary)" : "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                <MicIcon on={!micMuted} /> {micMuted ? t("spaces.unmute", { defaultValue: "Unmute" }) : t("spaces.mute", { defaultValue: "Mute" })}
              </button>
            ) : (
              // Same reasoning as the mute button for background (hand_raised tint has no token
              // at all — "none"/rgba — left as-is); border and color here are pure single-value
              // tokens though, so those move to className.
              <button onClick={toggleHand} className="border border-border text-text-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 22, background: myParticipant?.hand_raised ? "rgba(139,92,246,0.2)" : "none", fontFamily: FONT, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                <HandIcon /> {myParticipant?.hand_raised ? t("spaces.lowerHand", { defaultValue: "Lower hand" }) : t("spaces.raiseHand", { defaultValue: "Raise hand" })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hidden audio sinks for each remote peer's stream. */}
      <div style={{ display: "none" }}>
        {[...remoteStreams.entries()].map(([id, stream]) => (
          <audio key={id} autoPlay ref={(el) => { if (el && el.srcObject !== stream) el.srcObject = stream; }} />
        ))}
      </div>

      {/* Create-space modal */}
      {showCreate && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 4100, background: "rgba(6,8,15,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="bg-surface border border-border" style={{ width: "100%", maxWidth: 420, borderRadius: 18, padding: 22 }}>
            <p className="text-text-primary" style={{ fontFamily: HEAD, fontWeight: 800, fontSize: 20, margin: "0 0 14px" }}>{t("spaces.startTitle", { defaultValue: "Start a space" })}</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus placeholder={t("spaces.titlePlaceholder", { defaultValue: "What do you want to talk about?" })} className="border border-border bg-surface-raised text-text-primary" style={{ width: "100%", padding: "12px 14px", borderRadius: 12, fontFamily: FONT, fontSize: 14, outline: "none", marginBottom: 16 }} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowCreate(false)} className="border border-border text-text-secondary" style={{ padding: "10px 18px", borderRadius: 12, background: "none", fontFamily: FONT, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>{t("common.cancel", { defaultValue: "Cancel" })}</button>
              <button onClick={handleCreate} disabled={busy || !title.trim()} style={{ padding: "10px 22px", borderRadius: 12, border: "none", background: "#2563eb", color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 13, cursor: busy || !title.trim() ? "default" : "pointer", opacity: busy || !title.trim() ? 0.6 : 1 }}>{t("spaces.goLive", { defaultValue: "Go live" })}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}

export default function SpacesLauncher({ communityId, communityName, style }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title={t("spaces.title", { defaultValue: "Spaces" })} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.35)", borderRadius: 20, padding: "9px 18px", fontFamily: FONT, fontWeight: 700, fontSize: 13, color: "#c4b5fd", cursor: "pointer", ...style }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>
        {t("spaces.title", { defaultValue: "Spaces" })}
      </button>
      {open && <SpacesOverlay onClose={() => setOpen(false)} communityId={communityId} communityName={communityName} />}
    </>
  );
}
