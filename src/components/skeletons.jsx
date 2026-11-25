import React from "react";

// ─── React Bits — animated UI primitives ────────────────────────────────────

const GradientText = React.memo(function GradientText({ children, colors = ["#60a5fa", "#a78bfa", "#2563eb", "#60a5fa"], speed = 6, style }) {
	return (
		<span style={{
			background: `linear-gradient(90deg, ${colors.join(", ")})`,
			backgroundSize: "300% 100%",
			WebkitBackgroundClip: "text",
			WebkitTextFillColor: "transparent",
			backgroundClip: "text",
			animation: `gradientShift ${speed}s ease infinite`,
			display: "inline",
			...style,
		}}>
			{children}
		</span>
	);
});
const ShinyText = React.memo(function ShinyText({ children, style, speed = 3.5 }) {
	return (
		<span style={{ position: "relative", display: "inline-block", overflow: "hidden", ...style }}>
			{children}
			<span style={{
				position: "absolute", top: 0, width: "45%", height: "100%",
				background: "linear-gradient(120deg, transparent, var(--color-shimmer-a), transparent)",
				animation: `shimmerSweep ${speed}s ease-in-out infinite`,
				pointerEvents: "none",
			}} />
		</span>
	);
});

const SpotlightCard = React.memo(function SpotlightCard({ children, style, color = "rgba(37,99,235,0.13)", size = 320, ...props }) {
	const ref = React.useRef(null);
	const [spot, setSpot] = React.useState({ x: 0, y: 0, visible: false });
	const handleMove = (e) => {
		const r = ref.current.getBoundingClientRect();
		setSpot({ x: e.clientX - r.left, y: e.clientY - r.top, visible: true });
	};
	return (
		<div ref={ref} onMouseMove={handleMove} onMouseLeave={() => setSpot(s => ({ ...s, visible: false }))}
			style={{ position: "relative", overflow: "hidden", ...style }} {...props}>
			<div style={{
				position: "absolute", borderRadius: "50%", pointerEvents: "none", zIndex: 0,
				width: size, height: size,
				background: `radial-gradient(circle closest-side, ${color}, transparent)`,
				transform: `translate(${spot.x - size / 2}px, ${spot.y - size / 2}px)`,
				opacity: spot.visible ? 1 : 0,
				transition: "opacity 0.3s",
			}} />
			<div style={{ position: "relative", zIndex: 1, height: "100%" }}>{children}</div>
		</div>
	);
});
const TiltCard = React.memo(function TiltCard({ children, style, intensity = 7, ...props }) {
	const ref = React.useRef(null);
	const [tilt, setTilt] = React.useState({ x: 0, y: 0, on: false });
	const handleMove = (e) => {
		const r = ref.current.getBoundingClientRect();
		const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
		const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
		setTilt({ x: -ny * intensity, y: nx * intensity, on: true });
	};
	return (
		<div ref={ref} onMouseMove={handleMove} onMouseLeave={() => setTilt({ x: 0, y: 0, on: false })}
			style={{
				transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
				transition: tilt.on ? "transform 0.08s linear" : "transform 0.5s ease",
				transformStyle: "preserve-3d",
				...style,
			}} {...props}>
			{children}
		</div>
	);
});
const DecryptedText = React.memo(function DecryptedText({ text, speed = 38, style }) {
	const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$";
	const rand = () => CHARS[Math.floor(Math.random() * CHARS.length)];
	const [display, setDisplay] = React.useState(() => text.split("").map(c => c === " " ? " " : rand()));
	const [revCount, setRevCount] = React.useState(0);
	React.useEffect(() => {
		setRevCount(0);
		let r = 0;
		const id = setInterval(() => {
			setDisplay(text.split("").map((c, i) => c === " " ? " " : i < r ? c : rand()));
			r++;
			setRevCount(r);
			if (r > text.length) clearInterval(id);
		}, speed);
		return () => clearInterval(id);
	}, [text, speed]);
	return (
		<span style={style}>
			{display.map((c, i) => (
				<span key={i} style={{ color: i < revCount ? "inherit" : "rgba(37,99,235,0.55)" }}>{c}</span>
			))}
		</span>
	);
});
// ─────────────────────────────────────────────────────────────────────────────

