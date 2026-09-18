export function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bq-stat">
      <span className="bq-label">{label}</span>
      <span className="bq-stat__hero bq-num">{value}</span>
    </div>
  );
}
