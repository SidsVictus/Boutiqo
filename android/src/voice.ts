/**
 * Voice input bridge between the web app and Android's own speech recognizer
 * (expo-speech-recognition → android.speech.SpeechRecognizer).
 *
 * Why native: Android's WebView exposes webkitSpeechRecognition but it never
 * delivers results (there is no recognition service behind it), so the web
 * app's mic did nothing inside the app. The shell does the recognition and
 * streams text back; the web app still owns all parsing and UI. No audio is
 * stored or sent anywhere by the shell.
 *
 * Web → shell (window.ReactNativeWebView.postMessage, JSON):
 *   { type: "boutiqo:voice", action: "start", lang?: "en-IN" }
 *   { type: "boutiqo:voice", action: "stop" | "abort" | "open-settings" }
 * Shell → web: a "boutiqo:voice" CustomEvent on window whose detail is a
 * VoiceEvent (below).
 */
export const VOICE_MESSAGE_TYPE = "boutiqo:voice";

export type VoiceAction = "start" | "stop" | "abort" | "open-settings";

export type VoiceCommand = { action: "start"; lang: string } | { action: Exclude<VoiceAction, "start"> };

export type VoiceEvent =
  | { type: "start" }
  | { type: "audiostart" }
  | { type: "result"; transcript: string; isFinal: boolean }
  | { type: "error"; code: string; message: string; canAskAgain?: boolean }
  | { type: "end" };

const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

/** A voice command sent by a page of the web app itself, or null. */
export function parseVoiceCommand(data: string, senderUrl: string, appOrigin: string): VoiceCommand | null {
  if (senderUrl !== appOrigin && !senderUrl.startsWith(`${appOrigin}/`)) return null;
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return null;
  }
  if (!message || typeof message !== "object") return null;
  const { type, action, lang } = message as { type?: unknown; action?: unknown; lang?: unknown };
  if (type !== VOICE_MESSAGE_TYPE) return null;
  if (action === "start") return { action, lang: typeof lang === "string" && LANG_RE.test(lang) ? lang : "en-IN" };
  if (action === "stop" || action === "abort" || action === "open-settings") return { action };
  return null;
}

/** JS to run in the page to deliver one event to the web app. */
export function voiceEventScript(event: VoiceEvent): string {
  return `window.dispatchEvent(new CustomEvent(${JSON.stringify(VOICE_MESSAGE_TYPE)},{detail:${JSON.stringify(event)}}));true;`;
}

/** Recognizer options tuned for dictating short numbers with pauses. */
export function recognitionOptions(lang: string) {
  return {
    lang,
    interimResults: true,
    // Android 13+ keeps listening across pauses; older versions end after a
    // pause and the web app simply starts again while the user is dictating.
    continuous: true,
    maxAlternatives: 1,
    addsPunctuation: false,
    androidIntentOptions: {
      EXTRA_LANGUAGE_MODEL: "free_form",
      // Give the tailor time to read the tape between values.
      EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
      EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 3000,
    },
  } as const;
}
