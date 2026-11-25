import { useMoney } from '../hooks/useMoney.js';

/** Renders a numeric amount in the user's local currency (geo / profile). */
export function Money({ amount, from = 'USD', className, style }) {
  const { money } = useMoney();
  return (
    <span className={className} style={style}>
      {money(amount, from)}
    </span>
  );
}
