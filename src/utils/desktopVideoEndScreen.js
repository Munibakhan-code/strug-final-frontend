export function desktopEndScreenLayout(width, height) {
	const columns = width >= 740 ? 3 : width >= 520 ? 2 : 1;
	const rows = height >= 620 ? 2 : 1;
	return { columns, limit: columns * rows, compact: height < 400 };
}
