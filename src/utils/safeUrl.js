/**
 * Allow only http(s) URLs from user/model-supplied strings.
 * Blocks javascript:, data:, and other non-web protocols.
 */
export function isSafeHttpUrl(u) {
	if (!u || typeof u !== "string") return false;
	try {
		const parsed = new URL(u.trim(), "https://example.invalid");
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}
