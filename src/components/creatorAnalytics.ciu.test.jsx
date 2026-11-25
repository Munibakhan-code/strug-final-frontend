import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CREATOR_RANGE_OPTIONS, DonutChart, RANGE_OPTIONS } from './creatorAnalytics.jsx';

const segments = [
	{ label: 'Education', value: 60, color: '#2563eb' },
	{ label: 'Technology', value: 40, color: '#7c3aed' },
];

describe('Creator Intelligence analytics', () => {
	it('exposes the complete supported creator range set', () => {
		expect(CREATOR_RANGE_OPTIONS.map(option => option.id)).toEqual(['24h', '7d', '30d', '90d', '1y', 'all']);
	});

	// The seller/vendor/host/driver/courier/referral panels share RANGE_OPTIONS, and their
	// backends resolve it through utils/analytics-buckets.js. Creator ids there fall back to 28d.
	it('keeps the shared range ids on the analytics-buckets vocabulary', () => {
		expect(RANGE_OPTIONS.map(option => option.id)).toEqual(['7d', '28d', '90d', '365d', 'lifetime']);
	});

	it('focuses a donut segment and restores the full chart from its center', () => {
		const onHoverIndex = vi.fn();
		const { container } = render(
			<DonutChart segments={segments} hoveredIndex={null} onHoverIndex={onHoverIndex} centerLabel="Total Views" centerValue="100" />,
		);

		const education = screen.getByRole('button', { name: /Education: 60 views, 60.0 percent/i });
		fireEvent.mouseEnter(education);
		expect(onHoverIndex).toHaveBeenCalledWith(0);

		fireEvent.click(education);
		expect(screen.getByText(/click center to reset/i)).toBeInTheDocument();
		expect(education).toHaveAttribute('opacity', '1');

		const reset = screen.getByRole('button', { name: /show complete chart/i });
		fireEvent.click(reset);
		expect(screen.queryByText(/click center to reset/i)).not.toBeInTheDocument();
		expect(container.querySelector('svg')).toHaveTextContent('Total Views');
	});
});
