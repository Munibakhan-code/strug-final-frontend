import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoryViewer } from "../pages/Feed.jsx";
import { ModalShell } from "./reportKit.jsx";
import ImageCropModal from "./ImageCropModal.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import i18n from "../i18n/index.js";
import { SkeletonCircle } from "./skeletons.jsx";
import {
  getProfileHighlights,
  getHighlight,
  getStoryArchive,
  createHighlight,
  updateHighlight,
  deleteHighlight,
  reorderHighlights,
  addStoriesToHighlight,
  removeStoryFromHighlight,
} from "../api/social.js";

// ── #467 Profile Story Highlights ────────────────────────────────────────────
// Instagram-style permanent, curated collections of Stories shown as circular
// bubbles below the profile info. A Highlight is NOT a new content type — it is a
// saved selection of the owner's existing social_story rows (see backend
// routes/social-story-routes.js). Tapping a bubble replays that collection in the
// EXISTING StoryViewer exported from pages/Feed.jsx.

const RING = "linear-gradient(135deg, #2563eb, #60a5fa 55%, #ec4899)";
const FONT = "'DM Sans', sans-serif";

// ── inline icons (no emoji; house convention is inline SVG) ──────────────────
const IcoPlus = (p) => (<svg width={p.s || 22} height={p.s || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
const IcoPencil = (p) => (<svg width={p.s || 13} height={p.s || 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>);
const IcoTrash = (p) => (<svg width={p.s || 15} height={p.s || 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);
const IcoCheck = (p) => (<svg width={p.s || 14} height={p.s || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>);
const IcoChevL = (p) => (<svg width={p.s || 15} height={p.s || 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>);
const IcoChevR = (p) => (<svg width={p.s || 15} height={p.s || 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>);
const IcoPlay = (p) => (<svg width={p.s || 18} height={p.s || 18} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>);

function isVideoMedia(story) {
  return story?.media_type === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(story?.media_url || "");
}

// A small circular media preview used both for bubbles and for cover previews.
function CoverThumb({ url, isVideo, size = 64, alt }) {
  if (!url) {
    return <div className="bg-surface-raised" style={{ width: size, height: size, borderRadius: "50%" }} aria-hidden />;
  }
  return isVideo
    ? <video src={url} muted playsInline preload="metadata" className="bg-surface-raised" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
    : <img src={url} alt={alt || ""} className="bg-surface-raised" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />;
}

export default function StoryHighlights({ profileId, isOwner, ownerPic, isMobile }) {
  const [highlights, setHighlights] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [viewer, setViewer] = useState(null);      // { group, initial }
  const [editor, setEditor] = useState(null);      // { mode: 'create'|'edit', highlight? }

  const load = useCallback(() => {
    if (!profileId) return;
    getProfileHighlights(profileId)
      .then((d) => setHighlights((d?.data ?? d ?? []).filter(Boolean)))
      .catch(() => setHighlights([]))
      .finally(() => setLoaded(true));
  }, [profileId]);

  useEffect(() => { setLoaded(false); setHighlights([]); load(); }, [load]);

  const openViewer = useCallback(async (h) => {
    try {
      const d = await getHighlight(h.highlight_id);
      const data = d?.data ?? d;
      const stories = data?.stories || [];
      if (!stories.length) return;
      setViewer({
        group: { name: data.title, profilePicUrl: data.cover_url || ownerPic, profile_pic_url: data.cover_url || ownerPic, stories },
        initial: stories[0],
      });
    } catch { /* noop */ }
  }, [ownerPic]);

  // Nothing to show and can't add → render nothing (keeps other profiles clean).
  if (loaded && !highlights.length && !isOwner) return null;
  if (!profileId) return null;

  const bubble = 64;

  return (
    <div style={{ margin: "4px 0 22px" }} data-testid="story-highlights">
      <div style={{ display: "flex", gap: 18, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 4 }}>
        {isOwner && (
          <button
            onClick={() => setEditor({ mode: "create" })}
            data-testid="highlight-new"
            title={i18n.t("highlights.new", { defaultValue: "New highlight" })}
            style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span className="text-text-secondary" style={{ width: bubble, height: bubble, borderRadius: "50%", border: "2px dashed var(--color-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <IcoPlus s={22} />
            </span>
            <span className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12, maxWidth: 72, textAlign: "center" }}>{i18n.t("highlights.new", { defaultValue: "New" })}</span>
          </button>
        )}

        {!loaded && Array.from({ length: 4 }).map((_, i) => <SkeletonCircle key={`hskel-${i}`} />)}

        {highlights.map((h) => (
          <div key={h.highlight_id} style={{ flexShrink: 0, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
            <button
              onClick={() => openViewer(h)}
              data-testid="highlight-bubble"
              data-highlight-id={h.highlight_id}
              title={h.title}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, borderRadius: "50%" }}
            >
              <span style={{ display: "block", width: bubble + 6, height: bubble + 6, borderRadius: "50%", background: RING, padding: 3 }}>
                <span style={{ display: "block", width: bubble, height: bubble, borderRadius: "50%", border: "2px solid var(--color-bg)", overflow: "hidden" }}>
                  <CoverThumb url={h.cover_url} isVideo={h.cover_is_video} size={bubble} alt={h.title} />
                </span>
              </span>
            </button>
            <span className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12, maxWidth: 72, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>{h.title}</span>
            {isOwner && (
              <button
                onClick={() => setEditor({ mode: "edit", highlight: h })}
                data-testid="highlight-edit"
                data-highlight-id={h.highlight_id}
                aria-label={i18n.t("highlights.edit", { defaultValue: "Edit highlight" })}
                title={i18n.t("highlights.edit", { defaultValue: "Edit highlight" })}
                style={{ position: "absolute", top: 42, right: 2, width: 24, height: 24, borderRadius: "50%", background: "#2563eb", border: "2px solid var(--color-bg)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
              >
                <IcoPencil s={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      {viewer && (
        <StoryViewer
          initialStory={viewer.initial}
          storyGroups={[viewer.group]}
          onClose={() => setViewer(null)}
        />
      )}

      {editor && (
        <HighlightEditor
          mode={editor.mode}
          highlight={editor.highlight}
          allHighlights={highlights}
          isMobile={isMobile}
          onClose={() => setEditor(null)}
          onChanged={() => { load(); }}
        />
      )}
    </div>
  );
}

// ── Create / Edit editor ─────────────────────────────────────────────────────
function HighlightEditor({ mode, highlight, allHighlights, isMobile, onClose, onChanged }) {
  const isEdit = mode === "edit";
  const [title, setTitle] = useState(highlight?.title || "");
  const [archive, setArchive] = useState([]);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  // story_ids that should be members after save (Set of numbers)
  const [selected, setSelected] = useState(() => new Set());
  const [initialIds, setInitialIds] = useState(() => new Set());
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(highlight?.cover_url || null);
  const [cropSrc, setCropSrc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef(null);

  // Load the owner's story archive (active + expired) for the picker.
  useEffect(() => {
    getStoryArchive()
      .then((d) => setArchive((d?.data ?? d ?? []).filter(Boolean)))
      .catch(() => setArchive([]))
      .finally(() => setArchiveLoaded(true));
  }, []);

  // For edit mode, pre-select the stories already in this highlight.
  useEffect(() => {
    if (!isEdit) return;
    getHighlight(highlight.highlight_id)
      .then((d) => {
        const ids = (d?.data ?? d)?.stories?.map((s) => s.story_id) || [];
        setSelected(new Set(ids));
        setInitialIds(new Set(ids));
      })
      .catch(() => {});
  }, [isEdit, highlight?.highlight_id]);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const onPickCover = (e) => {
    const f = e.target.files?.[0];
    if (f) setCropSrc(URL.createObjectURL(f));
    e.target.value = "";
  };

  const save = async () => {
    setError("");
    const t = title.trim();
    if (!t) { setError(i18n.t("highlights.errTitle", { defaultValue: "Give your highlight a name." })); return; }
    if (!isEdit && selected.size === 0) { setError(i18n.t("highlights.errPick", { defaultValue: "Select at least one story." })); return; }
    setSaving(true);
    try {
      if (!isEdit) {
        const fd = new FormData();
        fd.append("title", t);
        fd.append("story_ids", JSON.stringify([...selected]));
        if (coverFile) fd.append("cover", coverFile);
        await createHighlight(fd);
      } else {
        const id = highlight.highlight_id;
        // title / cover
        if (t !== highlight.title || coverFile) {
          const fd = new FormData();
          fd.append("title", t);
          if (coverFile) fd.append("cover", coverFile);
          await updateHighlight(id, fd);
        }
        const added = [...selected].filter((x) => !initialIds.has(x));
        const removed = [...initialIds].filter((x) => !selected.has(x));
        if (added.length) await addStoriesToHighlight(id, added);
        for (const sid of removed) await removeStoryFromHighlight(id, sid);
      }
      onChanged();
      onClose();
    } catch {
      setError(i18n.t("highlights.errSave", { defaultValue: "Something went wrong. Try again." }));
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setSaving(true);
    try { await deleteHighlight(highlight.highlight_id); onChanged(); onClose(); }
    catch { setError(i18n.t("highlights.errSave", { defaultValue: "Something went wrong. Try again." })); setSaving(false); setConfirmDelete(false); }
  };

  // Reorder: move this highlight one slot earlier/later among siblings and persist.
  const orderIds = useMemo(() => allHighlights.map((h) => h.highlight_id), [allHighlights]);
  const myPos = isEdit ? orderIds.indexOf(highlight.highlight_id) : -1;
  const move = async (dir) => {
    const arr = [...orderIds];
    const i = arr.indexOf(highlight.highlight_id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    try { await reorderHighlights(arr); onChanged(); onClose(); } catch { /* noop */ }
  };

  const selectedCount = selected.size;

  return (
    <>
      <ModalShell
        isMobile={isMobile}
        onClose={onClose}
        title={isEdit ? i18n.t("highlights.editTitle", { defaultValue: "Edit highlight" }) : i18n.t("highlights.createTitle", { defaultValue: "New highlight" })}
        labelledBy="Story highlight editor"
      >
        <div style={{ padding: isMobile ? "4px 16px 20px" : "8px 22px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Cover + name */}
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button
              onClick={() => fileRef.current?.click()}
              data-testid="highlight-cover-btn"
              title={i18n.t("highlights.cover", { defaultValue: "Choose cover" })}
              style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 0, borderRadius: "50%" }}
            >
              <span style={{ display: "block", width: 72, height: 72, borderRadius: "50%", background: RING, padding: 3 }}>
                <span style={{ display: "block", width: 66, height: 66, borderRadius: "50%", border: "2px solid var(--color-bg)", overflow: "hidden" }}>
                  <CoverThumb url={coverPreview} isVideo={false} size={66} />
                </span>
              </span>
              <span style={{ position: "absolute", bottom: 0, right: 0, width: 24, height: 24, borderRadius: "50%", background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-bg)" }}><IcoPencil s={11} /></span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickCover} style={{ display: "none" }} data-testid="highlight-cover-input" />
            <div style={{ flex: 1 }}>
              <label className="text-text-secondary" style={{ display: "block", fontFamily: FONT, fontSize: 12, marginBottom: 6 }}>{i18n.t("highlights.name", { defaultValue: "Name" })}</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 50))}
                maxLength={50}
                placeholder={i18n.t("highlights.namePh", { defaultValue: "Products, Reviews, FAQs…" })}
                data-testid="highlight-title-input"
                className="bg-surface-raised border border-border text-text-primary"
                style={{ width: "100%", boxSizing: "border-box", borderRadius: 10, padding: "10px 12px", fontFamily: FONT, fontSize: 14, outline: "none" }}
              />
              <div className="text-text-muted" style={{ fontFamily: FONT, fontSize: 11, marginTop: 4, textAlign: "right" }}>{title.length}/50</div>
            </div>
          </div>

          {/* Reorder (edit only) */}
          {isEdit && allHighlights.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12 }}>{i18n.t("highlights.position", { defaultValue: "Position" })} {myPos + 1}/{allHighlights.length}</span>
              <button onClick={() => move(-1)} disabled={myPos <= 0} data-testid="highlight-move-left" style={arrowBtn(myPos <= 0)} title={i18n.t("highlights.moveLeft", { defaultValue: "Move earlier" })}><IcoChevL /></button>
              <button onClick={() => move(1)} disabled={myPos >= allHighlights.length - 1} data-testid="highlight-move-right" style={arrowBtn(myPos >= allHighlights.length - 1)} title={i18n.t("highlights.moveRight", { defaultValue: "Move later" })}><IcoChevR /></button>
            </div>
          )}

          {/* Story picker */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="text-text-secondary" style={{ fontFamily: FONT, fontSize: 12 }}>{i18n.t("highlights.pickStories", { defaultValue: "Stories" })}</span>
              <span style={{ fontFamily: FONT, fontSize: 12, color: "#60a5fa" }}>{selectedCount} {i18n.t("highlights.selected", { defaultValue: "selected" })}</span>
            </div>
            {!archiveLoaded ? (
              <div className="text-text-muted" style={{ fontFamily: FONT, fontSize: 13, padding: "24px 0", textAlign: "center" }}>{i18n.t("common.loading", { defaultValue: "Loading…" })}</div>
            ) : archive.length === 0 ? (
              <div className="text-text-muted" style={{ fontFamily: FONT, fontSize: 13, padding: "24px 0", textAlign: "center" }}>{i18n.t("highlights.noStories", { defaultValue: "You have no stories yet. Post a story first, then add it to a highlight." })}</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 8, maxHeight: 300, overflowY: "auto" }} data-testid="highlight-story-grid">
                {archive.map((s) => {
                  const on = selected.has(s.story_id);
                  const vid = isVideoMedia(s);
                  return (
                    <button
                      key={s.story_id}
                      onClick={() => toggle(s.story_id)}
                      data-testid="archive-story"
                      data-story-id={s.story_id}
                      aria-pressed={on}
                      className="bg-surface-raised"
                      style={{ position: "relative", aspectRatio: "9/16", borderRadius: 10, overflow: "hidden", border: on ? "2px solid #2563eb" : "2px solid transparent", padding: 0, cursor: "pointer" }}
                    >
                      {vid
                        ? <video src={s.media_url} muted playsInline preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <img src={s.media_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      {vid && <span style={{ position: "absolute", top: 6, left: 6, color: "#fff", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }}><IcoPlay s={14} /></span>}
                      {!s.is_active && <span style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.85)", fontFamily: FONT, fontSize: 9, padding: "2px 5px", borderRadius: 5 }}>{i18n.t("highlights.archived", { defaultValue: "Archived" })}</span>}
                      <span style={{ position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: "50%", background: on ? "#2563eb" : "rgba(0,0,0,0.45)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: on ? "none" : "1.5px solid rgba(255,255,255,0.7)" }}>
                        {on && <IcoCheck s={12} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && <div style={{ fontFamily: FONT, fontSize: 13, color: "#f87171" }}>{error}</div>}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {isEdit && (
              <button onClick={() => setConfirmDelete(true)} data-testid="highlight-delete" title={i18n.t("common.delete", { defaultValue: "Delete" })} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", borderRadius: 10, padding: "10px 14px", fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer" }}><IcoTrash s={15} />{!isMobile && i18n.t("common.delete", { defaultValue: "Delete" })}</button>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={onClose} className="border border-border text-text-secondary" style={{ background: "none", borderRadius: 10, padding: "10px 16px", fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{i18n.t("common.cancel", { defaultValue: "Cancel" })}</button>
            <button onClick={save} disabled={saving} data-testid="highlight-save" style={{ background: saving ? "rgba(37,99,235,0.5)" : "#2563eb", border: "none", color: "#fff", borderRadius: 10, padding: "10px 20px", fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer" }}>{saving ? i18n.t("common.saving", { defaultValue: "Saving…" }) : (isEdit ? i18n.t("common.save", { defaultValue: "Save" }) : i18n.t("common.create", { defaultValue: "Create" }))}</button>
          </div>
        </div>
      </ModalShell>

      {cropSrc && (
        <ImageCropModal
          src={cropSrc}
          aspect={1}
          title={i18n.t("highlights.cropTitle", { defaultValue: "Crop cover" })}
          outWidth={320}
          onCancel={() => { setCropSrc(null); }}
          onConfirm={(file) => { setCoverFile(file); setCoverPreview(URL.createObjectURL(file)); setCropSrc(null); }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={i18n.t("highlights.deleteTitle", { defaultValue: "Delete highlight?" })}
        message={i18n.t("highlights.deleteMsg", { defaultValue: "The highlight is removed. Your stories stay in your archive." })}
        confirmLabel={i18n.t("common.delete", { defaultValue: "Delete" })}
        busy={saving}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function arrowBtn(disabled) {
  return {
    width: 32, height: 32, borderRadius: 8,
    background: disabled ? "var(--color-surface)" : "var(--color-surface-raised)",
    border: "1px solid var(--color-border)",
    color: disabled ? "var(--color-text-muted)" : "var(--color-text-primary)",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: disabled ? "default" : "pointer", padding: 0,
  };
}
