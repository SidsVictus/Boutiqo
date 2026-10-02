/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { bridgeScript, callbackUrlFor, parseOAuthRequest } from "./oauth.ts";

const APP = "https://boutiqoo.netlify.app";
const AUTHORIZE = "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=boutiqo%3A%2F%2Fauth-callback&code_challenge=x";
const msg = (o: unknown) => JSON.stringify(o);

test("accepts a sign-in request from an app page", () => {
  assert.equal(parseOAuthRequest(msg({ type: "boutiqo:oauth", url: AUTHORIZE }), `${APP}/owner/signup`, APP), AUTHORIZE);
});

test("rejects requests from other pages, other message types and non-authorize URLs", () => {
  assert.equal(parseOAuthRequest(msg({ type: "boutiqo:oauth", url: AUTHORIZE }), "https://evil.example/", APP), null);
  assert.equal(parseOAuthRequest(msg({ type: "boutiqo:oauth", url: AUTHORIZE }), "https://boutiqoo.netlify.app.evil.example/", APP), null);
  assert.equal(parseOAuthRequest(msg({ type: "other", url: AUTHORIZE }), APP, APP), null);
  assert.equal(parseOAuthRequest(msg({ type: "boutiqo:oauth", url: "https://evil.example/phish" }), APP, APP), null);
  assert.equal(parseOAuthRequest(msg({ type: "boutiqo:oauth", url: "http://abc.supabase.co/auth/v1/authorize" }), APP, APP), null);
  assert.equal(parseOAuthRequest(msg({ type: "boutiqo:oauth", url: "javascript:alert(1)" }), APP, APP), null);
  assert.equal(parseOAuthRequest("not json", APP, APP), null);
  assert.equal(parseOAuthRequest("null", APP, APP), null);
});

test("hands the code to the web callback, errors to the login page", () => {
  assert.equal(callbackUrlFor("boutiqo://auth-callback?code=a%2Fb", APP), `${APP}/auth/callback?code=a%2Fb`);
  assert.equal(callbackUrlFor("exp://192.168.1.2:8081/--/auth-callback?code=xyz", APP), `${APP}/auth/callback?code=xyz`);
  assert.equal(callbackUrlFor("boutiqo://auth-callback#error=access_denied", APP), `${APP}/owner/login?error=oauth`);
  assert.equal(callbackUrlFor("boutiqo://auth-callback?code=x&error=server_error", APP), `${APP}/owner/login?error=oauth`);
  assert.equal(callbackUrlFor("boutiqo://auth-callback", APP), `${APP}/owner/login?error=oauth`);
  assert.equal(callbackUrlFor("::bad", APP), `${APP}/owner/login?error=oauth`);
});

test("bridge script exposes the redirect URL as a safely quoted literal", () => {
  assert.equal(bridgeScript('boutiqo://x"; alert(1); "'), 'window.BoutiqoShell = Object.freeze({ oauthRedirectUrl: "boutiqo://x\\"; alert(1); \\"" }); true;');
});
