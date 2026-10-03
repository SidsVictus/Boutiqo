import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVoiceCommand, recognitionOptions, voiceEventScript } from "./voice.ts";

const APP = "https://boutiqoo.netlify.app";

test("accepts voice commands only from the web app's own pages", () => {
  const start = JSON.stringify({ type: "boutiqo:voice", action: "start", lang: "en-IN" });
  assert.deepEqual(parseVoiceCommand(start, `${APP}/owner/orders/new`, APP), { action: "start", lang: "en-IN" });
  assert.equal(parseVoiceCommand(start, "https://evil.example/x", APP), null);
  assert.equal(parseVoiceCommand(start, "https://boutiqoo.netlify.app.evil.example/", APP), null);
});

test("validates actions and language", () => {
  const msg = (o: object) => JSON.stringify({ type: "boutiqo:voice", ...o });
  assert.deepEqual(parseVoiceCommand(msg({ action: "stop" }), APP, APP), { action: "stop" });
  assert.deepEqual(parseVoiceCommand(msg({ action: "open-settings" }), APP, APP), { action: "open-settings" });
  assert.deepEqual(parseVoiceCommand(msg({ action: "start", lang: "en-IN'); alert(1);//" }), APP, APP), { action: "start", lang: "en-IN" });
  assert.equal(parseVoiceCommand(msg({ action: "record-forever" }), APP, APP), null);
  assert.equal(parseVoiceCommand("not json", APP, APP), null);
  assert.equal(parseVoiceCommand(JSON.stringify({ type: "boutiqo:oauth", url: "x" }), APP, APP), null);
});

test("event script safely embeds recognizer text", () => {
  const script = voiceEventScript({ type: "result", transcript: '"); alert(1); ("', isFinal: true });
  assert.ok(script.startsWith('window.dispatchEvent(new CustomEvent("boutiqo:voice",{detail:{"type":"result","transcript":"\\"); alert(1); (\\"",'));
});

test("recognizer listens continuously with interim results", () => {
  const o = recognitionOptions("en-IN");
  assert.equal(o.continuous, true);
  assert.equal(o.interimResults, true);
  assert.equal(o.lang, "en-IN");
});
