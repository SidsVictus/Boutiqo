import { test } from "node:test";
import assert from "node:assert/strict";
import { insetsScript, parseStatusBarRequest } from "./edge.ts";

const APP = "https://boutiqoo.netlify.app";

test("passes rounded, non-negative insets to the page", () => {
  const js = insetsScript({ top: 24.6, bottom: -3 });
  assert.ok(js.includes('"--bq-shell-inset-top","25px"'));
  assert.ok(js.includes('"--bq-shell-inset-bottom","0px"'));
});

test("status bar style only from the web app's own pages", () => {
  const msg = JSON.stringify({ type: "boutiqo:statusbar", style: "light" });
  assert.equal(parseStatusBarRequest(msg, `${APP}/owner/login`, APP), "light");
  assert.equal(parseStatusBarRequest(msg, "https://evil.example/", APP), null);
  assert.equal(parseStatusBarRequest(JSON.stringify({ type: "boutiqo:statusbar", style: "neon" }), APP, APP), null);
  assert.equal(parseStatusBarRequest("nope", APP, APP), null);
});
