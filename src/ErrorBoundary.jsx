import { Component } from "react";
import { captureError } from "./utils/observability.js";

const isDev = import.meta.env.DEV;

export default class ErrorBoundary extends Component {
	constructor(props) {
		super(props);
		this.state = { hasError: false, error: null, componentStack: null };
	}

	static getDerivedStateFromError(error) {
		return { hasError: true, error };
	}

	componentDidCatch(error, info) {
		console.error("App error:", error, info.componentStack);
		// This is the only place a render crash surfaces. Until it reported, a ReferenceError on
		// a routed page (Raise.jsx, DigitalProducts.jsx) just rendered the fallback below and
		// left no trace anywhere. No-op unless VITE_SENTRY_DSN is configured.
		captureError(error, {
			componentStack: info?.componentStack,
			boundary: this.props.compact ? "compact" : "root",
		});
		this.setState({ componentStack: info.componentStack });
	}

	componentDidUpdate(prevProps) {
		if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
			this.setState({ hasError: false, error: null, componentStack: null });
		}
	}

	render() {
		if (this.state.hasError) {
			const compact = !!this.props.compact;
			return (
				<div style={{
					display: "flex", flexDirection: "column", alignItems: "center",
					justifyContent: "center",
					height: compact ? "100%" : "100vh",
					minHeight: compact ? 240 : undefined,
					background: compact ? "transparent" : "#0a0a0e",
					color: "#fff", fontFamily: "'DM Sans', sans-serif", gap: 16, padding: 24,
					textAlign: "center", overflowY: "auto",
				}}>
					<h1 style={{
						fontFamily: "'Barlow Condensed', sans-serif", fontSize: compact ? 28 : 42,
						fontWeight: 800, letterSpacing: "0.03em", textTransform: "uppercase",
					}}>
						Something Went Wrong
					</h1>
					<p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, maxWidth: 480 }}>
						{isDev
							? (this.state.error?.message || "An unexpected error occurred.")
							: "An unexpected error occurred. Please try again or switch pages."}
					</p>
					{isDev && this.state.error?.stack && (
						<pre style={{
							background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
							borderRadius: 8, padding: "12px 16px", fontSize: 11, color: "rgba(255,255,255,0.6)",
							maxWidth: "90vw", overflowX: "auto", textAlign: "left", whiteSpace: "pre-wrap",
							wordBreak: "break-all",
						}}>
							{this.state.error.stack}
						</pre>
					)}
					<button
						onClick={() => {
							if (compact) {
								this.setState({ hasError: false, error: null, componentStack: null });
							} else {
								window.location.reload();
							}
						}}
						style={{
							marginTop: 8, padding: "10px 24px", background: "#2563eb",
							border: "none", borderRadius: 8, color: "#fff",
							fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
							fontSize: 14, cursor: "pointer",
						}}
					>
						{compact ? "Try Again" : "Reload App"}
					</button>
				</div>
			);
		}
		return this.props.children;
	}
}
