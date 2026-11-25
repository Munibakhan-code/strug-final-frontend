import { JobsIcon } from "./icons.jsx";
import { getContextOriginDisplay, normalizeContextTypeForOrigin } from "../utils/chatContextOrigin.js";
import { coerceContextTypeKey, isReactComponentType } from "../utils/messagesRenderHelpers.js";

const ICON_BY_KEY = {
	jobs: JobsIcon,
	job_application: JobsIcon,
};

/**
 * Small chip showing which vertical/order a chat came from (#182 + header parity).
 */
export function ChatContextOriginBadge({
	contextType,
	contextId,
	t,
	style,
	className,
}) {
	const raw = coerceContextTypeKey(contextType);
	if (!raw || raw === "dm") return null;
	const display = getContextOriginDisplay(contextType, t);
	if (!display) return null;
	const norm = normalizeContextTypeForOrigin(raw);
	const Icon = ICON_BY_KEY[norm] ?? ICON_BY_KEY[raw];
	const Glyph = Icon && isReactComponentType(Icon) ? Icon : null;

	return (
		<span
			className={className}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				alignSelf: "flex-start",
				background: "rgba(37,99,235,0.14)",
				border: "1px solid rgba(37,99,235,0.3)",
				color: "#93c5fd",
				fontFamily: "'DM Sans', sans-serif",
				fontSize: 10,
				fontWeight: 700,
				padding: "1px 7px",
				borderRadius: 20,
				maxWidth: "100%",
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				...style,
			}}
		>
			{Glyph ? <Glyph s={11} /> : display.glyph}
			{t("messages.messageFromVertical", {
				defaultValue: "From {{vertical}}",
				vertical: display.label,
			})}
			{contextId ? ` · #${contextId}` : ""}
		</span>
	);
}
