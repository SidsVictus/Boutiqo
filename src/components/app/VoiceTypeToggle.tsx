"use client";

import { Mic, Keyboard } from "./icons";

/** Visual-only voice/type segmented toggle. No real speech recognition is
 * wired up — an explicit caveat in CLAUDE_CODE_HANDOFF.md §5/§7 ("voice input
 * is a visual state only"). Selecting "Voice" shows the listening disc; it
 * does not capture audio. */
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

export function VoiceListeningDisc() {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="bq-voice-disc">
        <Mic size={28} />
      </div>
      <div className="bq-brand" style={{ fontSize: 19 }}>
        Listening
      </div>
    </div>
  );
}
