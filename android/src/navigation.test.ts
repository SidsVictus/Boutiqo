/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveWebAppConfig } from "./config.ts";
import { classifyNavigation, redactUrl } from "./navigation.ts";

const APP = "https://boutiqoo.netlify.app";

test("app pages stay inside the WebView", () => {
  assert.deepEqual(classifyNavigation(`${APP}/owner/dashboard`, APP), { kind: "internal" });
  assert.deepEqual(classifyNavigation(`${APP}/track/abc?x=1#y`, APP), { kind: "internal" });
  assert.deepEqual(classifyNavigation("about:blank", APP), { kind: "internal" });
  assert.deepEqual(classifyNavigation(`blob:${APP}/5f1c`, APP), { kind: "internal" });
});

test("look-alike hosts and other origins leave the app", () => {
  for (const url of ["https://boutiqoo.netlify.app.evil.com/", "http://boutiqoo.netlify.app/", "https://evil.com/?u=https://boutiqoo.netlify.app", "https://www.youtube.com/watch?v=1"]) {
    assert.equal(classifyNavigation(url, APP).kind, "external", url);
  }
});

test("device schemes go to Android, dangerous ones are blocked", () => {
  for (const url of ["https://wa.me/919999999999?text=hi", "whatsapp://send?phone=91", "tel:+919999999999", "mailto:a@b.co", "sms:+91", "geo:17.3,78.4", "upi://pay?pa=x@y"]) {
    assert.deepEqual(classifyNavigation(url, APP), { kind: "external", url }, url);
  }
  for (const url of ["javascript:alert(1)", "file:///sdcard/x", "content://x/y", "myapp://x", "not a url"]) {
    assert.deepEqual(classifyNavigation(url, APP), { kind: "block" }, url);
  }
});

test("intent: links use their https fallback or are blocked", () => {
  const fallback = encodeURIComponent("https://example.com/page");
  assert.deepEqual(classifyNavigation(`intent://x#Intent;scheme=foo;S.browser_fallback_url=${fallback};end`, APP), { kind: "external", url: "https://example.com/page" });
  assert.deepEqual(classifyNavigation(`intent://x#Intent;S.browser_fallback_url=${encodeURIComponent("javascript:alert(1)")};end`, APP), { kind: "block" });
  assert.deepEqual(classifyNavigation("intent://x#Intent;scheme=foo;end", APP), { kind: "block" });
});

test("redactUrl drops query strings and tracking tokens", () => {
  assert.equal(redactUrl(`${APP}/owner/orders/1?code=secret#frag`), `${APP}/owner/orders/1`);
  assert.equal(redactUrl(`${APP}/track/tok_123/extra`), `${APP}/track/<token>/extra`);
});

test("config: production defaults, https enforced outside development", () => {
  assert.deepEqual(resolveWebAppConfig(undefined, false), { ok: true, url: APP, origin: APP });
  assert.deepEqual(resolveWebAppConfig(" https://x.example.com/ ", false), { ok: true, url: "https://x.example.com", origin: "https://x.example.com" });
  assert.equal(resolveWebAppConfig("http://192.168.1.20:3000", false).ok, false);
  assert.deepEqual(resolveWebAppConfig("http://192.168.1.20:3000", true), { ok: true, url: "http://192.168.1.20:3000", origin: "http://192.168.1.20:3000" });
  assert.equal(resolveWebAppConfig("nope", true).ok, false);
});
