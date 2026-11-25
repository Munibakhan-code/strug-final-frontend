import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

// Capture the fake Leaflet marker that react-leaflet's Marker would expose via ref,
// so we can assert SmoothMarker drives setLatLng + heading rotation correctly.
const h = vi.hoisted(() => ({ marker: null }));

vi.mock("react-leaflet", async () => {
	const React = await import("react");
	return {
		Marker: React.forwardRef(function Marker(_props, ref) {
			React.useLayoutEffect(() => {
				if (!h.marker) {
					const icon = document.createElement("div");
					const root = document.createElement("div"); // the rotatable inner element
					icon.appendChild(root);
					h.marker = {
						calls: [],
						setLatLng(ll) { this.calls.push([ll[0], ll[1]]); },
						_icon: icon,
					};
				}
				if (typeof ref === "function") ref(h.marker);
				else if (ref) ref.current = h.marker;
			});
			return null;
		}),
	};
});

import SmoothMarker from "./SmoothMarker.jsx";

describe("SmoothMarker", () => {
	let t;
	beforeEach(() => {
		h.marker = null;
		t = 0;
		// Run each rAF synchronously, jumping past the glide duration so the eased
		// value lands exactly on the target in one step.
		vi.stubGlobal("performance", { now: () => t });
		vi.stubGlobal("requestAnimationFrame", (cb) => { t += 5000; cb(t); return 1; });
		vi.stubGlobal("cancelAnimationFrame", () => {});
	});
	afterEach(() => vi.unstubAllGlobals());

	it("glides to the new position when it changes", () => {
		const { rerender } = render(<SmoothMarker position={[43.0, -79.0]} icon={{}} />);
		expect(h.marker).toBeTruthy();
		rerender(<SmoothMarker position={[43.0, -78.9]} icon={{}} />);
		const last = h.marker.calls.at(-1);
		expect(last[0]).toBeCloseTo(43.0, 5);
		expect(last[1]).toBeCloseTo(-78.9, 5); // reached the eastward target
	});

	it("rotates the icon toward the heading when rotate is set", () => {
		const { rerender } = render(<SmoothMarker position={[43.0, -79.0]} icon={{}} rotate />);
		rerender(<SmoothMarker position={[43.0, -78.9]} icon={{}} rotate />); // due east
		const transform = h.marker._icon.firstElementChild.style.transform;
		expect(transform).toBe("rotate(90deg)"); // east = 90° clockwise from north
	});

	it("does not move when the position is unchanged", () => {
		const { rerender } = render(<SmoothMarker position={[43.0, -79.0]} icon={{}} />);
		const before = h.marker.calls.length;
		rerender(<SmoothMarker position={[43.0, -79.0]} icon={{}} />);
		expect(h.marker.calls.length).toBe(before);
	});
});
