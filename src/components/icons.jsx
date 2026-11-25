import React from "react";

// ── Icons ─────────────────────────────────────────────
const StrugLogo = React.memo(function StrugLogo({ s = 28, color = "#EC2739" }) {
	return (
		<svg width={s} height={s} viewBox="1000 2100 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
			<polygon fill={color} points="1631.64,2135.21 1449.23,2317.62 1395.81,2371.05 1358.04,2408.81 1304.61,2462.22 1266.82,2500.01 1213.41,2553.42 1213.41,2424.46 1229.06,2408.81 1304.61,2333.24 1411.43,2226.42 1031.02,2226.42 1031.02,2135.21" />
			<polygon fill={color} points="1760.59,2135.23 1760.59,2864.79 1669.39,2864.79 1669.39,2355.39 1615.96,2408.81 1159.99,2864.79 1031.02,2864.79 1031.02,2408.81 1122.22,2408.81 1122.22,2773.6 1487,2408.81 1578.2,2317.62" />
			<polygon fill={color} points="1487,2666.76 1487,2864.79 1395.81,2864.79 1395.81,2757.95" />
		</svg>
	);
});
const ProfileIcon = React.memo(function ProfileIcon({ s = 22 }) {
	return (
		<svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
			<circle cx="12" cy="8" r="4" />
			<path d="M4 20c0-3.87 3.58-7 8-7s8 3.13 8 7H4z" />
		</svg>
	);
});
// Wifi arcs struck through diagonally — the "you are offline" state. Used by the driver
// online-reminder toast, which previously rendered a bare "●" glyph that carried no meaning.
const WifiOffIcon = React.memo(function WifiOffIcon({ s = 20 }) {
	return (
		<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
			<path d="M1 1l22 22" />
			<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
			<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
			<path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
			<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
			<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
			<line x1="12" y1="20" x2="12.01" y2="20" />
		</svg>
	);
});
const HomeIcon = React.memo(function HomeIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>;
});const AISparkleIcon = React.memo(function AISparkleIcon({ s = 24, sw = 1.8 }) {
	return (
		<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
			<path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5Z"/>
			<path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9Z"/>
		</svg>
	);
});const LibraryIcon = React.memo(function LibraryIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
});const ImageIcon = React.memo(function ImageIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
});const FullscreenEnterIcon = React.memo(function FullscreenEnterIcon({ s = 16 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3M21 8V5a2 2 0 00-2-2h-3M16 21h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>;
});const FullscreenExitIcon = React.memo(function FullscreenExitIcon({ s = 16 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 01-2 2H3M21 8h-3a2 2 0 01-2-2V3M3 16h3a2 2 0 012 2v3M16 21v-3a2 2 0 012-2h3"/></svg>;
});const VideoIcon = React.memo(function VideoIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="14" height="14" rx="2"/><polygon points="22 8 16 12 22 16 22 8"/></svg>;
});const BlueprintIcon = React.memo(function BlueprintIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/><path d="M3 9h2M3 12h2M3 15h2"/></svg>;
});const UpscalerIcon = React.memo(function UpscalerIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>;
});const FlowStateIcon = React.memo(function FlowStateIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>;
});const PlansIcon = React.memo(function PlansIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>;
});const ApiIcon = React.memo(function ApiIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M7 9l-2 2 2 2M17 9l2 2-2 2M13 8l-2 6"/></svg>;
});const WhatsNewIcon = React.memo(function WhatsNewIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
});const MoreIcon = React.memo(function MoreIcon({ s = 20 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>;
});const CanvasIcon = React.memo(function CanvasIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>;
});const DrawIcon = React.memo(function DrawIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>;
});const SearchIcon = React.memo(function SearchIcon({ s = 18 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
});
const CheckIcon = React.memo(function CheckIcon({ s = 12 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>;
});
const PlusIcon = React.memo(function PlusIcon({ s = 12 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
});const StarIcon = React.memo(function StarIcon({ s = 14 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>;
});
// ── New page icons ─────────────────────────────────────
const OnDemandIcon = React.memo(function OnDemandIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
});const SocialIcon = React.memo(function SocialIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
});const CommunityIcon = React.memo(function CommunityIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-3.92-8.4-6.1-14.5-5.5"/></svg>;
});const LiveIcon = React.memo(function LiveIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
});const FeedIcon = React.memo(function FeedIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
});const PinBoardIcon = React.memo(function PinBoardIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>;
});const FavouritesIcon = React.memo(function FavouritesIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
});const FoodIcon = React.memo(function FoodIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>;
});const GroceriesIcon = React.memo(function GroceriesIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.99-1.73l1.38-9.26H6"/></svg>;
});const CateringIcon = React.memo(function CateringIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>;
});const RealEstateIcon = React.memo(function RealEstateIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>;
});const TempStayIcon = React.memo(function TempStayIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><rect x="9" y="13" width="6" height="8"/></svg>;
});const VenuesIcon = React.memo(function VenuesIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/><path d="M15 9v12"/></svg>;
});const ExperiencesIcon = React.memo(function ExperiencesIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/></svg>;
});const ShopIcon = React.memo(function ShopIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>;
});const SecondHandIcon = React.memo(function SecondHandIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>;
});const FloralIcon = React.memo(function FloralIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V12"/><path d="M12 12C12 12 7 10 7 6a5 5 0 0110 0c0 4-5 6-5 6z"/><path d="M12 12C12 12 7 14 7 18a5 5 0 0010 0c0-4-5-6-5-6z"/></svg>;
});const DigProductsIcon = React.memo(function DigProductsIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>;
});const ProServicesIcon = React.memo(function ProServicesIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>;
});const DigServicesIcon = React.memo(function DigServicesIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
});const MedicalIcon = React.memo(function MedicalIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
});const LessonsIcon = React.memo(function LessonsIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>;
});const LearnIcon = React.memo(function LearnIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3.33 2 8.67 2 12 0v-5"/></svg>;
});const ArtistsIcon = React.memo(function ArtistsIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>;
});const PortfolioIcon = React.memo(function PortfolioIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
});const BooksIcon = React.memo(function BooksIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>;
});const HotelIcon = React.memo(function HotelIcon({ s = 24 }) {
	return (
		<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
			<rect x="2" y="6" width="20" height="16" rx="2"/>
			<path d="M2 10h20"/>
			<path d="M7 10v12"/>
			<path d="M17 10v12"/>
			<path d="M2 6l10-4 10 4"/>
		</svg>
	);
});
const CourierIcon = React.memo(function CourierIcon({ s = 24 }) {
	return (
		<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
			<polyline points="12 3 2 9 12 15 22 9 12 3"/>
			<polyline points="2 9 2 19 12 21 22 19 22 9"/>
			<line x1="12" y1="15" x2="12" y2="21"/>
		</svg>
	);
});
const BookArtistIcon = React.memo(function BookArtistIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
});const InfluencerIcon = React.memo(function InfluencerIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 000-12"/><path d="M23 6a11 11 0 00-11-6"/><path d="M23 6v6h-6"/><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>;
});const EventsIcon = React.memo(function EventsIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
});/** Checklist planner — distinct from ticketed Events calendar icon */
const ConciergeIcon = React.memo(function ConciergeIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4"/><path d="M9 17h6"/></svg>;
});const WeddingIcon = React.memo(function WeddingIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
});const DatingIcon = React.memo(function DatingIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/><path d="M12 5.67v15.56"/><path d="M7.2 15.98h9.6"/></svg>;
});const ReservationsIcon = React.memo(function ReservationsIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>;
});const MeetIcon = React.memo(function MeetIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
});const CelebrityIcon = React.memo(function CelebrityIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
});const EquipmentIcon = React.memo(function EquipmentIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>;
});const AutomotiveIcon = React.memo(function AutomotiveIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
});const VehiclesIcon = React.memo(function VehiclesIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>;
});const RideshareIcon = React.memo(function RideshareIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v5"/><circle cx="14" cy="17" r="2"/><circle cx="6" cy="17" r="2"/><path d="M14 15H6"/></svg>;
});const DecorIcon = React.memo(function DecorIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
});const PreconstructIcon = React.memo(function PreconstructIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M9 8l2 2 4-4"/></svg>;
});const RaiseIcon = React.memo(function RaiseIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
});const DiscountsIcon = React.memo(function DiscountsIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>;
});const RefCodeIcon = React.memo(function RefCodeIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
});const WalletEarningsIcon = React.memo(function WalletEarningsIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M16 12a2 2 0 000 4h4v-4h-4z"/><path d="M6 9h4"/></svg>;
});const MessagesIcon = React.memo(function MessagesIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
});const DashboardIcon = React.memo(function DashboardIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>;
});const OrdersIcon = React.memo(function OrdersIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>;
});const UserSettingsIcon = React.memo(function UserSettingsIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>;
});const HelpCenterIcon = React.memo(function HelpCenterIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
});
const InsuranceIcon = React.memo(function InsuranceIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>;
});
const MortgageIcon = React.memo(function MortgageIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/><path d="M9 9h6"/></svg>;
});
const EarnIcon = React.memo(function EarnIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M7 21h10"/><path d="M5 9l7-6 7 6"/><path d="M9 13h6M9 16.5h6"/></svg>;
});
const MapPinIcon = React.memo(function MapPinIcon({ s = 14 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>;
});
const FolderIcon = React.memo(function FolderIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>;
});
// Live gift icons (used by LiveCoinGifts — no emoji glyphs).
const GiftRoseIcon = React.memo(function GiftRoseIcon({ s = 18 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V12"/><path d="M12 12c0 0-5-2-5-6a5 5 0 0110 0c0 4-5 6-5 6z"/><path d="M9 22c1-2 2-3 3-3s2 1 3 3"/></svg>;
});
const GiftHeartIcon = React.memo(function GiftHeartIcon({ s = 18 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
});
const GiftStarIcon = React.memo(function GiftStarIcon({ s = 18 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg>;
});
const GiftCrownIcon = React.memo(function GiftCrownIcon({ s = 18 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l2-10 5 5 2-7 2 7 5-5 2 10H3z"/><path d="M5 17h14"/></svg>;
});
const GiftDiamondIcon = React.memo(function GiftDiamondIcon({ s = 18 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12l4 6-10 12L2 9l4-6z"/><path d="M2 9h20M10 3l-2 6 4 12M14 3l2 6-4 12"/></svg>;
});
const JobsIcon = React.memo(function JobsIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M2 13h20"/></svg>;
});
const EmployerIcon = React.memo(function EmployerIcon({ s = 24 }) {
	return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21V5a2 2 0 012-2h8a2 2 0 012 2v16"/><path d="M16 9h2a2 2 0 012 2v10"/><path d="M2 21h20"/><path d="M8 7h.01M12 7h.01M8 11h.01M12 11h.01M8 15h.01M12 15h.01"/></svg>;
});
const LIVE_GIFT_ICONS = {
	rose: GiftRoseIcon,
	heart: GiftHeartIcon,
	star: GiftStarIcon,
	crown: GiftCrownIcon,
	diamond: GiftDiamondIcon,
};
function LiveGiftIcon({ name, s = 18 }) {
	const Icon = LIVE_GIFT_ICONS[name] || GiftHeartIcon;
	return <Icon s={s} />;
}
export {
  StrugLogo,
  ProfileIcon,
  WifiOffIcon,
  HomeIcon,
  AISparkleIcon,
  LibraryIcon,
  ImageIcon,
  FullscreenEnterIcon,
  FullscreenExitIcon,
  VideoIcon,
  BlueprintIcon,
  UpscalerIcon,
  FlowStateIcon,
  PlansIcon,
  ApiIcon,
  WhatsNewIcon,
  MoreIcon,
  CanvasIcon,
  DrawIcon,
  SearchIcon,
  CheckIcon,
  PlusIcon,
  StarIcon,
  OnDemandIcon,
  SocialIcon,
  CommunityIcon,
  LiveIcon,
  FeedIcon,
  PinBoardIcon,
  FavouritesIcon,
  FoodIcon,
  GroceriesIcon,
  CateringIcon,
  RealEstateIcon,
  TempStayIcon,
  VenuesIcon,
  ExperiencesIcon,
  ShopIcon,
  SecondHandIcon,
  FloralIcon,
  DigProductsIcon,
  ProServicesIcon,
  DigServicesIcon,
  MedicalIcon,
  LessonsIcon,
  LearnIcon,
  ArtistsIcon,
  PortfolioIcon,
  BooksIcon,
  HotelIcon,
  CourierIcon,
  BookArtistIcon,
  InfluencerIcon,
  EventsIcon,
  ConciergeIcon,
  WeddingIcon,
  DatingIcon,
  ReservationsIcon,
  MeetIcon,
  CelebrityIcon,
  EquipmentIcon,
  AutomotiveIcon,
  VehiclesIcon,
  RideshareIcon,
  DecorIcon,
  PreconstructIcon,
  RaiseIcon,
  DiscountsIcon,
  RefCodeIcon,
  WalletEarningsIcon,
  MessagesIcon,
  DashboardIcon,
  OrdersIcon,
  UserSettingsIcon,
  HelpCenterIcon,
  InsuranceIcon,
  MortgageIcon,
  EarnIcon,
  MapPinIcon,
  FolderIcon,
  GiftRoseIcon,
  GiftHeartIcon,
  GiftStarIcon,
  GiftCrownIcon,
  GiftDiamondIcon,
  LiveGiftIcon,
  JobsIcon,
  EmployerIcon,
};
