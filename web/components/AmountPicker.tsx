'use client';

/** Amount chips plus a free-form box. A suggestion only: the deposit address belongs
 *  to one key, so whatever arrives is credited. */
export default function AmountPicker({
  amount, setAmount, min,
}: { amount: number; setAmount: (v: number) => void; min: number }) {
  const presets = [5, 20, 50, 200];
  return (
    <div className="chips">
      {presets.map((v) => (
        <button key={v} className="chip" aria-pressed={amount === v} onClick={() => setAmount(v)}>
          ${v}
        </button>
      ))}
      <input
        type="number"
        min={min}
        step={0.5}
        placeholder="Other"
        aria-label="Custom amount in USD"
        value={presets.includes(amount) ? '' : (amount || '')}
        onChange={(e) => setAmount(Number(e.target.value) || 0)}
      />
    </div>
  );
}
