import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getUser } from "../store/auth";
import { connectSocket } from "../api/socket";
import { getWorkNotifications, markWorkNotificationsRead } from "../api/ondemandwork.js";
import { formatWorkNotification } from "../utils/workNotificationText.js";

// On-Demand Work notification bell — persisted history + live socket updates.
export default function WorkNotificationBell({ accent = "#6366f1" }) {
  const { t, i18n } = useTranslation();
  const me = getUser();
  const uid = me?.user_id ?? me?.id ?? me?.profile_id;
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const timeAgo = useMemo(() => (d) => {
    if (!d) return "";
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return t("ondemand.notifications.timeJustNow");
    if (s < 3600) return t("ondemand.notifications.timeMinutes", { count: Math.floor(s / 60) });
    if (s < 86400) return t("ondemand.notifications.timeHours", { count: Math.floor(s / 3600) });
    return new Date(d).toLocaleDateString(i18n.language);
  }, [t, i18n.language]);

  const load = useCallback(async () => {
    try { const d = await getWorkNotifications(); setItems(d?.items || []); setUnread(d?.unread || 0); } catch { /* noop */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!uid) return;
    const s = connectSocket();
    const onNotif = (n) => { setItems((prev) => [n, ...prev].slice(0, 30)); setUnread((u) => u + 1); };
    s.on(`work-notification-${uid}`, onNotif);
    return () => { s.off(`work-notification-${uid}`, onNotif); };
  }, [uid]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) { setUnread(0); markWorkNotificationsRead().catch(() => {}); }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={toggle} aria-label={t("ondemand.notifications.ariaLabel")} className="bg-surface-raised border border-border text-text-secondary" style={{ position: "relative", borderRadius: 12, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
        {unread > 0 && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8, background: "#ef4444", color: "#fff", fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="bg-surface border border-border" style={{ position: "absolute", right: 0, top: 48, width: 320, maxHeight: 420, overflowY: "auto", borderRadius: 14, boxShadow: "0 12px 40px var(--color-shadow)", zIndex: 3000, textAlign: "left" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-subtle)" }}>
            <p className="text-text-primary" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 800, fontSize: 15, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{t("ondemand.notifications.title")}</p>
          </div>
          {items.length === 0 ? (
            <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, padding: "22px 16px", textAlign: "center", margin: 0 }}>{t("ondemand.notifications.empty")}</p>
          ) : items.map((n) => {
            const { title, body } = formatWorkNotification(n, t);
            return (
            <div key={n.work_notification_id} style={{ padding: "11px 16px", borderBottom: "1px solid var(--color-border-subtle)", background: n.is_read ? "transparent" : `${accent}12` }}>
              <p className="text-text-primary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, margin: 0 }}>{title}</p>
              {body && <p className="text-text-secondary" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, margin: "2px 0 0", lineHeight: 1.45 }}>{body}</p>}
              <p className="text-text-muted" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, margin: "4px 0 0" }}>{timeAgo(n.created_at)}</p>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
