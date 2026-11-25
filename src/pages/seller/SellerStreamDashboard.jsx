import React from "react";
import i18n from "../../i18n/index.js";
import { fmtMoney } from "../../utils/regionConfig.js";
import { useViewport } from "../../hooks/useViewport.js";
import StreamerCreatorShell from "../live/StreamerCreatorShell.jsx";
import CategoryPicker from "../live/CategoryPicker.jsx";
import { useDialog } from "../../components/ConfirmDialog.jsx";
import { SellerAnalyticsPanel } from "../../components/sellerAnalytics.jsx";
import StreamModerationPanel from "../live/StreamModerationPanel.jsx";
import StreamerLiveConsole from "../live/StreamerLiveConsole.jsx";
import StreamCommunityPanel from "../live/StreamCommunityPanel.jsx";
import StreamRaidPicker from "../live/StreamRaidPicker.jsx";
import { getStreamerLiveAnalytics } from "../../api/analytics.js";
import {
  SellerDashHeader,
  ProviderTopNav,
  SellerStatCards,
  SellerEditProfileTab,
  SellerEarningsTab,
  clickableProps,
} from "../../components/shared.jsx";
import { getUser } from "../../store/auth.js";
import { connectSocket } from "../../api/socket.js";

function sdCommon(key, opts) {
  return i18n.t(`sellerDash.common.${key}`, opts);
}

function normalizeLiveSession(raw) {
  if (!raw) return null;
  const cfg = raw.stream_config ?? raw;
  return {
    session_id: cfg.session_id ?? null,
    stream_key: cfg.stream_key ?? null,
    server_url: cfg.server_url ?? cfg.ingest_url ?? null,
    playback_url: cfg.playback_url ?? raw.playback_url ?? null,
    acs_room_id: cfg.acs_room_id ?? null,
    status: raw.status ?? cfg.status ?? "STARTING",
    title: raw.title ?? cfg.title ?? null,
    description: raw.description ?? cfg.description ?? null,
    thumbnail_url: raw.thumbnail_url ?? cfg.thumbnail_url ?? null,
    started_at: raw.started_at ?? cfg.started_at ?? null,
    viewer_count: raw.viewer_count ?? cfg.viewer_count ?? null,
  };
}

const STREAMER_HANDLE_RE = /^[a-zA-Z0-9_]{3,30}$/;

