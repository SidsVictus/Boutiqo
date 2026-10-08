"use client";

import * as React from "react";
import splashIcon from "../../../android/assets/splash-icon.png";
import { PAD, PLUM, QR_TOTAL, QUIET, startScene } from "./qr-fx";
import { QR_ROWS, QR_SIZE } from "./qr-matrix";

function buildPath(): string {
  let d = "";
  for (let y = 0; y < QR_SIZE; y++) {
    const row = QR_ROWS[y];
    for (let x = 0; x < QR_SIZE; ) {
      if (row[x] === "1") {
        let len = 1;
        while (x + len < QR_SIZE && row[x + len] === "1") len++;
        d += `M${x + QUIET} ${y + QUIET + 0.5}h${len}`;
        x += len;
      } else {
        x++;
      }
    }
  }
  return d;
}

const PATH = buildPath();

/**
 * Download-card visual — the EC-H QR of the download URL as a full
 * three.js scene: a slow vortex assembly where every tile spirals in
 * from a swirling shell over ~3s (radius, angle and depth all animating)
 * with velocity streaks, tumble and white-hot → red → plum heat, snapping
 * into a place centre-first. From ~3.3s the code is completely pristine and
 * still — no effects of any kind — until the same spiral plays backwards
 * to dissolve it at 7s (full loop 8s). Signal-red dust + bokeh drift
 * left to right; the camera only moves for pointer parallax. Static SVG
 * underneath is the fallback (reduced motion / no WebGL).
 */
export function QrCode({ className }: { className?: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    if (!canvas || !stage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const THREE = await import("three");
        if (disposed) return;
        cleanup = startScene(THREE, canvas, stage);
      } catch {
        /* card stays on the static SVG */
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  const stageClass = className ? `${className} bq-lp-qrstage` : "bq-lp-qrstage";

  return (
    <div className={stageClass} role="img" aria-label="QR code to download the Boutiqo app">
      <svg
        className="bq-lp-qr__svg"
        viewBox={`${-PAD} ${-PAD} ${QR_TOTAL + PAD * 2} ${QR_TOTAL + PAD * 2}`}
        aria-hidden="true"
        focusable="false"
      >
        <path stroke={PLUM} shapeRendering="crispEdges" d={PATH} />
      </svg>
      <canvas className="bq-lp-qr__fx" ref={canvasRef} aria-hidden="true" />
      <span
        className="bq-lp-qr__logo"
        aria-hidden="true"
        style={{ backgroundImage: `url(${splashIcon.src})` }}
      />
    </div>
  );
}
