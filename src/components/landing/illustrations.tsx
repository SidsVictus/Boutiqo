/**
 * Landing-page illustrations. Every piece is hand-authored inline SVG (or a
 * token-styled HTML mock) — no icon library, no raster images. Motion lives
 * in `src/styles/landing.css`; these components only carry class names.
 */

/** Marching running-stitch line used as a section divider. */
export function StitchDivider({ className }: { className?: string }) {
  return (
    <svg
      className={"bq-lp-stitch" + (className ? " " + className : "")}
      width="100%"
      height="8"
      aria-hidden="true"
      focusable="false"
    >
      <line x1="0" y1="4" x2="100%" y2="4" />
    </svg>
  );
}

/** Hero underline: a thread that draws itself, ending in a needle. */
export function HeroThread() {
  return (
    <svg
      className="bq-lp-herothread"
      viewBox="0 0 560 78"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="bq-lp-herothread__line"
        fill="none"
        d="M6 56 C 96 74, 186 42, 274 54 S 430 74, 470 48"
      />
      <g transform="translate(470 48) rotate(-16)">
        <g className="bq-lp-needle">
          <path
            className="bq-lp-needle__body"
            d="M2 -2.4 H46 L56 0 L46 2.4 H2 A2.4 2.4 0 0 1 2 -2.4 Z"
          />
          <ellipse className="bq-lp-needle__eye" cx="7" cy="0" rx="3.2" ry="1.3" />
        </g>
      </g>
    </svg>
  );
}

const STAGES = [
  { label: "Received", bg: "var(--stage-received-bg)", ink: "var(--stage-received-ink)" },
  { label: "Cutting", bg: "var(--stage-cutting-bg)", ink: "var(--stage-cutting-ink)" },
  { label: "Stitching", bg: "var(--stage-stitching-bg)", ink: "var(--stage-stitching-ink)" },
  { label: "Ready", bg: "var(--stage-ready-bg)", ink: "var(--stage-ready-ink)" },
  { label: "Delivered", bg: "var(--stage-delivered-bg)", ink: "var(--stage-delivered-ink)" },
];

/**
 * The five order stages: a dashed thread between knots that sews itself when
 * the block scrolls into view (clip reveal), knots popping in sequence.
 * Horizontal track on desktop, vertical on phones — both rendered, one shown
 * per breakpoint, same trick as the app shell.
 */
