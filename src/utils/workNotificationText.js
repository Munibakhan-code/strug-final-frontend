const JOB_FALLBACK_KEYS = {
  offer: "generic",
  no_match: "hirer",
  cancelled: "generic",
  tip: "worker",
  accepted: "hirer",
  earning: "worker",
  worker_en_route: "hirer",
  in_progress: "hirer",
  completed: "hirer",
  update: "hirer",
};

function parseParams(body) {
  if (!body || typeof body !== "string") return null;
  try {
    const p = JSON.parse(body);
    return p?.v === 1 ? p : null;
  } catch {
    return null;
  }
}

function resolveJobTitle(t, params, type) {
  const raw = params?.jobTitle?.trim?.() || params?.jobTitle;
  if (raw) return raw;
  const fk = JOB_FALLBACK_KEYS[type] || "generic";
  return t(`ondemand.notifications.jobFallback.${fk}`);
}

/** Render persisted work notifications in the user's locale (params JSON or legacy English). */
export function formatWorkNotification(n, t) {
  const params = parseParams(n.body);
  if (!params) {
    return { title: n.title, body: n.body || null };
  }

  const type = n.type || "update";
  const jobTitle = resolveJobTitle(t, params, type);
  const p = { ...params, jobTitle };
  let prefix = `ondemand.notifications.types.${type}`;
  let title = t(`${prefix}.title`, { defaultValue: "" });
  if (!title) {
    prefix = "ondemand.notifications.types.update";
    title = t(`${prefix}.title`, { defaultValue: n.title });
  }
  let bodyKey = `${prefix}.body`;
  if (type === "cancelled" && params.compensated) bodyKey = `${prefix}.bodyCompensated`;
  const body = t(bodyKey, { ...p, defaultValue: n.body || "" });
  return { title, body: body || null };
}
