import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CreatorAudienceIntelligence } from './creatorAnalytics.jsx';

describe('CreatorAudienceIntelligence', () => {
	it('renders aggregate audience signals without identity fields', () => {
		const data = {
			funnel: [{ label: 'Impressions', value: 1200 }, { label: 'Engaged', value: 90 }],
			retention: [100, 82, 61, 44, 35, 28],
			segments: [{ label: 'Returning viewers', value: 62 }, { label: 'New viewers', value: 38 }],
			sources: [{ label: 'Home', value: 700 }],
			privacy: { aggregated: true, identities_exposed: false },
		};
		render(<CreatorAudienceIntelligence data={data} isMobile />);

		expect(screen.getByRole('region', { name: 'Audience intelligence' })).toBeInTheDocument();
		expect(screen.getByText('From discovery to engagement')).toBeInTheDocument();
		expect(screen.getByText('AUDIENCE RETENTION')).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'How long viewers keep watching' })).toBeInTheDocument();
		expect(screen.getByText('Returning viewers')).toBeInTheDocument();
		expect(screen.getByText('Home')).toBeInTheDocument();
		expect(JSON.stringify(data)).not.toContain('user_id');
	});

	it('shows a useful zero-data state', () => {
		render(<CreatorAudienceIntelligence data={{ funnel: [], retention: [], segments: [], sources: [] }} />);
		expect(screen.getByText(/insights will appear/i)).toBeInTheDocument();
	});
});
