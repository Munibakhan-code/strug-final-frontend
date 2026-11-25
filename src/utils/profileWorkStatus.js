/**
 * Merge work_status into a social profile row.
 * When profile is still null (GET /me not back yet) but PATCH succeeded,
 * seed from the server response so the badge appears without a reload.
 */
export function mergeWorkStatusProfile(profile, workStatus, serverRow) {
  const nextStatus = serverRow && Object.prototype.hasOwnProperty.call(serverRow, 'work_status')
    ? serverRow.work_status
    : workStatus;
  if (serverRow && typeof serverRow === 'object') {
    return { ...(profile || {}), ...serverRow, work_status: nextStatus };
  }
  return { ...(profile || {}), work_status: nextStatus };
}

/** Restore prior profile (or null) after a failed work_status PATCH. */
export function rollbackWorkStatusProfile(prevProfile) {
  return prevProfile ?? null;
}
