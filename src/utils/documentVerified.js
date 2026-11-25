/**
 * Identity / document verification flags from the user profile payload.
 * @param {object|null|undefined} user
 * @returns {boolean}
 */
export function isDocumentVerified(user) {
  if (!user || typeof user !== "object") return false;
  return user.document_verified === true || user.document_verification_status === "verified";
}
