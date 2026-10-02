"use client";

import * as React from "react";
import { Mic, Keyboard } from "./icons";
import { MEASUREMENT_LABELS } from "./measurementLabels";
import { parseMeasurements } from "@/lib/voice/parseMeasurements";
import type { MeasurementField } from "@/lib/supabase/types";

/** Voice / type segmented toggle for the measurements step. */
export function VoiceTypeToggle({ mode, onChange }: { mode: "voice" | "text"; onChange: (mode: "voice" | "text") => void }) {
  return (
    <div className="bq-voice-toggle" role="tablist" aria-label="Input mode">
      <button type="button" className="bq-voice-toggle__opt" aria-pressed={mode === "voice"} onClick={() => onChange("voice")}>
        <Mic size={16} style={{ marginRight: 6, verticalAlign: -3 }} />
        Voice
      </button>
      <button type="button" className="bq-voice-toggle__opt" aria-pressed={mode === "text"} onClick={() => onChange("text")}>
        <Keyboard size={16} style={{ marginRight: 6, verticalAlign: -3 }} />
        Type
      </button>
    </div>
  );
}

// The Web Speech API (Chrome/Edge/Samsung Internet; not in Android's in-app
// WebView or Firefox). Typed loosely: it isn't in TypeScript's DOM lib.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
function getRecognition(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type VoiceState = "idle" | "listening" | "unsupported" | "denied" | "error";

/**
 * Real voice dictation for measurements: tap the mic, say e.g. "sleeve length
 * 14, chest 36 and a half", and each recognised value is filled into the
 * grid below (which stays visible, so you see exactly what was captured).
 * While listening the mic pulses and shows what it hears.
 */
export function VoiceMeasurementInput({ onCapture }: { onCapture: (values: Partial<Record<MeasurementField, string>>) => void }) {
  const [state, setState] = React.useState<VoiceState>("idle");
  const [heard, setHeard] = React.useState("");
  const [captured, setCaptured] = React.useState<Partial<Record<MeasurementField, string>>>({});
  const recRef = React.useRef<Recognition | null>(null);
  const finalText = React.useRef("");
  const onCaptureRef = React.useRef(onCapture);
  React.useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection runs once on the client.
    if (!getRecognition()) setState("unsupported");
    return () => recRef.current?.abort();
  }, []);

  function start() {
    const Ctor = getRecognition();
    if (!Ctor) {
      setState("unsupported");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.continuous = true;
    rec.interimResults = true;
    finalText.current = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText.current += ` ${r[0].transcript}`;
        else interim += ` ${r[0].transcript}`;
      }
      setHeard(`${finalText.current} ${interim}`.trim());
      const values = parseMeasurements(finalText.current);
      if (Object.keys(values).length) {
        setCaptured(values);
        onCaptureRef.current(values);
      }
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setState(e.error === "service-not-allowed" ? "unsupported" : "denied");
      else if (e.error !== "no-speech" && e.error !== "aborted") setState("error");
    };
    rec.onend = () => setState((s) => (s === "listening" ? "idle" : s));
    recRef.current = rec;
    setHeard("");
    setCaptured({});
    try {
      rec.start();
      setState("listening");
    } catch {
      setState("error");
    }
  }

  function stop() {
    recRef.current?.stop();
    setState("idle");
  }

  const capturedList = Object.entries(captured) as [MeasurementField, string][];

  if (state === "unsupported") {
    return (
      <div className="bq-voice-panel" role="status">
        <div className="bq-voice-mic" aria-hidden="true">
          <Mic size={26} />
        </div>
        <div className="bq-voice-panel__title">Voice input isn&apos;t available here</div>
        <p className="bq-voice-panel__hint">
          Tap any measurement below, then tap the <strong>microphone on your keyboard</strong> and say the number. (Built-in voice input works in Chrome.)
        </p>
      </div>
    );
  }

  const listening = state === "listening";
  return (
    <div className="bq-voice-panel">
      <button
        type="button"
        className="bq-voice-mic"
        data-listening={listening}
        onClick={listening ? stop : start}
        aria-pressed={listening}
        aria-label={listening ? "Stop listening" : "Start voice input"}
      >
        {listening ? (
          <>
            <span className="bq-voice-mic__ring" />
            <span className="bq-voice-mic__ring bq-voice-mic__ring--2" />
          </>
        ) : null}
        <Mic size={28} />
      </button>
      <div className="bq-voice-panel__title" aria-live="polite">
        {listening ? (
          <>
            Listening
            <span className="bq-voice-bars" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
          </>
        ) : state === "denied" ? (
          "Microphone permission is blocked"
        ) : state === "error" ? (
          "Couldn't hear that. Tap to try again"
        ) : (
          "Tap the mic and speak"
        )}
      </div>
      <p className="bq-voice-panel__hint">
        {state === "denied"
          ? "Allow microphone access for this site in your browser settings, then tap the mic again."
          : listening
            ? "Tap the mic again when you're done."
            : 'e.g. "Sleeve length 14, chest 36 and a half, waist 30"'}
      </p>
      {heard ? <p className="bq-voice-panel__heard">&ldquo;{heard}&rdquo;</p> : null}
      {capturedList.length ? (
        <ul className="bq-voice-panel__captured" aria-label="Captured measurements">
          {capturedList.map(([field, value]) => (
            <li key={field}>
              {MEASUREMENT_LABELS[field].label}: <strong className="bq-num">{value}</strong>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