function sanitizeStreamerHandle(raw) {
  return String(raw || "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 30);
}

// Streamer earnings wallet: balance, payout request, payout history, and the
// optional Stripe Connect onboarding for automated payouts. Money accrues from
// channel subscriptions; withdrawing is gated on monetization being APPROVED.
function StreamPayoutPanel() {
  const PURPLE = "#9146FF";
  const [wallet, setWallet] = React.useState(null);     // { balance, currency, status } | null
  const [connect, setConnect] = React.useState(null);   // { connected, payouts_enabled } | null
  const [history, setHistory] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [amount, setAmount] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);           // { type, text }
  const [payoutDialog, { confirm: confirmPayout }] = useDialog();

  const fmtMoney = (n, cur) => `${cur || "CAD"} ${Number(n || 0).toFixed(2)}`;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const api = await import("../../api/live");
      const [w, h] = await Promise.allSettled([api.getLiveWalletBalance(), api.getLivePayoutHistory()]);
      setWallet(w.status === "fulfilled" ? w.value : null);
      setHistory(h.status === "fulfilled" ? (h.value?.data ?? []) : []);
      // Connect status only matters once monetization is enabled.
      if (w.status === "fulfilled" && w.value?.status === "APPROVED") {
        api.getConnectStatus().then((c) => setConnect(c)).catch(() => setConnect(null));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const onboard = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const api = await import("../../api/live");
      const r = await api.startConnectOnboarding();
      if (r?.url) { window.location.href = r.url; return; }
      setMsg({ type: "error", text: i18n.t("sd.live.connectUnavailable", { defaultValue: "Payout connect is unavailable right now." }) });
    } catch {
      setMsg({ type: "error", text: i18n.t("sd.live.connectUnavailable", { defaultValue: "Payout connect is unavailable right now." }) });
    } finally {
      setBusy(false);
    }
  };

  const submitPayout = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 100) {
      setMsg({ type: "error", text: i18n.t("sd.live.payoutMin", { defaultValue: "Minimum payout is 100." }) });
      return;
    }
    if (wallet && amt > Number(wallet.balance)) {
      setMsg({ type: "error", text: i18n.t("sd.live.payoutInsufficient", { defaultValue: "Amount exceeds your balance." }) });
      return;
    }
    const ok = await confirmPayout({
      title: i18n.t("sd.live.payoutConfirmTitle", { defaultValue: "Request payout?" }),
      message: i18n.t("sd.live.payoutConfirmMsg", { defaultValue: "Request a payout of {{amt}}? This holds the funds while it is reviewed.", amt: fmtMoney(amt, wallet?.currency) }),
      confirmText: i18n.t("sd.live.payoutConfirmCta", { defaultValue: "Request payout" }),
    });
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const api = await import("../../api/live");
      await api.requestLivePayout(amt);
      setAmount("");
      setMsg({ type: "success", text: i18n.t("sd.live.payoutRequested", { defaultValue: "Payout requested." }) });
      await load();
    } catch (e) {
      const m = e?.response?.data?.message;
      setMsg({ type: "error", text: m === "Insufficient_Balance" ? i18n.t("sd.live.payoutInsufficient", { defaultValue: "Amount exceeds your balance." }) : m === "Monetization_Not_Enabled" ? i18n.t("sd.live.payoutNotEnabled", { defaultValue: "Monetization is not enabled yet." }) : i18n.t("common.somethingWrong", { defaultValue: "Something went wrong." }) });
    } finally {
      setBusy(false);
    }
  };

  const STATUS_COLORS = { PENDING: "#fbbf24", APPROVED: "#60a5fa", PAID: "#4ade80", REJECTED: "#f87171" };

  if (loading) {
    return <div className="text-text-secondary" style={{ maxWidth: 720, padding: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>{i18n.t("common.loading", { defaultValue: "Loading…" })}</div>;
  }

  // No wallet yet = never earned anything from subscriptions.
  const balance = wallet ? Number(wallet.balance) : 0;
  const approved = wallet?.status === "APPROVED";

  return (
    <div style={{ maxWidth: 720, marginBottom: 20 }}>
      {payoutDialog}
      <div style={{ background: "rgba(145,70,255,0.08)", border: "1px solid rgba(145,70,255,0.35)", borderRadius: 14, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h3 className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase" }}>{i18n.t("sd.live.payoutBalance", { defaultValue: "Payout Balance" })}</h3>
          <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, color: PURPLE }}>{fmtMoney(balance, wallet?.currency)}</span>
        </div>

        {!approved && (
          <p className="text-text-secondary" style={{ margin: "10px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
            {i18n.t("sd.live.payoutNeedsApproval", { defaultValue: "Earnings from subscriptions accrue here. You can withdraw once your channel is approved for monetization." })}
          </p>
        )}

        {approved && (
          <>
            {/* Connect status / onboarding */}
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {connect?.payouts_enabled ? (
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#4ade80" }}>● {i18n.t("sd.live.connectReady", { defaultValue: "Connected — payouts sent automatically" })}</span>
              ) : (
                <>
                  <button onClick={onboard} disabled={busy} style={{ background: PURPLE, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                    {connect?.connected ? i18n.t("sd.live.connectFinish", { defaultValue: "Finish payout setup" }) : i18n.t("sd.live.connectStart", { defaultValue: "Connect payouts" })}
                  </button>
                  <span className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11 }}>{i18n.t("sd.live.connectOptional", { defaultValue: "Optional — otherwise payouts are sent manually." })}</span>
                </>
              )}
            </div>

            {/* Request payout */}
            <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="number" min="100" step="1" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={i18n.t("sd.live.payoutAmount", { defaultValue: "Amount (min 100)" })}
                // Recessed inset relative to the surrounding purple-tinted panel, same role as
                // StreamerLiveConsole's OBS credentials <code> box.
                className="bg-bg border border-border text-text-primary"
                style={{ borderRadius: 8, padding: "8px 12px", fontSize: 13, fontFamily: "'DM Sans', sans-serif", width: 180 }}
              />
              {/* Idle/disabled state's background is now a token that goes near-white in light
                  theme, so fixed white/faded-white text would lose contrast — only the enabled
                  (solid PURPLE) state keeps hardcoded white. */}
              <button onClick={submitPayout} disabled={busy || balance < 100} style={{ background: balance < 100 ? "var(--color-surface-raised)" : PURPLE, color: balance < 100 ? "var(--color-text-muted)" : "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: busy || balance < 100 ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                {i18n.t("sd.live.payoutRequest", { defaultValue: "Request payout" })}
              </button>
            </div>
          </>
        )}

        {msg && (
          <p style={{ margin: "12px 0 0", fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: msg.type === "success" ? "#4ade80" : "#f87171" }}>{msg.text}</p>
        )}

        {/* History */}
        {history.length > 0 && (
          <div style={{ marginTop: 18, borderTop: "1px solid var(--color-border-subtle)", paddingTop: 14 }}>
            <p className="text-text-secondary" style={{ margin: "0 0 8px", fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase" }}>{i18n.t("sd.live.payoutHistory", { defaultValue: "Payout History" })}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {history.slice(0, 20).map((p) => (
                <div key={p.payout_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                  <span className="text-text-primary">{fmtMoney(p.amount)}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="text-text-secondary" style={{ fontSize: 11 }}>{new Date(p.created_at).toLocaleDateString()}</span>
                    <span style={{ color: STATUS_COLORS[p.status] || "var(--color-text-secondary)", fontSize: 11, fontWeight: 600 }}>{p.status}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SellerStreamDashboard({ config, onNavigate }) {
  const { isMobile } = useViewport();
  const color = config?.color || "#dc2626";
  const [tab, setTab] = React.useState("Overview");
  const tabs = ["Overview", "Go Live", "VODs", "Earnings", "Analytics", "Moderation", "Community", "Edit Profile"];

  const [streamerProfile, setStreamerProfile] = React.useState(null);
  const [profileLoading, setProfileLoading] = React.useState(true);
  const [setupForm, setSetupForm] = React.useState({
    handle: "",
    display_name: "",
    description: "",
    category_id: "",
    category_name: "",
  });
  const [liveCategories, setLiveCategories] = React.useState([]);
  const [setupMsg, setSetupMsg] = React.useState("");
  const [setupLoading, setSetupLoading] = React.useState(false);

  const [activeSession, setActiveSession] = React.useState(null);
  const [sessionLoading, setSessionLoading] = React.useState(false);
  const [streamTitle, setStreamTitle] = React.useState("");
  const [streamDescription, setStreamDescription] = React.useState("");
  const [goLiveThumbFile, setGoLiveThumbFile] = React.useState(null);
  const [goLiveThumbPreview, setGoLiveThumbPreview] = React.useState(null);
  const [goLiveCategory, setGoLiveCategory] = React.useState({ categoryId: null, categoryName: "" });
  const [goLiveMode, setGoLiveMode] = React.useState("obs");
  const [viewerCount, setViewerCount] = React.useState(0);
  const [raidPickerOpen, setRaidPickerOpen] = React.useState(false);

  const [vods, setVods] = React.useState([]);
  const [playingVod, setPlayingVod] = React.useState(null);
  const [vodEditId, setVodEditId] = React.useState(null);
  const [vodEditTitle, setVodEditTitle] = React.useState("");
  const [vodEditDescription, setVodEditDescription] = React.useState("");
  const [vodActionMsg, setVodActionMsg] = React.useState("");
  const [vodBusyId, setVodBusyId] = React.useState(null);
  const playingVodVideoRef = React.useRef(null);
  const goLiveThumbInputRef = React.useRef(null);
  const vodThumbInputRef = React.useRef(null);
  const [copiedField, setCopiedField] = React.useState(null);
  const [activeToggling, setActiveToggling] = React.useState(false);
  const [subscribers, setSubscribers] = React.useState({ count: 0, subscribers: [] });
  const [streamDialog, { confirm: confirmStream }] = useDialog();

  const copyToClipboard = (label, value) => {
    if (!value) return;
    navigator.clipboard?.writeText(value);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1500);
  };

  React.useEffect(() => {
    import("../../api/live").then((api) => {
      api
        .getMyStreamerProfile()
        .then((r) => {
          const profile = r?.data || null;
          setStreamerProfile(profile);
          if (profile?.category_id) {
            setGoLiveCategory({
              categoryId: profile.category_id,
              categoryName: profile.category?.category_name ?? "",
            });
          }
        })
        .catch(() => { })
        .finally(() => setProfileLoading(false));
      api
        .getLiveCategories()
        .then((r) => {
          const cats = Array.isArray(r?.data) ? r.data : [];
          setLiveCategories(cats);
          setSetupForm((f) => ({
            ...f,
            category_id: f.category_id || String(cats[0]?.category_id ?? ""),
          }));
        })
        .catch(() => { });
      api
        .getActiveLiveSession()
        .then((r) => {
          if (r?.data) {
            const session = normalizeLiveSession(r.data);
            setActiveSession(session);
            if (session?.title) setStreamTitle(session.title);
            if (session?.description) setStreamDescription(session.description);
          }
        })
        .catch(() => { });
      api
        .getMyVods()
        .then((r) => {
          const items = Array.isArray(r) ? r : (r?.data ?? []);
          setVods(items);
        })
        .catch(() => { });
      api
        .getMySubscribers?.()
        .then((r) => setSubscribers({ count: r?.count ?? 0, subscribers: r?.subscribers ?? [] }))
        .catch(() => { });
    });
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const loadActive = async () => {
      try {
        const api = await import("../../api/live");
        const r = await api.getActiveLiveSession();
        if (cancelled) return;
        if (r?.data) {
          setActiveSession(normalizeLiveSession(r.data));
          if (typeof r.data.viewer_count === "number") setViewerCount(r.data.viewer_count);
        } else {
          setActiveSession(null);
          setViewerCount(0);
        }
      } catch { /* ignore transient API errors — next poll retries */ }
    };
    // Restore immediately on mount (reload persistence), then keep polling whether or not
    // we currently have local state. Polling-when-null recovers from a failed first fetch;
    // polling-when-set clears "You're live" once OBS disconnect finishes the DB row.
    loadActive();
    const id = setInterval(loadActive, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  React.useEffect(() => {
    if (!activeSession?.session_id) return;
    const s = connectSocket();
    // Join our own room so we receive viewer-count-updated (server emits to the room,
    // not a per-session event name — the old `viewer-count-${id}` never fired).
    const join = () => s.emit("join-stream", { session_id: activeSession.session_id });
    const onCount = ({ session_id, count }) => {
      if (session_id != null && session_id !== activeSession.session_id) return;
      if (typeof count === "number") setViewerCount(count);
    };
    const onEnded = ({ session_id }) => {
      if (session_id != null && session_id !== activeSession.session_id) return;
      setActiveSession(null);
      setViewerCount(0);
    };
    s.on("viewer-count-updated", onCount);
    s.on("stream-ended", onEnded);
    s.on("connect", join);
    if (s.connected) join();
    return () => {
      s.emit("leave-stream", { session_id: activeSession.session_id });
      s.off("viewer-count-updated", onCount);
      s.off("stream-ended", onEnded);
      s.off("connect", join);
    };
  }, [activeSession?.session_id]);

  const sessionIsLive = activeSession?.status === "LIVE";
  const sessionStarting = activeSession && !sessionIsLive && activeSession.status !== "FINISHED";

  async function handleSetupProfile() {
    const handle = sanitizeStreamerHandle(setupForm.handle.trim());
    if (!handle || !setupForm.display_name.trim()) {
      setSetupMsg("Handle and display name are required.");
      return;
    }
    if (!STREAMER_HANDLE_RE.test(handle)) {
      setSetupMsg("Handle must be 3–30 characters: letters, numbers, and underscores only.");
      return;
    }
    let categoryId = Number(setupForm.category_id);
    if (!categoryId && setupForm.category_name?.trim()) {
      try {
        const api = await import("../../api/live");
        const resolved = await api.resolveLiveCategory({ category_name: setupForm.category_name.trim() });
        categoryId = resolved?.data?.category_id;
      } catch { /* fall through */ }
    }
    if (!categoryId) {
      setSetupMsg("Please select a category.");
      return;
    }
    setSetupLoading(true);
    setSetupMsg("");
    try {
      const api = await import("../../api/live");
      const r = await api.setupStreamerProfile({
        handle,
        display_name: setupForm.display_name.trim(),
        description: setupForm.description,
        category_id: categoryId,
      });
      setStreamerProfile(r?.data || null);
      setSetupMsg("Profile created!");
    } catch (e) {
      setSetupMsg(e?.response?.data?.message ?? "Failed to set up profile.");
    }
    setSetupLoading(false);
  }

  async function handleGoLive(mode = "obs") {
    setGoLiveMode(mode === "camera" ? "camera" : "obs");
    setSessionLoading(true);
    setSetupMsg("");
    try {
      const api = await import("../../api/live");
      const payload = {
        title: streamTitle || sdCommon("liveStreamDefault"),
      };
      if (streamDescription.trim()) {
        payload.description = streamDescription.trim().slice(0, 1000);
      }
      if (goLiveCategory.categoryId) {
        payload.category_id = Number(goLiveCategory.categoryId);
      } else if (goLiveCategory.categoryName?.trim()) {
        payload.category_name = goLiveCategory.categoryName.trim();
      } else if (streamerProfile?.category_id) {
        payload.category_id = streamerProfile.category_id;
      }
      const r = await api.initLiveSession(payload);
      let session = normalizeLiveSession(r);
      if (goLiveThumbFile && session?.session_id) {
        try {
          const up = await api.uploadSessionThumbnail(session.session_id, goLiveThumbFile);
          if (up?.data) session = normalizeLiveSession(up.data);
        } catch {
          setSetupMsg("Stream started, but thumbnail upload failed.");
        }
      }
      // Do NOT force the session to LIVE here. It only becomes LIVE once OBS actually publishes
      // (the media server calls /rtmp/auth, which flips the status). Flipping it on button-click
      // surfaced the stream on the viewer browse page before any video existed, so viewers opened
      // a "live" stream whose HLS URL 404s and saw an empty player. The streamer's own dashboard
      // still shows the session/key immediately (it keys off the session existing, not its status).
      setActiveSession(session);
      setGoLiveThumbFile(null);
      if (goLiveThumbPreview) {
        URL.revokeObjectURL(goLiveThumbPreview);
        setGoLiveThumbPreview(null);
      }
    } catch (e) {
      setSetupMsg(e?.response?.data?.message ?? "Couldn't start the stream. Try again.");
    }
    setSessionLoading(false);
  }

  async function handleEndStream() {
    if (!activeSession?.session_id) return;
    setSessionLoading(true);
    try {
      const api = await import("../../api/live");
      await api.endLiveSession(activeSession.session_id);
      setActiveSession(null);
      setViewerCount(0);
      setGoLiveMode("obs");
      try {
        const r = await api.getMyVods();
        const items = Array.isArray(r) ? r : (r?.data ?? []);
        setVods(items);
      } catch { /* ignore */ }
    } catch { }
    setSessionLoading(false);
  }

  async function handleUpdateStreamTitle(title) {
    if (!activeSession?.session_id) return;
    const api = await import("../../api/live");
    const r = await api.updateLiveSessionMetadata(activeSession.session_id, { title });
    const updated = r?.data;
    if (updated) {
      setActiveSession((prev) => (prev ? { ...prev, title: updated.title } : prev));
      setStreamTitle(updated.title);
    }
  }

  function onGoLiveThumbPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (goLiveThumbPreview) URL.revokeObjectURL(goLiveThumbPreview);
    setGoLiveThumbFile(file);
    setGoLiveThumbPreview(URL.createObjectURL(file));
  }

  function patchVodInList(updated) {
    if (!updated?.vod_id) return;
    setVods((prev) => prev.map((v) => (v.vod_id === updated.vod_id ? { ...v, ...updated } : v)));
    setPlayingVod((prev) => (prev?.vod_id === updated.vod_id ? { ...prev, ...updated } : prev));
  }

  async function handleSaveVodEdit(vodId) {
    setVodBusyId(vodId);
    setVodActionMsg("");
    try {
      const api = await import("../../api/live");
      const r = await api.updateLiveVod(vodId, {
        title: (vodEditTitle || "").trim() || "Past broadcast",
        description: (vodEditDescription || "").trim().slice(0, 1000) || null,
      });
      patchVodInList(r?.data);
      setVodEditId(null);
      setVodActionMsg("Saved.");
      setTimeout(() => setVodActionMsg(""), 2000);
    } catch (e) {
      setVodActionMsg(e?.response?.data?.message || "Could not save VOD.");
    }
    setVodBusyId(null);
  }

  async function handleToggleVodVisibility(vod) {
    const next = vod.visibility === "PRIVATE" ? "PUBLIC" : "PRIVATE";
    if (
      next === "PRIVATE" &&
      !(await confirmStream({
        title: "Hide broadcast?",
        message: "It will disappear from public browse and your channel. You can unhide it anytime.",
        confirmLabel: "Hide",
      }))
    ) {
      return;
    }
    setVodBusyId(vod.vod_id);
    setVodActionMsg("");
    try {
      const api = await import("../../api/live");
      const r = await api.updateLiveVod(vod.vod_id, { visibility: next });
      patchVodInList(r?.data);
      setVodActionMsg(next === "PRIVATE" ? "Hidden from public." : "Visible on public browse again.");
      setTimeout(() => setVodActionMsg(""), 2500);
    } catch (e) {
      setVodActionMsg(e?.response?.data?.message || "Could not update visibility.");
    }
    setVodBusyId(null);
  }

  async function handleDeleteVod(vod) {
    if (
      !(await confirmStream({
        title: "Delete permanently?",
        message: "This removes the VOD forever. This cannot be undone.",
        confirmLabel: "Delete",
      }))
    ) {
      return;
    }
    setVodBusyId(vod.vod_id);
    try {
      const api = await import("../../api/live");
      await api.deleteLiveVod(vod.vod_id);
      setVods((prev) => prev.filter((v) => v.vod_id !== vod.vod_id));
      if (playingVod?.vod_id === vod.vod_id) setPlayingVod(null);
      setVodActionMsg("Deleted.");
      setTimeout(() => setVodActionMsg(""), 2000);
    } catch (e) {
      setVodActionMsg(e?.response?.data?.message || "Could not delete VOD.");
    }
    setVodBusyId(null);
  }

  async function handleUploadVodThumb(vodId, file) {
    if (!file) return;
    setVodBusyId(vodId);
    setVodActionMsg("");
    try {
      const api = await import("../../api/live");
      const r = await api.uploadVodThumbnail(vodId, file);
      patchVodInList(r?.data);
      setVodActionMsg("Thumbnail updated.");
      setTimeout(() => setVodActionMsg(""), 2000);
    } catch (e) {
      setVodActionMsg(e?.response?.data?.message || "Thumbnail upload failed.");
    }
    setVodBusyId(null);
  }

  async function handleCaptureVodFrame(vod) {
    const video = playingVodVideoRef.current;
    if (!video || playingVod?.vod_id !== vod.vod_id) {
      setVodActionMsg("Open the VOD preview first, then capture a frame.");
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      if (!canvas.width || !canvas.height) {
        setVodActionMsg("Wait for the video to load, then try again.");
        return;
      }
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) {
        setVodActionMsg("Could not capture frame.");
        return;
      }
      const file = new File([blob], `vod-${vod.vod_id}-frame.jpg`, { type: "image/jpeg" });
      await handleUploadVodThumb(vod.vod_id, file);
    } catch (e) {
      setVodActionMsg(e?.message || "Frame capture failed.");
    }
  }

  const channelActive = streamerProfile?.is_active ?? true;

  async function handleToggleActive() {
    const next = !channelActive;
    if (
      !next &&
      !(await confirmStream({
        title: sdCommon("deactivateChannelTitle"),
        message:
          "It will be hidden from discovery and you won't be able to go live until you reactivate. Your VODs and followers are kept.",
        confirmLabel: "Deactivate",
      }))
    )
      return;
    setActiveToggling(true);
    setSetupMsg("");
    try {
      const api = await import("../../api/live");
      const r = await api.setStreamerActive(next);
      setStreamerProfile((prev) => ({
        ...(prev || {}),
        is_active: r?.data?.is_active ?? next,
      }));
      // Deactivating ends any live session server-side — reflect that locally.
      if (!next) {
        setActiveSession(null);
        setViewerCount(0);
      }
    } catch (e) {
      setSetupMsg(
        e?.response?.data?.message ?? "Couldn't update channel status."
      );
    }
    setActiveToggling(false);
  }

  const streamDashHeader = (
    <SellerDashHeader
      title={config?.title || sdCommon("streamDashboard")}
      subtitle={
        streamerProfile?.handle
          ? `@${streamerProfile.handle}`
          : sdCommon("streaming")
      }
      accentColor={color}
      onBack={
        config?.backNav && onNavigate
          ? () => onNavigate(config.backNav)
          : undefined
      }
      backLabel={config?.backLabel}
    >
      {activeSession ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: sessionIsLive ? "#22c55e" : "#fbbf24",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: sessionIsLive ? "#22c55e" : "#fbbf24",
                display: "inline-block",
                animation: "pulseLive 1.5s ease-in-out infinite",
              }}
            />
            {sessionIsLive
              ? sdCommon("liveViewers", { count: viewerCount })
              : "Waiting for OBS…"}
          </span>
          <button
            type="button"
            onClick={handleEndStream}
            disabled={sessionLoading}
            style={{
              padding: "8px 16px",
              background: "#dc2626",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {sessionLoading ? "…" : sdCommon("endStream")}
          </button>
          <button
            type="button"
            onClick={() => setRaidPickerOpen(true)}
            disabled={sessionLoading}
            style={{
              padding: "8px 16px",
              // Was a translucent purple tint over the page background — once that background
              // is themed (light/dark), the wash-out risks low contrast against the white text
              // (same issue StreamerLiveConsole's chat-mode buttons hit). Solid purple keeps
              // contrast safe in both themes.
              background: "#9146FF",
              border: "1px solid #9146FF",
              borderRadius: 10,
              color: "#fff",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Raid
          </button>
        </div>
      ) : streamerProfile ? (
        <button
          onClick={() => setTab("Go Live")}
          style={{
            padding: "8px 16px",
            background: color,
            border: "none",
            borderRadius: 10,
            color: "#fff",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Go Live
        </button>
      ) : null}
    </SellerDashHeader>
  );

  const streamDashStats = streamerProfile ? (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)",
        gap: 12,
        marginBottom: 20,
      }}
    >
      {[
        { label: sdCommon("followers"), value: streamerProfile.follower_count?.toLocaleString() ?? "0" },
        { label: sdCommon("totalViews"), value: streamerProfile.total_views?.toLocaleString() ?? "0" },
        { label: sdCommon("pastBroadcasts"), value: String(vods.length) },
        {
          label: sdCommon("statusLabel"),
          value: sessionIsLive ? "Live" : sessionStarting ? "Starting" : sdCommon("offline"),
        },
      ].map((s) => (
        <div
          key={s.label}
          className="bg-surface border border-border-subtle"
          style={{
            borderRadius: 12,
            padding: "14px 16px",
          }}
        >
          <p className="text-text-secondary" style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {s.label}
          </p>
          <p className="text-text-primary" style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  ) : null;

  if (profileLoading)
    return (
      <StreamerCreatorShell
        accent={color}
        isMobile={isMobile}
        activeTab={tab}
        onTab={setTab}
        onWatchLive={() => onNavigate?.("live")}
        header={streamDashHeader}
      >
        <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, paddingTop: 40, textAlign: "center" }}>
          Loading…
        </p>
      </StreamerCreatorShell>
    );

  if (!streamerProfile)
    return (
      <>
        <StreamerCreatorShell
          accent={color}
          isMobile={isMobile}
          activeTab={tab}
          onTab={setTab}
          onWatchLive={() => onNavigate?.("live")}
          header={streamDashHeader}
        >
          <div style={{ maxWidth: 420, margin: "0 auto", paddingTop: isMobile ? 8 : 24 }}>
            <h2
              className="text-text-primary"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 800,
                fontSize: 28,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              Set Up Your Channel
            </h2>
            <p
              className="text-text-secondary"
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                marginBottom: 24,
                lineHeight: 1.6,
              }}
            >
              Create your streamer profile to go live and build an audience.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["handle", "Channel handle (e.g. coachmarks)", true],
                ["display_name", sdCommon("displayName"), false],
                ["description", "Bio (optional)", false],
              ].map(([k, ph, isHandle]) => (
                <input
                  key={k}
                  placeholder={ph}
                  value={setupForm[k]}
                  onChange={(e) =>
                    setSetupForm((f) => ({
                      ...f,
                      [k]: isHandle ? sanitizeStreamerHandle(e.target.value) : e.target.value,
                    }))
                  }
                  className="bg-surface-raised border border-border text-text-primary"
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              ))}
              <CategoryPicker
                categories={liveCategories}
                value={{
                  categoryId: setupForm.category_id || null,
                  categoryName: liveCategories.find((c) => String(c.category_id) === String(setupForm.category_id))?.category_name ?? '',
                }}
                onChange={({ categoryId, categoryName }) => {
                  setSetupForm((f) => ({
                    ...f,
                    category_id: categoryId ? String(categoryId) : '',
                    category_name: categoryName ?? '',
                  }));
                }}
                placeholder="e.g. Rust, Sea of Thieves…"
              />
              {setupMsg && (
                <p
                  style={{
                    fontSize: 12,
                    color: setupMsg.includes("!") ? "#34d399" : "#f87171",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {setupMsg}
                </p>
              )}
              <button
                onClick={handleSetupProfile}
                disabled={setupLoading}
                style={{
                  padding: "12px",
                  background: color,
                  border: "none",
                  borderRadius: 12,
                  color: "#fff",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  opacity: setupLoading ? 0.7 : 1,
                }}
              >
                {setupLoading ? sdCommon("creatingChannel") : sdCommon("createChannel")}
              </button>
            </div>
          </div>
        </StreamerCreatorShell>
        {streamDialog}
      </>
    );

  return (
    <div
      className="bg-bg"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        paddingBottom: 24,
      }}
    >
      <ProviderTopNav
        tabs={tabs}
        active={tab}
        onTab={setTab}
        title={config?.title || sdCommon("streamDashboard")}
        subtitle={
          streamerProfile.handle ? `@${streamerProfile.handle}` : sdCommon("streaming")
        }
        accentColor={color}
        onBack={
          config?.backNav && onNavigate
            ? () => onNavigate(config.backNav)
            : undefined
        }
        backLabel={config?.backLabel}
      >
        {activeSession ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                color: sessionIsLive ? "#22c55e" : "#fbbf24",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: sessionIsLive ? "#22c55e" : "#fbbf24",
                  display: "inline-block",
                  animation: "pulseLive 1.5s ease-in-out infinite",
                }}
              />
              {sessionIsLive
                ? sdCommon("liveViewers", { count: viewerCount })
                : "Waiting for OBS…"}
            </span>
            <button
              type="button"
              onClick={handleEndStream}
              disabled={sessionLoading}
              style={{
                padding: "8px 16px",
                background: "#dc2626",
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {sessionLoading ? "…" : sdCommon("endStream")}
            </button>
            <button
              type="button"
              onClick={() => setRaidPickerOpen(true)}
              disabled={sessionLoading}
              style={{
                padding: "8px 16px",
                // Was a translucent purple tint over the page background — once that background
                // is themed (light/dark), the wash-out risks low contrast against the white text
                // (same issue StreamerLiveConsole's chat-mode buttons hit). Solid purple keeps
                // contrast safe in both themes.
                background: "#9146FF",
                border: "1px solid #9146FF",
                borderRadius: 10,
                color: "#fff",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Raid
            </button>
          </div>
        ) : (
          <button
            onClick={() => setTab("Go Live")}
            style={{
              padding: "8px 16px",
              background: color,
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {" "}
            Go Live
          </button>
        )}
      </ProviderTopNav>
      <SellerStatCards
        accentColor={color}
        stats={[
          {
            label: sdCommon("followers"),
            value: streamerProfile.follower_count?.toLocaleString() ?? "0",
            change: null,
          },
          {
            label: sdCommon("totalViews"),
            value: streamerProfile.total_views?.toLocaleString() ?? "0",
            change: null,
          },
          {
            label: sdCommon("pastBroadcasts"),
            value: String(vods.length),
            change: null,
          },
          {
            label: sdCommon("statusLabel"),
            value: sessionIsLive ? " Live" : sessionStarting ? " Starting" : sdCommon("offline"),
            change: null,
          },
        ]}
      />
      <div
        style={{
          padding: `${isMobile ? "24px 16px 0 16px" : "24px 40px 0 108px"}`,
        }}
      >
        {tab === "Overview" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 280px",
              gap: 20,
            }}
          >
            <div>
              <p
                className="text-text-secondary"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 14,
                }}
              >
                {sdCommon("channelInfo")}
              </p>
              <div
                className="bg-surface-raised border border-border"
                style={{
                  borderRadius: 16,
                  boxShadow: "0 12px 34px var(--color-shadow)",
                  padding: "20px 22px",
                  marginBottom: 16,
                }}
              >
                <p
                  className="text-text-primary"
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontWeight: 800,
                    fontSize: 22,
                    marginBottom: 4,
                  }}
                >
                  {streamerProfile.display_name ?? streamerProfile.handle}
                </p>
                <p
                  className="text-text-secondary"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                    marginBottom: 12,
                  }}
                >
                  @{streamerProfile.handle}
                </p>
                {streamerProfile.description && (
                  <p
                    className="text-text-secondary"
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {streamerProfile.description}
                  </p>
                )}
              </div>
              <p
                className="text-text-secondary"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 14,
                }}
              >
                {sdCommon("recentVods")}
              </p>
              {vods.slice(0, 4).map((v) => (
                <div
                  key={v.vod_id}
                  onClick={() => setPlayingVod(v)}
                  {...clickableProps(() => setPlayingVod(v))}
                  className="bg-surface border border-border-subtle"
                  style={{
                    cursor: "pointer",
                    borderRadius: 12,
                    padding: "14px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    marginBottom: 8,
                  }}
                >
                  <div
                    style={{
                      width: 60,
                      height: 40,
                      borderRadius: 8,
                      // Video-thumbnail placeholder (poster art) — stays a fixed dark/blue
                      // gradient like a video-content tile, not a themed surface.
                      background: "linear-gradient(135deg,#0f172a,#2563eb)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      className="text-text-primary"
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {v.title || sdCommon("pastBroadcast")}
                    </p>
                    <p
                      className="text-text-muted"
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      {new Date(v.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
              {vods.length === 0 && (
                <p
                  className="text-text-muted"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 13,
                  }}
                >
                  {sdCommon("noPastBroadcastsVodEmpty")}
                </p>
              )}
            </div>
            <div>
              <div
                className="bg-surface-raised border border-border"
                style={{
                  borderRadius: 16,
                  boxShadow: "0 12px 34px var(--color-shadow)",
                  padding: "18px 20px",
                  marginBottom: 16,
                }}
              >
                <p
                  className="text-text-secondary"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: "'DM Sans', sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 12,
                  }}
                >
                  RTMP Key
                </p>
                <div
                  className="bg-bg text-text-secondary"
                  style={{
                    // Recessed inset relative to the surrounding raised card, same role as
                    // StreamerLiveConsole's OBS credentials <code> box.
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontFamily: "monospace",
                    fontSize: 11,
                    wordBreak: "break-all",
                    marginBottom: 10,
                  }}
                >
                  {activeSession?.stream_key ??
                    "Start a stream to generate key"}
                </div>
                <p
                  className="text-text-muted"
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 11,
                  }}
                >
                  Use with OBS → Settings → Stream. Server:{" "}
                  {activeSession?.server_url ?? "Start a stream to get your ingest URL"}
                </p>
              </div>
            </div>
          </div>
        )}
        {tab === "Go Live" && !activeSession && (
          <div style={{ maxWidth: 560 }}>
                <p
                  className="text-text-secondary"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "'DM Sans', sans-serif",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 14,
                  }}
                >
                  Stream Settings
                </p>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    marginBottom: 20,
                  }}
                >
                  {liveCategories.length > 0 && (
                    <CategoryPicker
                      categories={liveCategories}
                      value={goLiveCategory}
                      onChange={setGoLiveCategory}
                      placeholder="Category (search or type new)"
                    />
                  )}
                  <input
                    value={streamTitle}
                    onChange={(e) => setStreamTitle(e.target.value)}
                    placeholder={sdCommon("streamTitle")}
                    className="bg-surface-raised border border-border text-text-primary"
                    style={{
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                  <textarea
                    value={streamDescription}
                    onChange={(e) => setStreamDescription(e.target.value.slice(0, 1000))}
                    placeholder="Description (shown under the title for viewers)"
                    rows={3}
                    className="bg-surface-raised border border-border text-text-primary"
                    style={{
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 13,
                      outline: "none",
                      resize: "vertical",
                      minHeight: 72,
                    }}
                  />
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div
                      className="border border-border"
                      style={{
                        width: 120,
                        height: 68,
                        borderRadius: 8,
                        background: goLiveThumbPreview
                          ? `url(${goLiveThumbPreview}) center/cover`
                          : // Video-thumbnail placeholder (poster art) — stays a fixed dark/blue
                            // gradient like a video-content tile, not a themed surface.
                            "linear-gradient(135deg,#0f172a,#2563eb)",
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <input
                        ref={goLiveThumbInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={onGoLiveThumbPick}
                      />
                      <button
                        type="button"
                        onClick={() => goLiveThumbInputRef.current?.click()}
                        className="bg-surface-raised border border-border text-text-primary"
                        style={{
                          borderRadius: 10,
                          padding: "8px 14px",
                          // Background is now a token that goes near-white in light theme, so
                          // fixed white text would lose contrast.
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {goLiveThumbFile ? "Change thumbnail" : "Upload thumbnail (optional)"}
                      </button>
                    </div>
                  </div>
                </div>
                <div
                  className="bg-surface-raised border border-border"
                  style={{
                    borderRadius: 16,
                    boxShadow: "0 12px 34px var(--color-shadow)",
                    padding: "18px 20px",
                    marginBottom: 20,
                  }}
                >
                  <p
                    className="text-text-secondary"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: "'DM Sans', sans-serif",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 8,
                    }}
                  >
                    OBS Setup
                  </p>
                  <p
                    className="text-text-secondary"
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 12,
                      lineHeight: 1.7,
                    }}
                  >
                  After one-tap camera go-live, or after you click Go live with OBS, copy the Server
                  (e.g. rtmp://127.0.0.1:1935) and Stream Key into OBS if you would rather publish from a studio.
                </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => handleGoLive("camera")}
                  disabled={sessionLoading}
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: color,
                    border: "none",
                    borderRadius: 12,
                    color: "#fff",
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: "pointer",
                    opacity: sessionLoading ? 0.7 : 1,
                  }}
                >
                  {sessionLoading && goLiveMode === "camera" ? sdCommon("startingStream") : sdCommon("goLiveFromCamera", { defaultValue: "Go live from camera" })}
                </button>
                <button
                  type="button"
                  onClick={() => handleGoLive("obs")}
                  disabled={sessionLoading}
                  className="bg-surface-raised border border-border text-text-primary"
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: 12,
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                    opacity: sessionLoading ? 0.7 : 1,
                  }}
                >
                  {sessionLoading && goLiveMode === "obs" ? sdCommon("startingStream") : sdCommon("goLiveWithObs", { defaultValue: "Go live with OBS" })}
                </button>
                </div>
          </div>
        )}
        {activeSession ? (
          <div style={{ display: tab === "Go Live" ? "block" : "none", maxWidth: 1100 }}>
            <StreamerLiveConsole
              activeSession={activeSession}
              sessionIsLive={sessionIsLive}
              sessionStarting={sessionStarting}
              viewerCount={viewerCount}
              liveCategories={liveCategories}
              goLiveCategory={goLiveCategory}
              setGoLiveCategory={setGoLiveCategory}
              streamTitle={streamTitle}
              setStreamTitle={setStreamTitle}
              streamDescription={streamDescription}
              setStreamDescription={setStreamDescription}
              sessionLoading={sessionLoading}
              onEndStream={handleEndStream}
              onRaid={() => setRaidPickerOpen(true)}
              copyToClipboard={copyToClipboard}
              copiedField={copiedField}
              sdCommon={sdCommon}
              goLiveMode={goLiveMode}
              onSessionUpdated={(updated) => {
                setActiveSession((prev) => (prev ? { ...prev, ...updated } : prev));
                if (updated?.title) setStreamTitle(updated.title);
                if (updated?.description != null) setStreamDescription(updated.description || "");
              }}
            />
          </div>
        ) : null}
        {playingVod && (
          // Fullscreen VOD playback modal: a dark scrim over a <video> player, matching a video
          // player's own chrome rather than the page theme (like Hub.jsx's dark-scrimmed hero
          // photo and StreamerLiveConsole's live preview panel) — intentionally NOT using theme
          // tokens anywhere in this overlay.
          <div onClick={() => setPlayingVod(null)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.93)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <button onClick={() => setPlayingVod(null)} aria-label="Close" style={{ position: "absolute", top: 18, right: 18, width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "min(960px, 100%)" }}>
              <video
                ref={playingVodVideoRef}
                controls
                autoPlay
                playsInline
                controlsList="nodownload"
                src={playingVod.video_url}
                style={{ width: "100%", maxHeight: "70vh", borderRadius: 12, background: "#000" }}
              />
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, color: "#fff", marginTop: 12 }}>{playingVod.title || sdCommon("pastBroadcast")}</p>
              {playingVod.description ? (
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6, whiteSpace: "pre-wrap" }}>{playingVod.description}</p>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  disabled={vodBusyId === playingVod.vod_id}
                  onClick={() => handleCaptureVodFrame(playingVod)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Use current frame as thumb
                </button>
                <button
                  type="button"
                  disabled={vodBusyId === playingVod.vod_id}
                  onClick={() => {
                    vodThumbInputRef.current?.setAttribute("data-vod-id", String(playingVod.vod_id));
                    vodThumbInputRef.current?.click();
                  }}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.08)", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Upload thumbnail
                </button>
              </div>
            </div>
          </div>
        )}
        {tab === "VODs" && (
          <div>
            <input
              ref={vodThumbInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                const vodId = Number(e.target.getAttribute("data-vod-id"));
                e.target.value = "";
                if (file && vodId) handleUploadVodThumb(vodId, file);
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <p
                className="text-text-secondary"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: 0,
                }}
              >
                {sdCommon("pastBroadcastsCount", { count: vods.length })}
              </p>
              {vodActionMsg ? (
                <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: vodActionMsg.toLowerCase().includes("fail") || vodActionMsg.toLowerCase().includes("could") ? "#f87171" : "#4ade80" }}>
                  {vodActionMsg}
                </p>
              ) : null}
            </div>
            {vods.length === 0 && (
              <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
                {sdCommon("noPastBroadcastsVodEmptyShort")}
              </p>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px,1fr))",
                gap: 14,
              }}
            >
              {vods.map((v, i) => {
                const hidden = v.visibility === "PRIVATE";
                const editing = vodEditId === v.vod_id;
                const busy = vodBusyId === v.vod_id;
                return (
                  <div
                    key={v.vod_id}
                    className="bg-surface-raised border border-border"
                    style={{
                      borderRadius: 16,
                      boxShadow: "0 12px 34px var(--color-shadow)",
                      overflow: "hidden",
                      animation: `fadeUp 0.3s ease ${i * 50}ms both`,
                    }}
                  >
                    {/* Video-thumbnail tile: real thumbnail image, or a fixed dark/blue poster
                        placeholder with a play icon and a Hidden/Public badge on top — this reads
                        as video content chrome, so it intentionally stays dark in both themes. */}
                    <div
                      onClick={() => setPlayingVod(v)}
                      {...clickableProps(() => setPlayingVod(v))}
                      style={{
                        height: 120,
                        cursor: "pointer",
                        background: v.thumbnail_url
                          ? `url(${v.thumbnail_url}) center/cover`
                          : "linear-gradient(135deg,#0f172a,#2563eb)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative",
                      }}
                    >
                      {!v.thumbnail_url && (
                        <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      )}
                      <span
                        style={{
                          position: "absolute",
                          top: 8,
                          left: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          fontFamily: "'DM Sans', sans-serif",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          background: hidden ? "rgba(0,0,0,0.7)" : "rgba(34,197,94,0.85)",
                          color: "#fff",
                          borderRadius: 6,
                          padding: "3px 8px",
                        }}
                      >
                        {hidden ? "Hidden" : "Public"}
                      </span>
                    </div>
                    <div style={{ padding: "12px 14px" }}>
                      {editing ? (
                        <>
                          <input
                            value={vodEditTitle}
                            onChange={(e) => setVodEditTitle(e.target.value)}
                            className="bg-surface-raised border border-border text-text-primary"
                            style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, borderRadius: 8, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}
                          />
                          <textarea
                            value={vodEditDescription}
                            onChange={(e) => setVodEditDescription(e.target.value.slice(0, 1000))}
                            rows={3}
                            placeholder="Description"
                            className="bg-surface-raised border border-border text-text-primary"
                            style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, borderRadius: 8, padding: "8px 10px", fontFamily: "'DM Sans', sans-serif", fontSize: 12, resize: "vertical" }}
                          />
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="button" disabled={busy} onClick={() => handleSaveVodEdit(v.vod_id)} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: color, color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Save</button>
                            <button type="button" disabled={busy} onClick={() => setVodEditId(null)} className="border border-border text-text-secondary" style={{ padding: "7px 12px", borderRadius: 8, background: "transparent", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {v.title || sdCommon("pastBroadcast")}
                          </p>
                          <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 10 }}>
                            {new Date(v.created_at).toLocaleDateString()}
                            {hidden ? " · Archived" : ""}
                          </p>
                          {/* Play/Edit/Thumb/Hide backgrounds are now theme tokens that go
                              near-white in light theme, so fixed white button text would lose
                              contrast — text-primary instead (Delete stays hardcoded red-on-red,
                              a status color, unaffected by theme). */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            <button type="button" onClick={() => setPlayingVod(v)} className="border border-border bg-surface-raised text-text-primary" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Play</button>
                            <button type="button" disabled={busy} onClick={() => { setVodEditId(v.vod_id); setVodEditTitle(v.title || ""); setVodEditDescription(v.description || ""); }} className="border border-border bg-surface-raised text-text-primary" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Edit</button>
                            <button type="button" disabled={busy} onClick={() => { vodThumbInputRef.current?.setAttribute("data-vod-id", String(v.vod_id)); vodThumbInputRef.current?.click(); }} className="border border-border bg-surface-raised text-text-primary" style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Thumb</button>
                            <button type="button" disabled={busy} onClick={() => handleToggleVodVisibility(v)} className="border border-border text-text-primary" style={{ padding: "6px 10px", borderRadius: 8, background: hidden ? "rgba(34,197,94,0.2)" : "var(--color-surface-raised)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{hidden ? "Unhide" : "Hide"}</button>
                            <button type="button" disabled={busy} onClick={() => handleDeleteVod(v)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(220,38,38,0.45)", background: "rgba(220,38,38,0.15)", color: "#fca5a5", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
{tab === "Earnings" && (
          <>
            <div style={{ background: "rgba(145,70,255,0.08)", border: "1px solid rgba(145,70,255,0.35)", borderRadius: 14, padding: 20, marginBottom: 20, maxWidth: 720 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: subscribers.subscribers.length ? 14 : 0 }}>
                <h3 className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase" }}>{i18n.t("sd.live.subscribers", { defaultValue: "Subscribers" })}</h3>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 30, color: "#9146FF" }}>{subscribers.count}</span>
              </div>
              {subscribers.subscribers.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {subscribers.subscribers.slice(0, 20).map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                      <span className="text-text-primary">{s.subscriber?.name || `User ${s.subscriber?.user_id}`}{s.cancel_at_period_end ? <span className="text-text-secondary" style={{ marginLeft: 8, fontSize: 11 }}>· {i18n.t("live.subEnding", { defaultValue: "Ending soon" })}</span> : null}</span>
                      <span className="text-text-secondary" style={{ fontSize: 12 }}>{s.current_period_end ? i18n.t("sd.live.renewsOn", { defaultValue: "renews {{date}}", date: new Date(s.current_period_end).toLocaleDateString() }) : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <StreamPayoutPanel />
            <SellerEarningsTab color={color} />
          </>
        )}
        {/* #147/#364: streamer analytics are LIVE-scoped only (broadcasts + subscription
            earnings). The video Creator Studio analytics used to render here too for
            streamers who also upload, but that made uploaded creator videos "leak" into
            the streamer dashboard (#364) — the two surfaces are kept separate, so video
            analytics live on the Creator dashboard (/provider/creator) only. */}
        {tab === "Analytics" && (
          <>
            <p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 12px" }}>Live streaming</p>
            <SellerAnalyticsPanel
              accentColor={color}
              isMobile={isMobile}
              fetchOverview={getStreamerLiveAnalytics}
              countLabel="Live streams"
              netLabel="Creator earnings"
              topTitle="Top supporters"
              breakdownTitle="Subscribers by status"
              emptyHint="Your broadcasts and subscription earnings will appear here as you go live."
            />
          </>
        )}
        {tab === "Moderation" && (
          <>
            <p className="text-text-secondary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 12px" }}>Chat moderation</p>
            <StreamModerationPanel color={color} isMobile={isMobile} />
          </>
        )}
        {tab === "Community" && (
          <StreamCommunityPanel color={color} isMobile={isMobile} />
        )}
        {tab === "Edit Profile" && (
          <>
            <SellerEditProfileTab
              config={{
                profileFields: [
                  [i18n.t("shared.fieldDisplayName"), streamerProfile.display_name ?? ""],
                  [i18n.t("shared.fieldBio"), streamerProfile.description ?? ""],
                  [sdCommon("streamLanguage"), sdCommon("streamLanguagePlaceholder")],
                ],
              }}
              vertical="live"
              onSave={async (vals) => {
                const api = await import("../../api/live");
                await api.setupStreamerProfile({
                  handle: streamerProfile.handle,
                  display_name:
                    vals[i18n.t("shared.fieldDisplayName")] || streamerProfile.display_name,
                  description: vals[i18n.t("shared.fieldBio")] || undefined,
                  category_id: 1,
                });
              }}
            />
            <div
              className="bg-surface"
              style={{
                maxWidth: 560,
                marginTop: 24,
                border: `1px solid ${channelActive ? "var(--color-border-subtle)" : "#dc262644"}`,
                borderRadius: 14,
                padding: "20px 22px",
              }}
            >
              <p
                className="text-text-primary"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  marginBottom: 6,
                }}
              >
                {channelActive ? sdCommon("channelActive") : sdCommon("channelDeactivated")}
              </p>
              <p
                className="text-text-secondary"
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  lineHeight: 1.6,
                  marginBottom: 16,
                }}
              >
                {channelActive
                  ? sdCommon("channelDeactivateDesc")
                  : sdCommon("channelHiddenDesc")}
              </p>
              <button
                onClick={handleToggleActive}
                disabled={activeToggling}
                style={{
                  padding: "11px 18px",
                  background: channelActive ? "transparent" : color,
                  border: channelActive
                    ? "1px solid #dc262688"
                    : "none",
                  borderRadius: 10,
                  color: channelActive ? "#f87171" : "#fff",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: activeToggling ? "default" : "pointer",
                  opacity: activeToggling ? 0.6 : 1,
                }}
              >
                {activeToggling
                  ? sdCommon("saving")
                  : channelActive
                    ? "Deactivate Channel"
                    : "Reactivate Channel"}
              </button>
            </div>
          </>
        )}
      </div>
      <StreamRaidPicker
        sessionId={activeSession?.session_id}
        open={raidPickerOpen}
        onClose={() => setRaidPickerOpen(false)}
        onRaided={() => {
          setActiveSession(null);
          setViewerCount(0);
          setRaidPickerOpen(false);
        }}
        accent={color}
      />
      {streamDialog}
    </div>
  );
}
