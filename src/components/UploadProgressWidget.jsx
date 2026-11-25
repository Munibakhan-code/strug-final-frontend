import React, { useEffect, useRef, useState } from "react";
import { subscribeUploads, dismissUpload, retryUpload } from "../utils/uploadManager.js";
import i18n from "../i18n/index.js";
import { useViewport } from "../hooks/useViewport.js";
import "./UploadProgressWidget.css";

function stateFor(job) {
  const states = {
    error: { accent: "#f87171", label: job.error || i18n.t("videos.uploadFailed", { defaultValue: "Upload failed" }) },
    processing: { accent: "#34d399", label: i18n.t("videos.uploadedProcessing", { defaultValue: "Uploaded — processing in the background" }) },
    finalizing: { accent: "#60a5fa", label: i18n.t("videos.finalizingVideo", { defaultValue: "Finalizing video…" }) },
    waiting: { accent: "#fbbf24", label: job.error || i18n.t("videos.uploadWaiting", { defaultValue: "Connection paused — retrying…" }) },
  };
  return states[job.status] || { accent: "#60a5fa", label: i18n.t("videos.uploadingProgress", { progress: job.progress }) };
}

function StatusIcon({ status }) {
  if (status === "error") return <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>;
  if (status === "processing") return <svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5" /></svg>;
  if (status === "waiting") return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  return <svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
}

function UploadJob({ job }) {
  const { accent, label } = stateFor(job);
  const showProgress = job.status === "uploading" || job.status === "finalizing";
  return <article className="upload-progress__job" style={{ "--upload-accent": accent }}>
    <div className="upload-progress__job-row">
      <span className="upload-progress__icon" aria-hidden="true"><StatusIcon status={job.status} /></span>
      <div className="upload-progress__copy"><strong title={job.name}>{job.name}</strong><span>{label}</span></div>
      {job.status === "error" && <button type="button" className="upload-progress__retry" onClick={() => retryUpload(job.id)}>{i18n.t("common.retry")}</button>}
      {(job.status === "processing" || job.status === "error") && <button type="button" className="upload-progress__dismiss" onClick={() => dismissUpload(job.id)} aria-label={i18n.t("common.dismiss", { defaultValue: "Dismiss" })}>×</button>}
    </div>
    {showProgress && <div className="upload-progress__track"><span style={{ width: `${Math.max(0, Math.min(100, job.progress || 0))}%` }} /></div>}
  </article>;
}

// Global and always mounted: uploads continue while the creator closes the modal or navigates.
export default function UploadProgressWidget() {
  const [jobs, setJobs] = useState([]);
  const lastMobileNotice = useRef("");
  const { isMobile } = useViewport();
  useEffect(() => subscribeUploads(setJobs), []);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    const onMessage = (event) => {
      if (event.data?.type !== 'retry-video-upload') return;
      if (!Array.isArray(event.data.ids)) return;
      for (const id of event.data.ids) retryUpload(id);
    };
    navigator.serviceWorker.addEventListener?.('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener?.('message', onMessage);
  }, []);
  useEffect(() => {
    if (!isMobile || typeof window === "undefined" || typeof navigator === "undefined"
        || !("Notification" in window) || !("serviceWorker" in navigator)
        || Notification.permission !== "granted") return;
    let cancelled = false;
    const tag = "strug-video-upload-progress";
    async function syncNotification() {
      const registration = await navigator.serviceWorker.ready;
      if (cancelled) return;
      if (!jobs.length) {
        const notices = await registration.getNotifications?.({ tag });
        notices?.forEach(notice => notice.close());
        lastMobileNotice.current = "";
        return;
      }
      const progress = Math.round(jobs.reduce((sum, job) => sum
        + (job.status === "processing" ? 100 : Math.max(0, Math.min(100, job.progress || 0))), 0) / jobs.length);
      const bucket = Math.floor(progress / 5) * 5;
      const hasError = jobs.some(job => job.status === "error");
      const allProcessing = jobs.every(job => job.status === "processing");
      const statuses = jobs.map(job => job.status).sort().join(",");
      const signature = `${jobs.map(job => job.id).join(',')}:${bucket}:${statuses}`;
      if (signature === lastMobileNotice.current) return;
      const title = hasError
        ? i18n.t("videos.uploadNeedsAttention", { defaultValue: "Video upload needs attention" })
        : allProcessing ? i18n.t("videos.uploadComplete", { defaultValue: "Upload complete" })
          : i18n.t("videos.uploadInProgress", { defaultValue: "Uploading video" });
      const body = jobs.length === 1 ? `${jobs[0].name} · ${stateFor(jobs[0]).label}`
        : i18n.t("videos.uploadCountProgress", { defaultValue: "{{count}} videos · {{progress}}%", count: jobs.length, progress });
      await registration.showNotification(title, {
        body, tag, renotify: false, silent: true, icon: "/favicon.ico", badge: "/favicon.ico",
        actions: hasError ? [{ action: 'retry', title: i18n.t('common.retry') }] : [],
        data: { url: "/videos", kind: "video-upload-progress", retryIds: jobs.filter(job => job.status === 'error').map(job => job.id) },
      });
      if (!cancelled) lastMobileNotice.current = signature;
    }
    syncNotification().catch(() => {});
    return () => { cancelled = true; };
  }, [isMobile, jobs]);
  if (!jobs.length || isMobile) return null;

  return <section className="upload-progress upload-progress--desktop" role="status" aria-live="polite">
    {jobs.map(job => <UploadJob key={job.id} job={job} />)}
  </section>;
}
