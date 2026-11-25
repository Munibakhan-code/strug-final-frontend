import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PickupConfidence from './PickupConfidence';
import RideOptionList from './RideOptionList';
import RideBookingPanel from './RideBookingPanel';
import RideMatchingPanel from './RideMatchingPanel';
import RidePickupPanel from './RidePickupPanel';
import RideCompletionPanel from './RideCompletionPanel';
import { useRideScheduleValidation } from '../../hooks/useRideScheduleValidation.js';
import i18n from '../../i18n/index.js';

afterEach(() => vi.restoreAllMocks());

const panelProps = {
  pickup: 'Union Station',
  dropoff: 'Harbourfront',
  setPickup: vi.fn(),
  setDropoff: vi.fn(),
  routeMeta: { status: 'success', durationMin: 12, distanceKm: 5.2 },
  confidence: { level: 'high', reason: 'good_supply', blocksBooking: false },
  onConfirmPickup: vi.fn(),
  timing: 'now',
  setTiming: vi.fn(),
  scheduleDate: '',
  setScheduleDate: vi.fn(),
  scheduleTime: '',
  setScheduleTime: vi.fn(),
  options: [{ id: 'economy', label: 'Standard', total: 18.4, seats: 4, pickupRange: { min: 3, max: 6 }, recommended: true }],
  selectedId: 'economy',
  onSelect: vi.fn(),
  priceMode: 'standard',
  setPriceMode: vi.fn(),
  userPrice: '',
  setUserPrice: vi.fn(),
  referralCode: '',
  setReferralCode: vi.fn(),
  onConfirm: vi.fn(),
};

