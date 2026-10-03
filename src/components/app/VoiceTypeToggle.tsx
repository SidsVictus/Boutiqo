"use client";

import * as React from "react";
import { Mic, Keyboard } from "./icons";
import { MEASUREMENT_FIELDS, MEASUREMENT_LABELS } from "./measurementLabels";
import { parseDictation } from "@/lib/voice/parseMeasurements";
import { pickVoiceEngine, type VoiceAvailability } from "@/lib/voice/engine";
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

const LANG = "en-IN";
// No "start" from the recognizer within this long means the mic never opened.
const START_WATCHDOG_MS = 6000;
// Stop on our own after this long without hearing a value.
const IDLE_STOP_MS = 60000;
// Recognizers end a session after a pause; restart while the user is dictating.
const MAX_RESTARTS = 40;

type VoiceState = "idle" | "starting" | "listening" | "denied" | "error";

/**
 * Real voice dictation for measurements. Tap the mic and either name them
 * ("sleeve length 14, chest 36 and a half") or just read the numbers in the
 * guide's order ("14 … 15 … 3"): each value lands in the grid below, which
 * stays visible so it can be checked and corrected.
 *
 * Recognition is native inside the Android app and the Web Speech API in a
 * browser (lib/voice/engine.ts); everything else (parsing, restarts, timeouts,
 * errors) is here and identical for both.
 */
