export function StatusBadge({ ok, labelTrue, labelFalse }: { ok: boolean; labelTrue: string; labelFalse: string }) {
  return (
    <span className={`badge ${ok ? "badge-success" : "badge-warning"} badge-sm`}>{ok ? labelTrue : labelFalse}</span>
  );
}
