/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { appReturnUrl, bridgeScript, callbackUrlFor, isSupabaseAuthorizeUrl, parseOAuthRequest, withAppRedirect } from "./oauth.ts";

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

test("recognises the Supabase authorize URL and points its redirect at the app", () => {
  assert.equal(isSupabaseAuthorizeUrl(AUTHORIZE), true);
  assert.equal(isSupabaseAuthorizeUrl("https://abc.supabase.co/auth/v1/token"), false);
  assert.equal(isSupabaseAuthorizeUrl("https://accounts.google.com/o/oauth2/auth"), false);
  const webRedirect = "https://abc.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fboutiqoo.netlify.app%2Fauth%2Fcallback&code_challenge=x&code_challenge_method=s256";
  const rewritten = new URL(withAppRedirect(webRedirect, "exp://192.168.1.2:8081/--/auth-callback"));
  assert.equal(rewritten.searchParams.get("redirect_to"), "exp://192.168.1.2:8081/--/auth-callback");
  assert.equal(rewritten.searchParams.get("code_challenge"), "x");
  assert.equal(rewritten.searchParams.get("provider"), "google");
});

test("returns via the web hand-off route, which carries the app URL", () => {
  assert.equal(appReturnUrl(APP, "exp://192.168.1.3:8081/--/auth-callback"), `${APP}/auth/app-callback?app=exp%3A%2F%2F192.168.1.3%3A8081%2F--%2Fauth-callback`);
  const rewritten = new URL(withAppRedirect(AUTHORIZE, appReturnUrl(APP, "boutiqo://auth-callback")));
  assert.equal(rewritten.searchParams.get("redirect_to"), `${APP}/auth/app-callback?app=boutiqo%3A%2F%2Fauth-callback`);
});