describe('RideBookingPanel', () => {
  it('uses localized swap-route copy for its visible and accessible label', () => {
    const translation = vi.spyOn(i18n, 't').mockImplementation((key) => key === 'rideshare.swapRoute' ? 'Interchange route test' : key);
    render(<RideBookingPanel {...panelProps} />);
    expect(screen.getByRole('button', { name: 'Interchange route test' })).toHaveTextContent('Interchange route test');
    translation.mockRestore();
  });
  it('offers current location for pickup but not dropoff', () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: vi.fn() },
    });
    render(<RideBookingPanel {...panelProps} />);
    expect(screen.getAllByTitle(/use my location/i)).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Pickup' }).parentElement).toContainElement(screen.getByTitle(/use my location/i));
    expect(screen.getByRole('textbox', { name: 'Dropoff' }).parentElement).not.toContainElement(screen.getByTitle(/use my location/i));
  });

  it('labels route fields, swaps them, and shows route metrics', async () => {
    const user = userEvent.setup();
    const setPickup = vi.fn();
    const setDropoff = vi.fn();
    render(<RideBookingPanel {...panelProps} setPickup={setPickup} setDropoff={setDropoff} />);
    expect(screen.getByRole('textbox', { name: 'Pickup' })).toHaveValue('Union Station');
    expect(screen.getByRole('textbox', { name: 'Dropoff' })).toHaveValue('Harbourfront');
    expect(screen.getByText(/12 min/)).toBeInTheDocument();
    expect(screen.getByText(/5.2 km/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Swap pickup and dropoff' }));
    expect(setPickup).toHaveBeenCalledWith('Harbourfront');
    expect(setDropoff).toHaveBeenCalledWith('Union Station');
  });

  it('keeps custom price, schedule, and referral secondary until disclosed', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RideBookingPanel {...panelProps} />);
    expect(screen.queryByRole('spinbutton', { name: 'Your price' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Schedule date')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Referral code' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set your own' }));
    expect(panelProps.setPriceMode).toHaveBeenCalledWith('setprice');
    rerender(<RideBookingPanel {...panelProps} priceMode="setprice" userPrice="0.5" />);
    expect(screen.getByText(/offering less may take a little longer to match/i)).toBeInTheDocument();
    expect(screen.getByText(/offer of at least \$1\.00/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(panelProps.setTiming).toHaveBeenCalledWith('schedule');
    rerender(<RideBookingPanel {...panelProps} timing="schedule" />);
    expect(screen.getByLabelText('Schedule date')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Have a referral code? Add it here' }));
    expect(screen.getByRole('textbox', { name: 'Referral code' })).toBeInTheDocument();
  });

  it('shows the exact valid fare action and calls only the coordinator callback', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<RideBookingPanel {...panelProps} onConfirm={onConfirm} />);
    const confirm = screen.getByRole('button', { name: 'Confirm Standard · $18.40' });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it.each([
    [{ valid: false, scheduledAt: null, reason: 'schedule_incomplete' }, /choose a schedule date and time/i],
    [{ valid: false, scheduledAt: null, reason: 'schedule_past' }, /future time/i],
  ])('blocks an invalid scheduled ride with a specific reason', (scheduleValidation, reason) => {
    render(<RideBookingPanel {...panelProps} timing="schedule" scheduleValidation={scheduleValidation} />);
    expect(screen.getByRole('button', { name: 'Confirm Standard · $18.40' })).toBeDisabled();
    expect(screen.getByText(reason)).toBeInTheDocument();
  });

  it('enables a future scheduled ride', () => {
    render(<RideBookingPanel {...panelProps} timing="schedule" scheduleDate="2099-01-01" scheduleTime="12:00" scheduleValidation={{ valid: true, scheduledAt: '2099-01-01T12:00', reason: null }} />);
    expect(screen.getByRole('button', { name: 'Confirm Standard · $18.40' })).toBeEnabled();
  });

  it('automatically disables the booking CTA when unchanged schedule inputs expire', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 22, 12, 0, 0));
    function LiveSchedulePanel() {
      const scheduleValidation = useRideScheduleValidation('schedule', '2026-07-22', '12:01');
      return <RideBookingPanel {...panelProps} timing="schedule" scheduleDate="2026-07-22" scheduleTime="12:01" scheduleValidation={scheduleValidation} />;
    }
    const view = render(<LiveSchedulePanel />);
    const confirm = screen.getByRole('button', { name: 'Confirm Standard · $18.40' });
    expect(confirm).toBeEnabled();
    act(() => vi.advanceTimersByTime(60_001));
    expect(confirm).toBeDisabled();
    expect(screen.getByText(/choose a future time/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Schedule date')).toHaveValue('2026-07-22');
    expect(screen.getByLabelText('Schedule time')).toHaveValue('12:01');
    view.unmount();
    vi.useRealTimers();
  });

  it('uses a valid custom offer for every selectable class without multiplying recommendations', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RideBookingPanel {...panelProps} priceMode="setprice" userPrice="17.25" selectedId="economy" onSelect={onSelect} options={[
      { id: 'economy', label: 'Economy', total: null, recommended: true },
      { id: 'comfort', label: 'Comfort', total: null },
      { id: 'premium', label: 'Premium', total: null },
    ]} />);
    await user.click(screen.getByRole('radio', { name: /Comfort/ }));
    expect(onSelect).toHaveBeenCalledWith('comfort');
    expect(screen.getAllByText('$17.25')).toHaveLength(3);
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument();
  });

  it('clearly blocks custom class selection and confirmation below one dollar', () => {
    render(<RideBookingPanel {...panelProps} priceMode="setprice" userPrice="0.75" />);
    expect(screen.getByText('Enter an offer of at least $1.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fare unavailable' })).toBeDisabled();
  });

  it.each(['1.234', '1e2'])('blocks a non-canonical custom offer %s', (userPrice) => {
    render(<RideBookingPanel {...panelProps} priceMode="setprice" userPrice={userPrice} />);
    expect(screen.getByRole('button', { name: 'Fare unavailable' })).toBeDisabled();
  });

  it('accepts a canonical two-decimal custom offer', () => {
    render(<RideBookingPanel {...panelProps} priceMode="setprice" userPrice="1.23" />);
    expect(screen.getByRole('button', { name: 'Confirm Standard · $1.23' })).toBeEnabled();
  });

  it('disables booking without a real fare and shows a visible reason', () => {
    render(<RideBookingPanel {...panelProps} options={[{ id: 'economy', label: 'Standard', total: null }]} />);
    expect(screen.getByRole('button', { name: /Fare unavailable/ })).toBeDisabled();
    expect(screen.getByText('Choose a route to get a fare.')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    expect(screen.getByText('Choose a route to get a fare.')).toHaveAttribute('role', 'status');
  });

  it('routes low-confidence correction to the meaningful pickup callback and tolerates missing props', async () => {
    const user = userEvent.setup();
    const onConfirmPickup = vi.fn();
    const { rerender } = render(
      <RideBookingPanel {...panelProps} confidence={{ level: 'low', reason: 'route_unresolved', blocksBooking: true }} onConfirmPickup={onConfirmPickup} />,
    );
    await user.click(screen.getByRole('button', { name: 'Confirm pickup' }));
    expect(onConfirmPickup).toHaveBeenCalledOnce();
    rerender(<RideBookingPanel />);
    expect(screen.getByRole('button', { name: /Fare unavailable/ })).toBeDisabled();
  });
});

describe('RideMatchingPanel', () => {
  it.each([[5_000, /Contacting nearby drivers/], [25_000, /Expanding the search/], [55_000, /taking longer than usual/]])('shows the honest phase at %i ms', (elapsedMs, copy) => {
    render(<RideMatchingPanel elapsedMs={elapsedMs} onChangeRide={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent(copy);
  });

  it('calls each lifecycle choice exactly once and busy blocks every choice', async () => {
    const user = userEvent.setup();
    const callbacks = { onContinue: vi.fn(), onChangeRide: vi.fn(), onCancel: vi.fn() };
    const view = render(<RideMatchingPanel elapsedMs={55_000} {...callbacks} />);
    await user.click(screen.getByRole('button', { name: /continue waiting/i }));
    await user.click(screen.getByRole('button', { name: /change ride/i }));
    await user.click(screen.getByRole('button', { name: /cancel ride/i }));
    Object.values(callbacks).forEach((callback) => expect(callback).toHaveBeenCalledOnce());
    view.rerender(<RideMatchingPanel elapsedMs={55_000} {...callbacks} busy />);
    expect(screen.getAllByRole('button').every((button) => button.disabled)).toBe(true);
  });

  it('announces matching politely and exposes failures as alerts', () => {
    render(<RideMatchingPanel elapsedMs={25_000} error="Connection interrupted" onChangeRide={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('alert')).toHaveTextContent('Connection interrupted');
  });

  it('updates from startedAt, cleans its timer, and prevents repeated exits while busy', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00Z'));
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const view = render(<RideMatchingPanel startedAt={Date.now()} onChangeRide={vi.fn()} onCancel={vi.fn()} />);
    act(() => vi.advanceTimersByTime(25_000));
    expect(screen.getByRole('status')).toHaveTextContent(/Expanding the search/);
    view.rerender(<RideMatchingPanel startedAt={Date.now()} onChangeRide={vi.fn()} onCancel={vi.fn()} busy />);
    expect(screen.getByRole('button', { name: /change ride/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    view.unmount();
    expect(clearSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('RidePickupPanel', () => {
  const props = { driverName: 'Maya', driverRating: 4.9, vehicleModel: 'Toyota Prius', vehicleColor: 'Blue', vehiclePlate: 'ABC 123', etaLabel: '4 min', stage: 'accepted', locationUpdatedAt: '2026-07-22T11:59:55Z', now: new Date('2026-07-22T12:00:00Z').getTime() };

  it('shows fresh trust details, arrival, and accepted OTP', () => {
    render(<RidePickupPanel {...props} arrived rideOtp="4821" />);
    expect(screen.getByText(/location updated recently/i)).toBeInTheDocument();
    expect(screen.getByText(/Maya/)).toBeInTheDocument();
    expect(screen.getByText(/4\.9/)).toBeInTheDocument();
    expect(screen.getByText(/Blue Toyota Prius/)).toBeInTheDocument();
    expect(screen.getByText(/ABC 123/)).toBeInTheDocument();
    expect(screen.getByText(/driver has arrived/i)).toBeInTheDocument();
    expect(screen.getByText('4821')).toBeInTheDocument();
    expect(screen.getByText(/uses this code to start/i)).toBeInTheDocument();
  });

  it('marks stale or invalid location and uses honest fallbacks without inventing a rating', () => {
    render(<RidePickupPanel stage="completed" locationUpdatedAt="invalid" now={Date.now()} />);
    expect(screen.getByText(/location may be delayed/i)).toBeInTheDocument();
    expect(screen.getByText(/driver details unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/vehicle details unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/plate unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/rating/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/code to start/i)).not.toBeInTheDocument();
  });

  it('only renders supported actions', async () => {
    const user = userEvent.setup();
    const onMessage = vi.fn();
    const onEmergency = vi.fn();
    render(<RidePickupPanel {...props} onMessage={onMessage} onEmergency={onEmergency} />);
    expect(screen.queryByRole('button', { name: /call/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /message driver/i }));
    await user.click(screen.getByRole('button', { name: /emergency/i }));
    expect(onMessage).toHaveBeenCalledOnce();
    expect(onEmergency).toHaveBeenCalledOnce();
  });

  it('becomes stale after fifteen seconds and cleans its live timer', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00Z'));
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const view = render(<RidePickupPanel {...props} locationUpdatedAt={Date.now()} now={undefined} />);
    expect(screen.getByText(/updated recently/i)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(15_001));
    expect(screen.getByText(/may be delayed/i)).toBeInTheDocument();
    view.unmount();
    expect(clearSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('RideCompletionPanel', () => {
  const receipt = { rideId: 9, pickup: 'Union Station', dropoff: 'Harbourfront', total: 18.4, currency: 'CAD' };

  it('collects rating, exact tags, and comment while gating submit', async () => {
    const user = userEvent.setup();
    const onRatingChange = vi.fn();
    const onToggleTag = vi.fn();
    const onCommentChange = vi.fn();
    const { rerender } = render(<RideCompletionPanel receipt={receipt} rating={0} selectedTags={[]} comment="" onRatingChange={onRatingChange} onToggleTag={onToggleTag} onCommentChange={onCommentChange} onSubmit={vi.fn()} onRebook={vi.fn()} onReport={vi.fn()} />);
    expect(screen.getByText('Trip Receipt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit rating/i })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: '5 stars' }));
    await user.click(screen.getByRole('button', { name: 'Safe driving' }));
    await user.type(screen.getByRole('textbox', { name: /comment/i }), 'Smooth trip');
    expect(onRatingChange).toHaveBeenCalledWith(5);
    expect(onToggleTag).toHaveBeenCalledWith('Safe driving');
    expect(onCommentChange).toHaveBeenCalled();
    rerender(<RideCompletionPanel receipt={receipt} rating={5} selectedTags={['Safe driving']} comment="Smooth trip" onRatingChange={onRatingChange} onToggleTag={onToggleTag} onCommentChange={onCommentChange} onSubmit={vi.fn()} onRebook={vi.fn()} onReport={vi.fn()} />);
    expect(screen.getByRole('button', { name: /submit rating/i })).toBeEnabled();
    for (const tag of ['Great pickup', 'Safe driving', 'Clean vehicle', 'Easy to find']) expect(screen.getByRole('button', { name: tag })).toBeInTheDocument();
  });

  it('shows thanks after rating and keeps rebook and report available', async () => {
    const user = userEvent.setup();
    const onRebook = vi.fn();
    const onReport = vi.fn();
    render(<RideCompletionPanel receipt={receipt} rated onRebook={onRebook} onReport={onReport} />);
    expect(screen.getByText(/thanks for your feedback/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /book again/i }));
    await user.click(screen.getByRole('button', { name: /report an issue/i }));
    expect(onRebook).toHaveBeenCalledOnce();
    expect(onReport).toHaveBeenCalledOnce();
  });

  it('omits report when no supported report handler exists', () => {
    render(<RideCompletionPanel receipt={receipt} rated onRebook={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /report an issue/i })).not.toBeInTheDocument();
  });
});

describe('PickupConfidence', () => {
  it('explains an unresolved low-confidence pickup and confirms it once', async () => {
    const user = userEvent.setup();
    const onConfirmPickup = vi.fn();

    render(
      <PickupConfidence
        confidence={{ level: 'low', reason: 'route_unresolved' }}
        onConfirmPickup={onConfirmPickup}
      />,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Pickup needs confirmation');
    expect(status).toHaveTextContent(/exact pickup point/i);

    const button = screen.getByRole('button', { name: 'Confirm pickup' });
    expect(button).toHaveStyle({ minHeight: '44px' });
    await user.click(button);
    expect(onConfirmPickup).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['high', 'good_supply', 'Pickup confidence: High', /drivers are available nearby/i],
    ['medium', 'limited_supply', 'Pickup confidence: Medium', /driver supply is limited/i],
    ['unknown', 'availability_unknown', 'Pickup availability is temporarily unknown', /availability cannot be checked/i],
  ])('renders visible %s status and reason copy', (level, reason, heading, support) => {
    render(<PickupConfidence confidence={{ level, reason }} />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(heading);
    expect(status).toHaveTextContent(support);
    expect(status).toHaveTextContent(/[✓!~?]/);
    expect(screen.queryByRole('button', { name: 'Confirm pickup' })).not.toBeInTheDocument();
  });
});

describe('RideOptionList', () => {
  const options = [
    {
      id: 'standard',
      label: 'Standard',
      total: 18.4,
      seats: 4,
      desc: 'Everyday value',
      pickupRange: { min: 3, max: 6 },
      recommended: true,
    },
  ];

  it('uses localized copy to label the ride choice group', () => {
    const translation = vi.spyOn(i18n, 't').mockImplementation((key) => key === 'rideshare.chooseRide' ? 'Select transport test' : key);
    render(<RideOptionList options={options} />);
    expect(screen.getByRole('radiogroup', { name: 'Select transport test' })).toBeInTheDocument();
    translation.mockRestore();
  });

  it('shows ride details and selects an enabled option once', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RideOptionList options={options} onSelect={onSelect} />);

    const group = screen.getByRole('radiogroup', { name: 'Choose your ride' });
    const radio = within(group).getByRole('radio', { name: /Standard/ });
    expect(radio).toHaveTextContent('$18.40');
    expect(radio).toHaveTextContent('4 seats');
    expect(radio).toHaveTextContent('3–6 min pickup');
    expect(radio).toHaveTextContent('Recommended');
    expect(radio).toHaveTextContent('Everyday value');

    await user.click(radio);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('standard');
    expect(radio).toHaveStyle({ minHeight: '44px', overflowWrap: 'anywhere' });
  });

  it('disables a ride with unavailable fare and does not fabricate an ETA', () => {
    render(
      <RideOptionList
        options={[{ id: 'unknown', label: 'Mystery ride', total: Number.NaN, seats: 2, pickupRange: { min: 'soon' } }]}
      />,
    );

    const radio = screen.getByRole('radio', { name: /Mystery ride/ });
    expect(radio).toBeDisabled();
    expect(radio).toHaveTextContent('Fare unavailable');
    expect(radio).toHaveTextContent('Pickup time unavailable');
  });

  it('rejects reversed pickup ranges', () => {
    render(
      <RideOptionList
        options={[{ id: 'reversed', label: 'Reversed ETA', total: 12, seats: 4, pickupRange: { min: 8, max: 3 } }]}
      />,
    );

    expect(screen.getByRole('radio', { name: /Reversed ETA/ })).toHaveTextContent('Pickup time unavailable');
  });

  it.each([null, {}, 'invalid'])('renders an empty labelled group for malformed options input', (malformed) => {
    render(<RideOptionList options={malformed} />);

    expect(screen.getByRole('radiogroup', { name: 'Choose your ride' })).toBeEmptyDOMElement();
  });

  it('keeps selected aria state distinct from recommendation', () => {
    render(
      <RideOptionList
        selectedId="premium"
        options={[
          ...options,
          { id: 'premium', label: 'Premium', total: 30, seats: 3, pickupRange: { min: 5, max: 8 } },
        ]}
      />,
    );

    expect(screen.getByRole('radio', { name: /Standard/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /Standard/ })).toHaveTextContent('Recommended');
    expect(screen.getByRole('radio', { name: /Premium/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Premium/ })).not.toHaveTextContent('Recommended');
  });

  it('global disabled prevents selection', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RideOptionList options={options} onSelect={onSelect} disabled />);

    const radio = screen.getByRole('radio', { name: /Standard/ });
    expect(radio).toBeDisabled();
    await user.click(radio);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('discards invalid and duplicate IDs while preserving valid callback IDs', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <RideOptionList
        selectedId={undefined}
        onSelect={onSelect}
        options={[
          { label: 'Missing ID', total: 1 },
          { id: '  ', label: 'Blank ID', total: 2 },
          { id: {}, label: 'Object ID', total: 3 },
          { id: Number.NaN, label: 'NaN ID', total: 4 },
          { id: 'valid', label: 'First valid', total: 5 },
          { id: 'valid', label: 'Duplicate valid', total: 6 },
          { id: 7, label: 'Numeric valid', total: 7 },
        ]}
      />,
    );

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.queryByText(/Missing ID|Blank ID|Object ID|NaN ID|Duplicate valid/)).not.toBeInTheDocument();
    expect(radios.every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);

    await user.click(screen.getByRole('radio', { name: /Numeric valid/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(7);
  });

  it('roves focus forward and backward with wrapping while skipping unavailable options', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const keyboardOptions = [
      { id: 'standard', label: 'Standard', total: 18, pickupRange: { min: 3, max: 6 } },
      { id: 'unavailable', label: 'Unavailable', total: null, pickupRange: { min: 1, max: 2 } },
      { id: 'premium', label: 'Premium', total: 30, pickupRange: { min: 5, max: 8 } },
      { id: 7, label: 'Numeric', total: 22, pickupRange: { min: 4, max: 7 } },
    ];

    function RadioHarness() {
      const [selectedId, setSelectedId] = useState('premium');
      return (
        <RideOptionList
          options={keyboardOptions}
          selectedId={selectedId}
          onSelect={(id) => {
            onSelect(id);
            setSelectedId(id);
          }}
        />
      );
    }

    render(<RadioHarness />);
    const standard = screen.getByRole('radio', { name: /Standard/ });
    const unavailable = screen.getByRole('radio', { name: /Unavailable/ });
    const premium = screen.getByRole('radio', { name: /Premium/ });
    const numeric = screen.getByRole('radio', { name: /Numeric/ });

    expect(premium).toHaveAttribute('tabindex', '0');
    expect(standard).toHaveAttribute('tabindex', '-1');
    expect(unavailable).toHaveAttribute('tabindex', '-1');
    expect(numeric).toHaveAttribute('tabindex', '-1');

    premium.focus();
    await user.keyboard('{ArrowDown}');
    expect(numeric).toHaveFocus();
    expect(numeric).toHaveAttribute('aria-checked', 'true');
    expect(onSelect).toHaveBeenLastCalledWith(7);

    await user.keyboard('{ArrowRight}');
    expect(standard).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith('standard');

    await user.keyboard('{ArrowUp}');
    expect(numeric).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith(7);

    await user.keyboard('{ArrowLeft}');
    expect(premium).toHaveFocus();
    expect(onSelect).toHaveBeenLastCalledWith('premium');
    expect(onSelect).toHaveBeenCalledTimes(4);
  });

  it('makes the first enabled option tabbable and activates once with Enter or Space', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <RideOptionList
        onSelect={onSelect}
        options={[
          { id: 'no-fare', label: 'No fare', total: null },
          { id: 'ready', label: 'Ready', total: 10, pickupRange: { min: 2, max: 4 } },
          { id: 'next', label: 'Next', total: 14, pickupRange: { min: 3, max: 5 } },
        ]}
      />,
    );

    const noFare = screen.getByRole('radio', { name: /No fare/ });
    const ready = screen.getByRole('radio', { name: /Ready/ });
    const next = screen.getByRole('radio', { name: /Next/ });
    expect(noFare).toHaveAttribute('tabindex', '-1');
    expect(ready).toHaveAttribute('tabindex', '0');
    expect(next).toHaveAttribute('tabindex', '-1');

    ready.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith('ready');

    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith('ready');
  });
});