export function VoiceMeasurementInput({ onCapture }: { onCapture: (values: Partial<Record<MeasurementField, string>>) => void }) {
  const [availability, setAvailability] = React.useState<VoiceAvailability | null>(null);
  const [state, setState] = React.useState<VoiceState>("idle");
  const [errorText, setErrorText] = React.useState("");
  const [canAskAgain, setCanAskAgain] = React.useState(true);
  const [startField, setStartField] = React.useState(0);
  const [nextIndex, setNextIndex] = React.useState(0);
  const [heard, setHeard] = React.useState("");
  const [captured, setCaptured] = React.useState<Partial<Record<MeasurementField, string>>>({});

  const onCaptureRef = React.useRef(onCapture);
  React.useEffect(() => {
    onCaptureRef.current = onCapture;
  }, [onCapture]);

  const wantRef = React.useRef(false); // the user wants to be listening
  const stateRef = React.useRef<VoiceState>("idle");
  const finalsRef = React.useRef<string[]>([]);
  const sessionStartRef = React.useRef(0);
  const restartsRef = React.useRef(0);
  const watchdogRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const engine = availability?.engine ?? null;

  const set = React.useCallback((next: VoiceState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const clearTimers = React.useCallback(() => {
    for (const r of [watchdogRef, idleRef, restartRef]) {
      if (r.current) clearTimeout(r.current);
      r.current = null;
    }
  }, []);
  const fail = React.useCallback(
    (next: "denied" | "error", text = "") => {
      wantRef.current = false;
      clearTimers();
      engine?.abort();
      setErrorText(text);
      set(next);
    },
    [engine, clearTimers, set],
  );
  const finish = React.useCallback(() => {
    wantRef.current = false;
    clearTimers();
    engine?.stop();
    set("idle");
  }, [engine, clearTimers, set]);
  const armIdle = React.useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => {
      if (wantRef.current) finish();
    }, IDLE_STOP_MS);
  }, [finish]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection must run on the client, after hydration.
    setAvailability(pickVoiceEngine());
  }, []);

  React.useEffect(() => {
    if (!engine) return;
    const off = engine.subscribe((e) => {
      if (e.type === "start" || e.type === "audiostart") {
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
        if (wantRef.current) set("listening");
        return;
      }
      if (e.type === "result") {
        if (watchdogRef.current) clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
        if (stateRef.current === "starting") set("listening");
        const text = e.transcript.trim();
        if (e.isFinal && text) {
          finalsRef.current.push(text);
          armIdle();
          const { values, nextIndex: next } = parseDictation(finalsRef.current.join(" "), sessionStartRef.current);
          setNextIndex(next);
          if (Object.keys(values).length) {
            setCaptured(values);
            onCaptureRef.current(values);
          }
        }
        setHeard([...finalsRef.current, e.isFinal ? "" : text].join(" ").trim());
        return;
      }
      if (e.type === "error") {
        switch (e.code) {
          case "not-allowed":
            setCanAskAgain(e.canAskAgain !== false);
            fail("denied");
            return;
          case "service-not-allowed":
          case "language-not-supported":
            fail("error", e.message || "Speech recognition isn't available on this device. Use the keyboard's microphone instead.");
            return;
          case "network":
            fail("error", "Voice input needs an internet connection. Check your connection and tap the mic again.");
            return;
          case "audio-capture":
            fail("error", "The microphone is busy or unavailable. Close other apps using it and try again.");
            return;
          default:
            // no-speech, speech-timeout, aborted, busy, client: the session
            // just ended; "end" restarts it while the user is dictating.
            return;
        }
      }
      if (e.type === "end") {
        if (wantRef.current && restartsRef.current < MAX_RESTARTS) {
          restartsRef.current += 1;
          restartRef.current = setTimeout(() => {
            if (wantRef.current) engine.start(LANG);
          }, 250);
        } else if (stateRef.current === "listening" || stateRef.current === "starting") {
          wantRef.current = false;
          clearTimers();
          set("idle");
        }
      }
    });
    return () => {
      off();
      wantRef.current = false;
      clearTimers();
      engine.abort();
    };
  }, [engine, armIdle, fail, clearTimers, set]);

  function start() {
    if (!engine) return;
    wantRef.current = true;
    restartsRef.current = 0;
    finalsRef.current = [];
    sessionStartRef.current = startField;
    setNextIndex(startField);
    setHeard("");
    setCaptured({});
    setErrorText("");
    set("starting");
    clearTimers();
    watchdogRef.current = setTimeout(() => {
      if (stateRef.current === "starting") fail("error", "The microphone didn't start. Check that no other app is using it, then tap the mic again.");
    }, START_WATCHDOG_MS);
    armIdle();
    engine.start(LANG);
  }

  const capturedList = Object.entries(captured) as [MeasurementField, string][];

  if (availability && !engine) {
    return (
      <div className="bq-voice-panel" role="status">
        <div className="bq-voice-mic" aria-hidden="true">
          <Mic size={26} />
        </div>
        <div className="bq-voice-panel__title">Voice input isn&apos;t available here</div>
        <p className="bq-voice-panel__hint">
          {availability.reason === "update-app" ? (
            <>
              Install the latest Boutiqo app to dictate measurements. For now, tap a measurement below and use the <strong>microphone on your keyboard</strong>.
            </>
          ) : (
            <>
              Tap any measurement below, then tap the <strong>microphone on your keyboard</strong> and say the number. (Built-in voice input works in Chrome.)
            </>
          )}
        </p>
      </div>
    );
  }

  const active = state === "listening" || state === "starting";
  const listening = state === "listening";
  const nextLabel = nextIndex < MEASUREMENT_FIELDS.length ? MEASUREMENT_LABELS[MEASUREMENT_FIELDS[nextIndex]] : null;
  return (
    <div className="bq-voice-panel">
      <button
        type="button"
        className="bq-voice-mic"
        data-listening={listening}
        data-starting={state === "starting" ? "true" : undefined}
        onClick={active ? finish : start}
        disabled={!availability}
        aria-pressed={active}
        aria-label={active ? "Stop listening" : "Start voice input"}
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
        ) : state === "starting" ? (
          "Starting the microphone…"
        ) : state === "denied" ? (
          "Microphone permission is blocked"
        ) : state === "error" ? (
          "Voice input stopped"
        ) : (
          "Tap the mic and speak"
        )}
      </div>
      <p className="bq-voice-panel__hint">
        {state === "denied"
          ? engine?.kind === "native"
            ? canAskAgain
              ? "Tap the mic again and choose Allow."
              : "Turn on Microphone for Boutiqo in your phone's settings, then tap the mic again."
            : "Allow microphone access for this site in your browser settings, then tap the mic again."
          : state === "error"
            ? errorText
            : listening && nextLabel
              ? `Say the measurements, or just the number for ${nextLabel.n}. ${nextLabel.label}. Tap the mic when you're done.`
              : listening
                ? "All 14 filled. Tap the mic when you're done."
                : 'Name them ("sleeve length 14, chest 36 and a half") or read the numbers in order.'}
      </p>
      {state === "denied" && engine?.kind === "native" && !canAskAgain && engine.openSettings ? (
        <button type="button" className="bq-link-btn" onClick={() => engine.openSettings?.()}>
          Open phone settings
        </button>
      ) : null}
      {!active ? (
        <label className="bq-voice-panel__start">
          <span>Numbers start at</span>
          <select value={startField} onChange={(e) => setStartField(Number(e.target.value))} aria-label="Numbers start at">
            {MEASUREMENT_FIELDS.map((f, i) => (
              <option key={f} value={i}>
                {MEASUREMENT_LABELS[f].n}. {MEASUREMENT_LABELS[f].label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
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
