// Shared Stripe card-payment piece for the booking engine.
// Every booking-engine vertical (Temp Stay, Hotel, Vehicle, Equipment, Venues,
// Lessons, Events, Experiences, Celebrity, Book-an-artist, Reservations) charges
// the card the same way: create the booking (server-authoritative price), then
// create a PaymentIntent for that booking and confirm it with the entered card.
// This module centralises that flow so each page only renders <CardPaymentField/>
// and calls payBooking(bookingId) after createBooking().
import { useStripe, useElements, CardNumberElement, CardExpiryElement, CardCvcElement } from "@stripe/react-stripe-js";
import { createBookingIntent } from "../api/booking";
import { useTheme } from "../utils/theme";

// Stripe's iframe can't resolve var(--color-*), so pick its text color per theme directly.
function cardElementStyle(isLight) {
	return {
		base: {
			color: isLight ? "#0a0a0e" : "#fff",
			fontFamily: "'DM Sans', sans-serif",
			fontSize: "14px",
			"::placeholder": { color: isLight ? "rgba(10,10,14,0.35)" : "rgba(255,255,255,0.3)" },
		},
		invalid: { color: "#f87171" },
	};
}

// Separate Stripe elements so number/expiry/CVC each get their own labelled box.
export function CardInput({ style }) {
	const [theme] = useTheme();
	const isLight = theme === "light";
	const boxStyle = {
		background: isLight ? "rgba(10,10,14,0.03)" : "rgba(255,255,255,0.05)",
		border: isLight ? "1px solid rgba(10,10,14,0.14)" : "1px solid rgba(255,255,255,0.12)",
		borderRadius: 10,
		padding: "12px 14px",
	};
	const labelStyle = { fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, marginBottom: 6 };
	const elementOptions = { style: cardElementStyle(isLight) };
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 10, ...style }}>
			<div>
				<p style={labelStyle} className="text-text-secondary">Card number</p>
				<div style={boxStyle}><CardNumberElement options={elementOptions} /></div>
			</div>
			<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
				<div>
					<p style={labelStyle} className="text-text-secondary">Expiry date</p>
					<div style={boxStyle}><CardExpiryElement options={elementOptions} /></div>
				</div>
				<div>
					<p style={labelStyle} className="text-text-secondary">CVC</p>
					<div style={boxStyle}><CardCvcElement options={elementOptions} /></div>
				</div>
			</div>
		</div>
	);
}

// Styled card-entry box matching the Temp Stay checkout. Drop it into a
// vertical's checkout where the "Payment method" section should appear.
export function CardPaymentField({ label = "Payment method" }) {
	return (
		<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, padding: 20, marginBottom: 24 }}>
			<p className="text-text-secondary" style={{ fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>{label}</p>
			<CardInput />
		</div>
	);
}

// Hook returning payBooking(bookingId): creates the PaymentIntent for the booking
// and confirms it with the card in <CardPaymentField/>. The charged amount is
// always server-authoritative (derived from the booking, never the client).
// Returns:
//   { ok: true }                                 — paid (or nothing to charge)
//   { ok: false, error, releaseBooking?: true }  — card/setup failed; caller may
//                                                  cancel the unpaid hold so the
//                                                  date is not stranded
export function useBookingPayment() {
	const stripe = useStripe();
	const elements = useElements();

	return async function payBooking(bookingId) {
		if (!bookingId) {
			return { ok: false, error: "Booking reference is missing.", releaseBooking: true };
		}
		try {
			const { clientSecret } = await createBookingIntent(bookingId);
			// No client secret => nothing to charge (e.g. $0 / pay-on-arrival).
			if (!clientSecret) return { ok: true };
			// A positive-value booking must never look paid when Stripe Elements
			// failed to initialise or the publishable key is absent.
			if (!stripe || !elements) {
				return {
					ok: false,
					error: "Secure payment is unavailable. Please try again shortly.",
					releaseBooking: true,
				};
			}
			const card = elements.getElement(CardNumberElement);
			if (!card) {
				return {
					ok: false,
					error: "Card details are not ready. Please re-enter your card.",
					releaseBooking: true,
				};
			}
			const result = await stripe.confirmCardPayment(clientSecret, {
				payment_method: { card },
			});
			if (result.error) {
				return { ok: false, error: result.error.message, releaseBooking: true };
			}
			return { ok: true, paymentIntent: result.paymentIntent };
		} catch (e) {
			return {
				ok: false,
				error: e?.response?.data?.message || "Payment failed. Please try again.",
				// Concrete HTTP response => no ambiguous in-flight card confirm.
				releaseBooking: Boolean(e?.response),
			};
		}
	};
}
