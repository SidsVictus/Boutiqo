/**
 * Where speech recognition comes from, behind one small interface:
 *  - "native": inside the Boutiqo Android app, Android's own recognizer via
 *    the shell (android/src/voice.ts). Android's WebView has a
 *    webkitSpeechRecognition object but it never returns results, so it is
 *    never used there.
 *  - "web": the Web Speech API in a real browser (Chrome, Edge, Samsung
 *    Internet, Safari).
 * Both report the same events: "result" with isFinal=true appends a finished
 * phrase; isFinal=false replaces the phrase still being heard.
 */
export type VoiceEngineEvent =
  | { type: "start" }
  | { type: "audiostart" }
  | { type: "result"; transcript: string; isFinal: boolean }
  | { type: "error"; code: string; message?: string; canAskAgain?: boolean }
  | { type: "end" };

export interface VoiceEngine {
  kind: "native" | "web";
  start(lang: string): void;
  stop(): void;
  abort(): void;
  /** Opens the phone's app settings (native only), to re-allow the mic. */
  openSettings?: () => void;
  subscribe(listener: (e: VoiceEngineEvent) => void): () => void;
}

export type VoiceAvailability = { engine: VoiceEngine; reason?: undefined } | { engine: null; reason: "update-app" | "unsupported" };

const VOICE_EVENT = "boutiqo:voice";

function inAndroidShell(): boolean {
  return typeof window !== "undefined" && !!window.ReactNativeWebView && (!!window.BoutiqoShell || /BoutiqoAndroid\//.test(navigator.userAgent));
}

function nativeEngine(): VoiceEngine {
  const post = (action: string, extra: Record<string, unknown> = {}) =>
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: VOICE_EVENT, action, ...extra }));
  return {
    kind: "native",
    start: (lang) => post("start", { lang }),
    stop: () => post("stop"),
    abort: () => post("abort"),
    openSettings: () => post("open-settings"),
    subscribe(listener) {
      const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail as VoiceEngineEvent | undefined;
        if (detail && typeof detail === "object" && typeof detail.type === "string") listener(detail);
      };
      window.addEventListener(VOICE_EVENT, handler);
      return () => window.removeEventListener(VOICE_EVENT, handler);
    },
  };
}

// Typed loosely: the Web Speech API isn't in TypeScript's DOM lib.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

export function webSpeechCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function webEngine(Ctor: RecognitionCtor): VoiceEngine {
  const listeners = new Set<(e: VoiceEngineEvent) => void>();
  const emit = (e: VoiceEngineEvent) => listeners.forEach((l) => l(e));
  let rec: Recognition | null = null;
  return {
    kind: "web",
    start(lang) {
      rec?.abort();
      const r = new Ctor();
      r.lang = lang;
      r.continuous = true;
      r.interimResults = true;
      r.maxAlternatives = 1;
      r.onstart = () => emit({ type: "start" });
      r.onaudiostart = () => emit({ type: "audiostart" });
      r.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) emit({ type: "result", transcript: res[0].transcript, isFinal: true });
          else interim += res[0].transcript;
        }
        emit({ type: "result", transcript: interim, isFinal: false });
      };
      r.onerror = (e) => emit({ type: "error", code: e.error, message: e.message });
      r.onend = () => {
        if (rec === r) rec = null;
        emit({ type: "end" });
      };
      rec = r;
      try {
        r.start();
      } catch {
        emit({ type: "error", code: "busy" });
        emit({ type: "end" });
      }
    },
    stop: () => rec?.stop(),
    abort: () => rec?.abort(),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The best engine for where the page is running, or why there is none. */
export function pickVoiceEngine(): VoiceAvailability {
  if (typeof window === "undefined") return { engine: null, reason: "unsupported" };
  if (inAndroidShell()) return window.BoutiqoShell?.voice ? { engine: nativeEngine() } : { engine: null, reason: "update-app" };
  const Ctor = webSpeechCtor();
  return Ctor ? { engine: webEngine(Ctor) } : { engine: null, reason: "unsupported" };
}
