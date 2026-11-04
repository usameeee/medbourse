import type { Currency } from '../lib/currencies';

/**
 * Currency picker backed by the full ISO 4217 list. A value already stored on a record that is
 * not in the list is kept as an extra option so editing an older row never drops its code.
 */
export default function CurrencySelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Currency[];
  onChange: (code: string) => void;
}) {
  const known = options.some((option) => option.code === value);
  return (
    <select required value={value} onChange={(event) => onChange(event.target.value)}>
      {value && !known ? <option value={value}>{value}</option> : null}
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.code} — {option.name}
        </option>
      ))}
    </select>
  );
}