export function StageStitch() {
  return (
    <div className="bq-lp-stagewrap">
      <svg
        className="bq-lp-track bq-lp-track--h"
        width="100%"
        height="6"
        aria-hidden="true"
        focusable="false"
      >
        <line x1="0" y1="3" x2="100%" y2="3" />
      </svg>
      <svg
        className="bq-lp-track bq-lp-track--v"
        width="6"
        height="100%"
        aria-hidden="true"
        focusable="false"
      >
        <line x1="3" y1="0" x2="3" y2="100%" />
      </svg>
      <ol className="bq-lp-steps">
        {STAGES.map((s, i) => (
          <li
            key={s.label}
            className="bq-lp-step"
            style={{ transitionDelay: `${260 + i * 140}ms` }}
          >
            <span
              className="bq-lp-knot"
              style={{ background: s.bg, boxShadow: `inset 0 0 0 2px ${s.ink}` }}
              aria-hidden="true"
            />
            <span className="bq-lp-step__label">{s.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The customer's tracking view as a small floating order card, set inside a
 * dashed embroidery hoop.
 */
export function OrderCardMock() {
  return (
    <div className="bq-lp-mockwrap">
      <span className="bq-lp-hoop" aria-hidden="true" />
      <div className="bq-lp-float">
        <div className="bq-lp-mock">
          <div className="bq-lp-mock__head">
            <span className="bq-lp-mock__code">BQ-0142</span>
            <span className="bq-lp-mock__pill">Stitching</span>
          </div>
          <p className="bq-lp-mock__sub">Lehenga blouse</p>
          <div className="bq-lp-mock__progress bq-lp-grow-x" aria-hidden="true">
            <i className="is-done" />
            <i className="is-done" />
            <i className="is-done" />
            <i />
            <i />
          </div>
          <dl className="bq-lp-mock__rows">
            <div>
              <dt>Due</dt>
              <dd>14 Sep</dd>
            </div>
            <div>
              <dt>Balance</dt>
              <dd>₹2,500</dd>
            </div>
          </dl>
          <span className="bq-lp-mock__wa">Message the boutique</span>
        </div>
      </div>
    </div>
  );
}

/** Fact 1 — the measuring tape, blade sliding out of its case on reveal. */
export function MeasuringTape() {
  const ticks = Array.from({ length: 14 }, (_, i) => i);
  return (
    <svg
      className="bq-lp-tape"
      viewBox="0 0 230 76"
      aria-hidden="true"
      focusable="false"
    >
      <g className="bq-lp-tape__blade">
        <rect
          x="6"
          y="26"
          width="150"
          height="34"
          rx="7"
          fill="var(--blush-200)"
          stroke="var(--plum-700)"
          strokeWidth="2"
        />
        {ticks.map((i) => (
          <line
            key={i}
            x1={16 + i * 10}
            y1="27"
            x2={16 + i * 10}
            y2={i % 2 === 0 ? 44 : 36}
            stroke="var(--plum-700)"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.7"
          />
        ))}
        <text className="bq-lp-tape__num" x="48" y="56">
          5
        </text>
        <text className="bq-lp-tape__num" x="98" y="56">
          10
        </text>
      </g>
      <rect x="146" y="32" width="10" height="22" rx="4" fill="var(--plum-800)" />
      <g className="bq-lp-tape__case">
        <rect x="150" y="16" width="72" height="54" rx="16" fill="var(--plum-700)" />
        <circle cx="186" cy="43" r="9" fill="var(--blush-100)" />
        <circle cx="186" cy="43" r="3" fill="var(--signal-500)" />
      </g>
    </svg>
  );
}

const CAL_LOADS = [0, 1, 1, 1, 2, 3, 1, 0, 2];

/** Fact 2 — a month grid coloured by workload, cells popping in on reveal. */
export function LoadCalendar() {
  return (
    <div className="bq-lp-cal" aria-hidden="true">
      {CAL_LOADS.map((v, i) => (
        <span
          key={i}
          className={`bq-lp-cal__cell bq-lp-cal__cell--${v}`}
          style={{ transitionDelay: `${i * 60}ms` }}
        />
      ))}
    </div>
  );
}

/** Fact 3 — one order's total split into advance and balance. */
export function BalanceBar() {
  return (
    <div className="bq-lp-bal">
      <div className="bq-lp-bal__total">
        <span>Total</span>
        <strong>₹4,500</strong>
      </div>
      <div className="bq-lp-bal__bar bq-lp-grow-x" aria-hidden="true">
        <span className="is-adv" />
        <span className="is-bal" />
      </div>
      <div className="bq-lp-bal__legend">
        <span>
          <i className="bq-lp-dotmark bq-lp-dotmark--adv" />
          Advance ₹2,000
        </span>
        <span>
          <i className="bq-lp-dotmark bq-lp-dotmark--bal" />
          Balance ₹2,500
        </span>
      </div>
    </div>
  );
}

/** A slowly turning spool of thread (ambient, low-key, currentColor). */
export function Spool({ className }: { className?: string }) {
  const windings = [30, 38, 46, 54, 62, 70, 78];
  return (
    <svg
      className={"bq-lp-spool" + (className ? " " + className : "")}
      viewBox="0 0 110 120"
      aria-hidden="true"
      focusable="false"
    >
      <g className="bq-lp-spool__turn">
        <path d="M16 22 V 94" />
        <path d="M94 22 V 94" />
        <ellipse cx="55" cy="22" rx="39" ry="11" />
        <ellipse cx="55" cy="94" rx="39" ry="11" />
        {windings.map((y) => (
          <path key={y} d={`M19 ${y} Q 55 ${y + 5} 91 ${y}`} className="bq-lp-spool__thread" />
        ))}
        <path
          className="bq-lp-spool__tail"
          d="M92 66 C 108 76, 84 94, 106 112"
        />
      </g>
    </svg>
  );
}