const Skel = React.memo(function Skel({ w = "100%", h = 16, r = 8, style: sx }) {
	return <div className="skel" style={{ width: w, height: h, borderRadius: r, flexShrink: 0, ...sx }} />;
});

/** Twitter-style Town Hall post card (avatar + copy + optional media + action row). */
const SkeletonTownHallPost = React.memo(function SkeletonTownHallPost({ withMedia = false }) {
	return (
		<div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border-subtle)", display: "flex", gap: 12 }}>
			<Skel w={40} h={40} r={20} />
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
					<Skel w={108} h={13} r={6} />
					<Skel w={72} h={11} r={5} />
					<Skel w={36} h={11} r={5} />
				</div>
				<Skel w="94%" h={12} r={5} style={{ marginBottom: 6 }} />
				<Skel w="62%" h={12} r={5} style={{ marginBottom: withMedia ? 12 : 14 }} />
				{withMedia && <Skel w="100%" h={168} r={10} style={{ marginBottom: 14 }} />}
				<div style={{ display: "flex", gap: 28 }}>
					<Skel w={42} h={14} r={7} />
					<Skel w={42} h={14} r={7} />
					<Skel w={42} h={14} r={7} />
					<Skel w={42} h={14} r={7} />
				</div>
			</div>
		</div>
	);
});

const SkeletonTownHallFeed = React.memo(function SkeletonTownHallFeed({ count = 4 }) {
	return (
		<>
			{Array.from({ length: count }, (_, i) => (
				<SkeletonTownHallPost key={i} withMedia={i % 2 === 0} />
			))}
		</>
	);
});

