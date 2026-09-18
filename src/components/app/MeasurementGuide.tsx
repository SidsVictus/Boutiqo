import Image from "next/image";

/** The two measurement diagrams in a sunken panel — final raster PNGs per the
 * handoff, used as-is (no redraw). */
export function MeasurementGuide() {
  return (
    <div className="bq-g2" style={{ background: "var(--surface-sunken)", padding: 16, borderRadius: "var(--radius-lg)" }}>
      <div>
        <div className="bq-label" style={{ marginBottom: 8 }}>
          Back — points 1–8
        </div>
        <Image src="/assets/measure-back.png" alt="Measurement guide, back piece, points 1 to 8" width={400} height={400} style={{ width: "100%", height: "auto", borderRadius: "var(--radius-md)" }} />
      </div>
      <div>
        <div className="bq-label" style={{ marginBottom: 8 }}>
          Front — points 9–14
        </div>
        <Image src="/assets/measure-front.png" alt="Measurement guide, front piece, points 9 to 14" width={400} height={400} style={{ width: "100%", height: "auto", borderRadius: "var(--radius-md)" }} />
      </div>
    </div>
  );
}
