import { describe, it, expect, beforeEach, vi } from "vitest";
import {
	hasSocialVault,
	isSocialVaultUnlocked,
	lockSocialVault,
	setupSocialVault,
	unlockSocialVault,
	listSocialVaultItems,
} from "./socialVault.js";

vi.mock("../store/auth.js", () => ({
	getAuthUserId: vi.fn(() => 42),
}));

describe("socialVault", () => {
	beforeEach(() => {
		localStorage.clear();
		lockSocialVault(42);
	});

	it("hasSocialVault is false before setup", () => {
		expect(hasSocialVault(42)).toBe(false);
	});

	it("isSocialVaultUnlocked is false when no signed-in user", () => {
		expect(isSocialVaultUnlocked(null)).toBe(false);
		expect(isSocialVaultUnlocked(undefined)).toBe(false);
	});

	it("setupSocialVault rejects short passwords", async () => {
		await expect(setupSocialVault("abc", [], 42)).rejects.toThrow(/4 characters/i);
	});

	it("setupSocialVault creates an encrypted vault and unlocks session", async () => {
		await setupSocialVault("secret1234", [{ id: 1, vertical: "social", title: "Note" }], 42);
		expect(hasSocialVault(42)).toBe(true);
		expect(isSocialVaultUnlocked(42)).toBe(true);
		const items = await listSocialVaultItems(42);
		expect(items).toHaveLength(1);
		expect(items[0].title).toBe("Note");
	});

	it("unlockSocialVault rejects wrong password", async () => {
		await setupSocialVault("secret1234", [], 42);
		lockSocialVault(42);
		await expect(unlockSocialVault("wrong-pass", 42)).rejects.toThrow(/Incorrect password/i);
		expect(isSocialVaultUnlocked(42)).toBe(false);
	});

	it("listSocialVaultItems returns null when locked", async () => {
		await setupSocialVault("secret1234", [{ id: 2, vertical: "feed", title: "Locked" }], 42);
		lockSocialVault(42);
		expect(await listSocialVaultItems(42)).toBe(null);
	});

	it("unlockSocialVault opens an existing vault", async () => {
		await setupSocialVault("secret1234", [{ id: 3, vertical: "social", title: "Open me" }], 42);
		lockSocialVault(42);
		await unlockSocialVault("secret1234", 42);
		const items = await listSocialVaultItems(42);
		expect(items?.[0]?.id).toBe(3);
	});
});