const SkeletonTownHallReply = React.memo(function SkeletonTownHallReply() {
	return (
		<div style={{ padding: "14px 8px", borderBottom: "1px solid var(--color-border-subtle)", display: "flex", gap: 12 }}>
			<Skel w={36} h={36} r={18} />
			<div style={{ flex: 1 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
					<Skel w={96} h={12} r={6} />
					<Skel w={64} h={11} r={5} />
				</div>
				<Skel w="88%" h={12} r={5} style={{ marginBottom: 5 }} />
				<Skel w="52%" h={12} r={5} />
			</div>
		</div>
	);
});

const SkeletonTownHallDetail = React.memo(function SkeletonTownHallDetail() {
	return (
		<div>
			<div style={{ padding: "12px 8px 0", display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
				<Skel w={34} h={34} r={17} />
				<Skel w={80} h={13} r={6} />
			</div>
			<SkeletonTownHallPost withMedia />
			<div style={{ padding: "16px 8px" }}>
				<div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
					<Skel w={36} h={36} r={18} />
					<Skel w="100%" h={44} r={10} />
				</div>
			</div>
			{Array.from({ length: 3 }, (_, i) => <SkeletonTownHallReply key={i} />)}
		</div>
	);
});

const SkeletonTownHallVoice = React.memo(function SkeletonTownHallVoice() {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
			<Skel w={38} h={38} r={19} />
			<div style={{ flex: 1, minWidth: 0 }}>
				<Skel w="70%" h={12} r={6} style={{ marginBottom: 6 }} />
				<Skel w="46%" h={10} r={5} />
			</div>
			<Skel w={64} h={26} r={13} />
		</div>
	);
});

const SkeletonTownHallTopic = React.memo(function SkeletonTownHallTopic() {
	return (
		<div style={{ padding: "10px 16px" }}>
			<Skel w={72} h={10} r={5} style={{ marginBottom: 8 }} />
			<Skel w="58%" h={13} r={6} style={{ marginBottom: 6 }} />
			<Skel w={88} h={10} r={5} />
		</div>
	);
});

const SkeletonTownHallSuggestedCard = React.memo(function SkeletonTownHallSuggestedCard() {
	return (
		<div className="bg-surface-raised border border-border-subtle" style={{ flexShrink: 0, borderRadius: 16, padding: "14px 14px 12px", width: 140, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
			<Skel w={44} h={44} r={22} />
			<Skel w={88} h={11} r={5} />
			<Skel w={64} h={10} r={5} />
			<Skel w="100%" h={24} r={12} />
		</div>
	);
});

const SkeletonSearchRow = React.memo(function SkeletonSearchRow() {
	return (
		<div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
			<Skel w={44} h={44} r={22} />
			<div style={{ flex: 1 }}>
				<Skel w="55%" h={13} r={6} style={{ marginBottom: 6 }} />
				<Skel w="36%" h={11} r={5} />
			</div>
			<Skel w={72} h={30} r={15} />
		</div>
	);
});

/** Instagram-style Social Feed post (header + media tile + caption). */
const SkeletonFeedPost = React.memo(function SkeletonFeedPost({ mediaH = 280 }) {
	return (
		<div style={{ marginBottom: 20 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
				<Skel w={36} h={36} r={18} />
				<div>
					<Skel w={120} h={12} r={6} style={{ marginBottom: 6 }} />
					<Skel w={72} h={10} r={5} />
				</div>
			</div>
			<Skel w="100%" h={mediaH} r={4} />
			<div style={{ display: "flex", gap: 14, marginTop: 10, marginBottom: 8 }}>
				<Skel w={22} h={22} r={6} />
				<Skel w={22} h={22} r={6} />
				<Skel w={22} h={22} r={6} />
				<Skel w={22} h={22} r={6} style={{ marginLeft: "auto" }} />
			</div>
			<Skel w={120} h={12} r={5} style={{ marginBottom: 6 }} />
			<Skel w="80%" h={11} r={5} />
		</div>
	);
});

const SkeletonFeedStory = React.memo(function SkeletonFeedStory() {
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
			<Skel w={60} h={60} r={30} />
			<Skel w={44} h={10} r={5} />
		</div>
	);
});

const SkeletonMediaGrid = React.memo(function SkeletonMediaGrid({ count = 9, cols = 3 }) {
	return (
		<div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 2 }}>
			{Array.from({ length: count }, (_, i) => (
				<div key={i} style={{ position: "relative", paddingBottom: "125%" }}>
					<Skel r={0} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
				</div>
			))}
		</div>
	);
});

const SkeletonCommentDark = React.memo(function SkeletonCommentDark() {
	return (
		<div style={{ display: "flex", gap: 12, padding: "14px 0" }}>
			<Skel w={44} h={44} r={22} />
			<div style={{ flex: 1 }}>
				<Skel w={120} h={12} r={6} style={{ marginBottom: 8 }} />
				<Skel w="88%" h={12} r={5} style={{ marginBottom: 5 }} />
				<Skel w="54%" h={12} r={5} />
			</div>
		</div>
	);
});
const SkeletonVideoCard = React.memo(function SkeletonVideoCard() {
	return (
		<div style={{ width: 280, flexShrink: 0 }}>
			<Skel h={158} r={12} />
			<div style={{ display: "flex", gap: 10, marginTop: 10 }}>
				<Skel w={34} h={34} r={17} />
				<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
					<Skel w="85%" h={13} />
					<Skel w="55%" h={11} />
					<Skel w="40%" h={11} />
				</div>
			</div>
		</div>
	);
});
const SkeletonProductCard = React.memo(function SkeletonProductCard({ w = 240, imgH = 220 }) {
	return (
		<div className="border border-border-subtle" style={{ width: w, borderRadius: 16, overflow: "hidden", flexShrink: 0 }}>
			<Skel h={imgH} r={0} />
			<div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
				<Skel w="90%" h={13} />
				<Skel w="55%" h={11} />
				<Skel w="30%" h={16} />
			</div>
		</div>
	);
});
const SkeletonEventCard = React.memo(function SkeletonEventCard({ featured = false }) {
	return (
		<div className="border border-border-subtle" style={{ width: featured ? 320 : 280, borderRadius: 16, overflow: "hidden", flexShrink: 0 }}>
			<Skel h={featured ? 180 : 130} r={0} />
			<div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
				<Skel w="88%" h={13} />
				<Skel w="60%" h={11} />
				<Skel w="70%" h={11} />
				<Skel w="45%" h={11} />
			</div>
		</div>
	);
});
const SkeletonServiceCard = React.memo(function SkeletonServiceCard() {
	return (
		<div className="border border-border-subtle" style={{ width: 220, borderRadius: 16, overflow: "hidden", flexShrink: 0 }}>
			<Skel h={180} r={0} />
			<div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
				<Skel w="75%" h={14} />
				<Skel w="50%" h={12} />
			</div>
		</div>
	);
});
const SkeletonTempStayCard = React.memo(function SkeletonTempStayCard() {
	return (
		<div style={{ width: 280, flexShrink: 0 }}>
			<Skel h={200} r={14} />
			<div style={{ padding: "10px 2px 0" }}>
				{/* name + rating row */}
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
					<Skel w="62%" h={13} r={6} />
					<Skel w={48} h={12} r={6} />
				</div>
				{/* location */}
				<Skel w="50%" h={11} r={5} style={{ marginBottom: 5 }} />
				{/* guests / beds */}
				<Skel w="55%" h={11} r={5} style={{ marginBottom: 8 }} />
				{/* host avatar + name + price */}
				<div style={{ display: "flex", alignItems: "center", gap: 7 }}>
					<Skel w={20} h={20} r={10} style={{ flexShrink: 0 }} />
					<Skel w="42%" h={11} r={5} />
					<div style={{ marginLeft: "auto" }}>
						<Skel w={52} h={13} r={5} />
					</div>
				</div>
			</div>
		</div>
	);
});
const SkeletonListRow = React.memo(function SkeletonListRow() {
	return (
		<div className="border border-border-subtle" style={{ display: "flex", gap: 16, padding: "16px 20px", borderRadius: 14 }}>
			<Skel w={80} h={80} r={10} />
			<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
				<Skel w="80%" h={14} />
				<Skel w="50%" h={12} />
				<Skel w="60%" h={12} />
			</div>
		</div>
	);
});
const SkeletonBubble = React.memo(function SkeletonBubble() {
	return <Skel w={64} h={34} r={20} />;
});const SkeletonCircle = React.memo(function SkeletonCircle() {
	return (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
			<Skel w={72} h={72} r={36} />
			<Skel w={44} h={10} r={5} />
		</div>
	);
});
const SkeletonHeading = React.memo(function SkeletonHeading() {
	return <Skel w={220} h={40} r={8} />;
});

const SkeletonRestaurantCard = React.memo(function SkeletonRestaurantCard() {
	return (
		<div className="bg-surface-raised border border-border" style={{ width: 280, flexShrink: 0, borderRadius: 16, overflow: "hidden" }}>
			<Skel h={160} r={0} />
			<div style={{ padding: "12px 14px 14px" }}>
				<Skel w="70%" h={14} r={6} style={{ marginBottom: 6 }} />
				<Skel w="50%" h={11} r={5} style={{ marginBottom: 12 }} />
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<Skel w={48} h={12} r={5} />
					<Skel w={60} h={12} r={5} />
				</div>
			</div>
		</div>
	);
});
const SkeletonREListingCard = React.memo(function SkeletonREListingCard() {
	return (
		<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, overflow: "hidden" }}>
			<Skel h={160} r={0} />
			<div style={{ padding: "12px 14px" }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
					<Skel w="60%" h={14} r={6} />
					<Skel w={50} h={20} r={6} />
				</div>
				<Skel w="55%" h={11} r={5} style={{ marginBottom: 6 }} />
				<Skel w="65%" h={11} r={5} style={{ marginBottom: 8 }} />
				<div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
					{[50, 42, 38].map((w, i) => <Skel key={i} w={w} h={20} r={10} />)}
				</div>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<Skel w="40%" h={13} r={5} />
					<Skel w={64} h={30} r={8} />
				</div>
			</div>
		</div>
	);
});
const SkeletonVehicleCard = React.memo(function SkeletonVehicleCard() {
	return (
		<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, overflow: "hidden" }}>
			<Skel h={155} r={0} />
			<div style={{ padding: "12px 14px" }}>
				<div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
					<Skel w={60} h={18} r={9} />
					<Skel w={48} h={18} r={9} />
				</div>
				<Skel w="70%" h={14} r={6} style={{ marginBottom: 4 }} />
				<Skel w="55%" h={11} r={5} style={{ marginBottom: 8 }} />
				<Skel w="50%" h={11} r={5} style={{ marginBottom: 8 }} />
				<div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
					{[44, 40].map((w, i) => <Skel key={i} w={w} h={20} r={10} />)}
				</div>
				<div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
					<Skel w={22} h={22} r={11} style={{ flexShrink: 0 }} />
					<Skel w="45%" h={11} r={5} />
				</div>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<Skel w="35%" h={14} r={5} />
					<Skel w={70} h={32} r={10} />
				</div>
			</div>
		</div>
	);
});
const SkeletonEquipmentCard = React.memo(function SkeletonEquipmentCard() {
	return (
		<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, overflow: "hidden" }}>
			<Skel h={140} r={0} />
			<div style={{ padding: "12px 14px" }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
					<Skel w="60%" h={14} r={6} />
					<Skel w={50} h={18} r={9} />
				</div>
				<div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
					{[48, 44, 40].map((w, i) => <Skel key={i} w={w} h={20} r={10} />)}
				</div>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<Skel w="35%" h={13} r={5} />
					<Skel w={64} h={30} r={8} />
				</div>
			</div>
		</div>
	);
});
const SkeletonVenueCard = React.memo(function SkeletonVenueCard() {
	return (
		<div className="bg-surface-raised border border-border" style={{ borderRadius: 16, overflow: "hidden" }}>
			<Skel h={140} r={0} />
			<div style={{ padding: "12px 14px" }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
					<Skel w="55%" h={14} r={6} />
					<Skel w={44} h={18} r={9} />
				</div>
				<Skel w="60%" h={11} r={5} style={{ marginBottom: 8 }} />
				<div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
					{[54, 46, 40].map((w, i) => <Skel key={i} w={w} h={20} r={10} />)}
				</div>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<Skel w="40%" h={13} r={5} />
					<Skel w={60} h={30} r={8} />
				</div>
			</div>
		</div>
	);
});
export {
  GradientText,
  ShinyText,
  SpotlightCard,
  TiltCard,
  DecryptedText,
  Skel,
  SkeletonVideoCard,
  SkeletonProductCard,
  SkeletonEventCard,
  SkeletonServiceCard,
  SkeletonTempStayCard,
  SkeletonListRow,
  SkeletonBubble,
  SkeletonCircle,
  SkeletonHeading,
  SkeletonRestaurantCard,
  SkeletonREListingCard,
  SkeletonVehicleCard,
  SkeletonEquipmentCard,
  SkeletonVenueCard,
  SkeletonTownHallPost,
  SkeletonTownHallFeed,
  SkeletonTownHallReply,
  SkeletonTownHallDetail,
  SkeletonTownHallVoice,
  SkeletonTownHallTopic,
  SkeletonTownHallSuggestedCard,
  SkeletonSearchRow,
  SkeletonFeedPost,
  SkeletonFeedStory,
  SkeletonMediaGrid,
  SkeletonCommentDark,
};
