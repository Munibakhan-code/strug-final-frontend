/**
 * Password-protected local vault for Social / Town Hall saved refs.
 * Encrypted at rest (AES-GCM + PBKDF2). Unlock lasts for the browser tab session.
 */
import { getAuthUserId } from "../store/auth.js";

const PBKDF2_ITERATIONS = 120_000;
const META_PREFIX = "strug_social_vault_meta_";

/** @type {Map<string, CryptoKey>} */
const unlockedKeys = new Map();

function resolveVaultUserId(userId) {
	const id = userId ?? getAuthUserId();
	if (id == null || id === "") return null;
	return String(id);
}

function vaultUserId(userId) {
	const resolved = resolveVaultUserId(userId);
	if (!resolved) throw new Error("Vault requires a signed-in user");
	return resolved;
}

function metaKey(userId) {
	const resolved = resolveVaultUserId(userId);
	if (!resolved) return null;
	return `${META_PREFIX}${resolved}`;
}

function hasWebCrypto() {
	return typeof crypto !== "undefined" && crypto.subtle && crypto.getRandomValues;
}

function toBase64(bytes) {
	let binary = "";
	bytes.forEach((b) => { binary += String.fromCharCode(b); });
	return btoa(binary);
}

function fromBase64(str) {
	const binary = atob(str);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
	return out;
}

async function deriveKey(password, salt) {
	const enc = new TextEncoder();
	const baseKey = await crypto.subtle.importKey(
		"raw",
		enc.encode(password),
		"PBKDF2",
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{ name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
		baseKey,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

async function encryptItems(key, items) {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const enc = new TextEncoder();
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		enc.encode(JSON.stringify(items)),
	);
	return { iv: toBase64(iv), data: toBase64(new Uint8Array(ciphertext)) };
}

async function decryptItems(key, ivB64, dataB64) {
	const iv = fromBase64(ivB64);
	const data = fromBase64(dataB64);
	const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
	const parsed = JSON.parse(new TextDecoder().decode(plain));
	return Array.isArray(parsed) ? parsed : [];
}

function readMeta(userId) {
	const key = metaKey(userId);
	if (!key || typeof localStorage === "undefined") return null;
	try {
		const raw = localStorage.getItem(key);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function writeMeta(userId, meta) {
	const key = metaKey(userId);
	if (!key || typeof localStorage === "undefined") return;
	localStorage.setItem(key, JSON.stringify(meta));
}

/** @param {string|number|null|undefined} [userId] */
export function hasSocialVault(userId) {
	const meta = readMeta(userId);
	return Boolean(meta?.iv && meta?.data);
}

/** @param {string|number|null|undefined} [userId] */
export function isSocialVaultUnlocked(userId) {
	const resolved = resolveVaultUserId(userId);
	if (!resolved) return false;
	return unlockedKeys.has(resolved);
}

/** @param {string|number|null|undefined} [userId] */
export function lockSocialVault(userId) {
	const resolved = resolveVaultUserId(userId);
	if (!resolved) return;
	unlockedKeys.delete(resolved);
}

/**
 * @param {string} password
 * @param {unknown[]} [seedItems]
 * @param {string|number} [userId]
 */
export async function setupSocialVault(password, seedItems = [], userId) {
	if (!hasWebCrypto()) throw new Error("Vault encryption is unavailable in this browser");
	if (!password || password.length < 4) throw new Error("Password must be at least 4 characters");
	const uid = vaultUserId(userId);
	if (hasSocialVault(uid)) throw new Error("Vault already exists");
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const key = await deriveKey(password, salt);
	const encrypted = await encryptItems(key, seedItems);
	writeMeta(uid, { salt: toBase64(salt), ...encrypted });
	unlockedKeys.set(uid, key);
	return seedItems;
}

/**
 * @param {string} password
 * @param {string|number} [userId]
 */
export async function unlockSocialVault(password, userId) {
	if (!hasWebCrypto()) throw new Error("Vault encryption is unavailable in this browser");
	const uid = vaultUserId(userId);
	const meta = readMeta(uid);
	if (!meta?.salt || !meta?.iv || !meta?.data) throw new Error("Vault not set up");
	const salt = fromBase64(meta.salt);
	const key = await deriveKey(password, salt);
	try {
		await decryptItems(key, meta.iv, meta.data);
	} catch {
		throw new Error("Incorrect password");
	}
	unlockedKeys.set(uid, key);
	return true;
}

async function getUnlockedKey(userId) {
	const uid = vaultUserId(userId);
	return unlockedKeys.get(uid) ?? null;
}

async function readVaultItems(userId) {
	const uid = vaultUserId(userId);
	const meta = readMeta(uid);
	if (!meta?.iv || !meta?.data) return [];
	const key = await getUnlockedKey(uid);
	if (!key) return null;
	return decryptItems(key, meta.iv, meta.data);
}

async function writeVaultItems(userId, items) {
	const uid = vaultUserId(userId);
	const meta = readMeta(uid);
	const key = await getUnlockedKey(uid);
	if (!key || !meta?.salt) throw new Error("Vault is locked");
	const encrypted = await encryptItems(key, items);
	writeMeta(uid, { salt: meta.salt, ...encrypted });
}

/**
 * @param {string|number} [userId]
 * @returns {Promise<object[]|null>} null when locked
 */
export async function listSocialVaultItems(userId) {
	if (!hasSocialVault(userId)) return [];
	return readVaultItems(userId);
}

/**
 * @param {object} item
 * @param {string|number} [userId]
 */
export async function addSocialVaultItem(item, userId) {
	const uid = vaultUserId(userId);
	const existing = (await readVaultItems(uid)) ?? [];
	const id = item?.id ?? item?.postId;
	if (id == null) throw new Error("Vault item requires an id");
	const next = existing.filter((row) => String(row.id) !== String(id));
	next.unshift({
		id,
		vertical: item.vertical,
		title: item.title ?? "",
		sub: item.sub ?? "",
		savedAt: item.savedAt ?? new Date().toISOString(),
	});
	await writeVaultItems(uid, next.slice(0, 200));
	return next;
}

/** @param {string|number} itemId @param {string|number} [userId] */
export async function removeSocialVaultItem(itemId, userId) {
	const uid = vaultUserId(userId);
	const existing = (await readVaultItems(uid)) ?? [];
	const next = existing.filter((row) => String(row.id) !== String(itemId));
	await writeVaultItems(uid, next);
	return next;
}

/** Restore cached key after reload when session flag is set (requires password re-entry). */
export function clearSocialVaultSession(userId) {
	lockSocialVault(userId);
}
