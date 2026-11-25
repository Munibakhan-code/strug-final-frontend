// Upload used to persist the raw filename when the title field was left blank, so cards
// showed "Song Name.mp4". Strip a trailing video extension for display and for the
// filename fallback on new uploads. Only the suffix is removed, so a title like
// "How .mp4 encoding works" is left alone.

const VIDEO_FILE_EXT = /\.(mp4|m4v|mov|webm|mkv|avi)$/i;

export function stripVideoFileExtension(name) {
	if (typeof name !== 'string') return '';
	const trimmed = name.trim();
	if (!trimmed) return '';
	const stripped = trimmed.replace(VIDEO_FILE_EXT, '').trim();
	return stripped;
}

export function displayVideoTitle(raw, fallback = '') {
	return stripVideoFileExtension(raw) || fallback;
}
