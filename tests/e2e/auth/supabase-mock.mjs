// Minimal in-memory stand-in for the parts of Supabase Auth (GoTrue) and
// PostgREST that the sign-in flows use, so tests/e2e/auth can exercise the
// real app + real supabase-js end to end without network access.
//
// Not a general Supabase emulator: only the endpoints/behaviours the auth
// pages hit, modelled on the real API's request/response shapes (PKCE codes,
// email links via /verify, Google OAuth via /authorize, error codes such as
// email_not_confirmed and same_password).
//
// Test-only control endpoints live under /__mock/ (reset, config, seed, outbox).
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_SUPABASE_PORT || 54321);
const BASE = `http://127.0.0.1:${PORT}`;

let state;
function reset() {
  state = {
    config: { confirmEmail: false, googleEnabled: true, googleUser: { email: "priya.google@gmail.com", name: "Priya Sharma" }, googleCancel: false },
    users: new Map(), // email -> user
    tokens: new Map(), // access/refresh token -> user id
    codes: new Map(), // pkce auth code -> { userId, challenge, used }
    emailTokens: new Map(), // email-link token -> { userId, type, challenge, redirectTo }
    outbox: [], // { to, type, link }
    tables: { boutiques: [], admins: [] },
  };
}
reset();

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const s256 = (verifier) => b64url(createHash("sha256").update(verifier).digest());

function makeUser({ email, password = null, confirmed = true, name, provider = "email" }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    password,
    email_confirmed_at: confirmed ? now : null,
    confirmed_at: confirmed ? now : null,
    app_metadata: { provider, providers: [provider] },
    user_metadata: name ? { full_name: name, name, email } : {},
    identities: [{ id: randomUUID(), user_id: id, identity_id: randomUUID(), provider, identity_data: { email, sub: id } }],
    created_at: now,
    updated_at: now,
  };
  state.users.set(email.toLowerCase(), user);
  return user;
}

const publicUser = (u) => {
  const rest = { ...u };
  delete rest.password;
  return rest;
};
const userById = (id) => [...state.users.values()].find((u) => u.id === id);

function issueSession(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = { sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", exp, iat: exp - 3600, session_id: randomUUID() };
  const access = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.${b64url(randomBytes(16))}`;
  const refresh = b64url(randomBytes(16));
  state.tokens.set(access, user.id);
  state.tokens.set(`refresh:${refresh}`, user.id);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: refresh, user: publicUser(user) };
}

function newCode(userId, challenge) {
  const code = randomUUID();
  state.codes.set(code, { userId, challenge, used: false });
  return code;
}

function withParams(url, params) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

function sendEmail(user, type, challenge, redirectTo) {
  const token = b64url(randomBytes(12));
  state.emailTokens.set(token, { userId: user.id, type, challenge, redirectTo });
  const link = `${BASE}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${encodeURIComponent(redirectTo || "")}`;
  state.outbox.push({ to: user.email, type, link, tokenHash: token });
}

const authError = (res, status, code, msg) => json(res, status, { code: status, error_code: code, msg });

function json(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...cors(), ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,prefer,accept,accept-profile,content-profile,x-client-info,x-supabase-api-version,range",
    "Access-Control-Expose-Headers": "content-range,x-supabase-api-version",
  };
}

const bearerUser = (req) => {
  const token = (req.headers.authorization || "").replace(/^Bearer /i, "");
  const id = state.tokens.get(token);
  return id ? userById(id) : null;
};
const isServiceRole = (req) => (req.headers.authorization || "").endsWith(" service-role-key");

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

async function handleAuth(req, res, url, path) {
  const body = req.method === "GET" ? {} : await readBody(req);
  const q = url.searchParams;

  if (path === "/signup" && req.method === "POST") {
    const email = String(body.email || "").toLowerCase();
    if (!email || !body.password) return authError(res, 400, "validation_failed", "Signup requires a valid password");
    if (String(body.password).length < 6) return authError(res, 422, "weak_password", "Password should be at least 6 characters.");
    const existing = state.users.get(email);
    if (existing) {
      // Real GoTrue: with confirmations on, an obfuscated user (no identities) instead of an error.
      if (state.config.confirmEmail) return json(res, 200, { ...publicUser(existing), id: randomUUID(), identities: [] });
      return authError(res, 422, "user_already_exists", "User already registered");
    }
    const user = makeUser({ email, password: body.password, confirmed: !state.config.confirmEmail });
    if (state.config.confirmEmail) {
      sendEmail(user, "signup", body.code_challenge, q.get("redirect_to"));
      return json(res, 200, publicUser(user));
    }
    return json(res, 200, issueSession(user));
  }

  if (path === "/token" && req.method === "POST") {
    const grant = q.get("grant_type");
    if (grant === "password") {
      const user = state.users.get(String(body.email || "").toLowerCase());
      if (!user || user.password !== body.password) return json(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      if (!user.email_confirmed_at) return json(res, 400, { code: 400, error_code: "email_not_confirmed", msg: "Email not confirmed" });
      return json(res, 200, issueSession(user));
    }
    if (grant === "pkce") {
      const entry = state.codes.get(body.auth_code);
      if (!entry || entry.used) return authError(res, 404, "flow_state_not_found", "invalid flow state, no valid flow state found");
      if (!entry.challenge || s256(String(body.code_verifier || "")) !== entry.challenge) return authError(res, 400, "bad_code_verifier", "code challenge does not match previously saved code verifier");
      entry.used = true;
      return json(res, 200, issueSession(userById(entry.userId)));
    }
    if (grant === "refresh_token") {
      const id = state.tokens.get(`refresh:${body.refresh_token}`);
      if (!id) return authError(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      return json(res, 200, issueSession(userById(id)));
    }
    return authError(res, 400, "unsupported_grant_type", "unsupported grant type");
  }

  if (path === "/user" && req.method === "GET") {
    const user = bearerUser(req);
    if (!user) return authError(res, 403, "bad_jwt", "invalid JWT");
    return json(res, 200, publicUser(user));
  }

  if (path === "/user" && req.method === "PUT") {
    const user = bearerUser(req);
    if (!user) return authError(res, 401, "no_authorization", "This endpoint requires a valid Bearer token");
    if (body.password) {
      if (body.password === user.password) return authError(res, 422, "same_password", "New password should be different from the old password.");
      if (String(body.password).length < 6) return authError(res, 422, "weak_password", "Password should be at least 6 characters.");
      user.password = body.password;
    }
    return json(res, 200, publicUser(user));
  }

  if (path === "/recover" && req.method === "POST") {
    const user = state.users.get(String(body.email || "").toLowerCase());
    if (user) sendEmail(user, "recovery", body.code_challenge, q.get("redirect_to"));
    return json(res, 200, {});
  }

  if (path === "/verify" && req.method === "GET") {
    const entry = state.emailTokens.get(q.get("token"));
    const redirectTo = q.get("redirect_to");
    // Like GoTrue: errors and implicit-flow sessions go in the URL fragment;
    // PKCE requests (made with a code_challenge) get ?code= instead.
    const withFragment = (url, params) => `${url.split("#")[0]}#${new URLSearchParams(params)}`;
    if (!entry || !redirectTo) {
      res.writeHead(303, { Location: withFragment(redirectTo || "http://localhost/", { error: "access_denied", error_code: "otp_expired", error_description: "Email link is invalid or has expired" }) });
      return res.end();
    }
    state.emailTokens.delete(q.get("token"));
    const user = userById(entry.userId);
    if (entry.type === "signup") user.email_confirmed_at = user.confirmed_at = new Date().toISOString();
    if (entry.challenge) {
      res.writeHead(303, { Location: withParams(redirectTo, { code: newCode(user.id, entry.challenge) }) });
    } else {
      const session = issueSession(user);
      res.writeHead(303, {
        Location: withFragment(redirectTo, {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: String(session.expires_in),
          expires_at: String(session.expires_at),
          token_type: "bearer",
          type: entry.type,
        }),
      });
    }
    return res.end();
  }

  if (path === "/verify" && req.method === "POST") {
    const entry = state.emailTokens.get(body.token_hash);
    if (!entry || entry.type !== body.type) return authError(res, 403, "otp_expired", "Email link is invalid or has expired");
    state.emailTokens.delete(body.token_hash);
    const user = userById(entry.userId);
    if (entry.type === "signup") user.email_confirmed_at = user.confirmed_at = new Date().toISOString();
    return json(res, 200, issueSession(user));
  }

  if (path === "/authorize" && req.method === "GET") {
    if (!state.config.googleEnabled) return authError(res, 400, "validation_failed", "Unsupported provider: provider is not enabled");
    const redirectTo = q.get("redirect_to");
    if (state.config.googleCancel) {
      res.writeHead(302, { Location: withParams(redirectTo, { error: "access_denied", error_description: "The user cancelled" }) });
      return res.end();
    }
    // Google consent is skipped: straight back with a PKCE code, as Supabase does after Google.
    const { email, name } = state.config.googleUser;
    const user = state.users.get(email.toLowerCase()) ?? makeUser({ email, name, provider: "google" });
    res.writeHead(302, { Location: withParams(redirectTo, { code: newCode(user.id, q.get("code_challenge")) }) });
    return res.end();
  }

  if (path === "/logout") return json(res, 204);
  if (path === "/settings") return json(res, 200, { external: { google: state.config.googleEnabled, email: true }, mailer_autoconfirm: !state.config.confirmEmail });
  return authError(res, 404, "not_found", `mock: no auth route ${req.method} ${path}`);
}

function filterRows(rows, params) {
  let out = rows;
  for (const [key, value] of params) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    const m = /^eq\.(.*)$/.exec(value);
    if (m) out = out.filter((r) => String(r[key]) === m[1]);
  }
  return out;
}

async function handleRest(req, res, url, path) {
  const user = bearerUser(req);
  const service = isServiceRole(req);
  const wantsObject = (req.headers.accept || "").includes("vnd.pgrst.object+json");
  const reply = (rows, status = 200) => {
    if (wantsObject) {
      if (rows.length !== 1) return json(res, 406, { code: "PGRST116", details: `The result contains ${rows.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" });
      return json(res, status, rows[0]);
    }
    return json(res, status, rows, { "Content-Range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
  };

  if (path === "/rpc/current_admin_self") return json(res, 200, user ? state.tables.admins.filter((a) => a.user_id === user.id) : []);
  if (path.startsWith("/rpc/")) return json(res, 200, []);

  const table = path.slice(1);
  const rows = state.tables[table] ?? [];
  if (req.method === "GET" || req.method === "HEAD") {
    // RLS stand-in: an owner sees only their own boutique.
    let visible = rows;
    if (table === "boutiques" && !service) visible = user ? rows.filter((r) => r.owner_user_id === user.id) : [];
    return reply(filterRows(visible, url.searchParams));
  }
  if (req.method === "POST") {
    if (table !== "boutiques" || !service) return json(res, 403, { code: "42501", message: "new row violates row-level security policy" });
    const body = await readBody(req);
    const now = new Date().toISOString();
    const row = { id: randomUUID(), status: "active", order_seq: 0, logo_file_id: null, created_at: now, updated_at: now, ...body };
    rows.push(row);
    state.tables[table] = rows;
    return reply([row], 201);
  }
  return reply([]);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, BASE);
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors());
      return res.end();
    }
    const path = url.pathname;
    if (path === "/__mock/reset" && req.method === "POST") {
      reset();
      return json(res, 200, { ok: true });
    }
    if (path === "/__mock/config" && req.method === "POST") {
      Object.assign(state.config, await readBody(req));
      return json(res, 200, state.config);
    }
    if (path === "/__mock/seed" && req.method === "POST") {
      const body = await readBody(req);
      const created = {};
      for (const u of body.users ?? []) created[u.email] = makeUser(u).id;
      for (const b of body.boutiques ?? []) {
        const now = new Date().toISOString();
        state.tables.boutiques.push({ id: randomUUID(), status: "active", order_seq: 0, area: null, phone: null, gst_number: null, logo_file_id: null, terms_tnc_accepted: true, terms_privacy_accepted: true, terms_accepted_at: now, created_at: now, updated_at: now, ...b, owner_user_id: created[b.ownerEmail], email: b.ownerEmail });
      }
      for (const a of body.admins ?? []) state.tables.admins.push({ id: randomUUID(), active: true, created_at: new Date().toISOString(), ...a, user_id: created[a.email] });
      return json(res, 200, created);
    }
    if (path === "/__mock/outbox") {
      const to = url.searchParams.get("to")?.toLowerCase();
      return json(res, 200, state.outbox.filter((m) => !to || m.to === to));
    }
    if (path === "/__mock/user") {
      const u = state.users.get(String(url.searchParams.get("email")).toLowerCase());
      return json(res, 200, u ? { confirmed: !!u.email_confirmed_at, password: u.password } : null);
    }
    if (path.startsWith("/auth/v1")) return await handleAuth(req, res, url, path.slice("/auth/v1".length));
    if (path.startsWith("/rest/v1")) return await handleRest(req, res, url, path.slice("/rest/v1".length));
    if (path === "/") return json(res, 200, { ok: true });
    return json(res, 404, { message: `mock: unknown ${req.method} ${path}` });
  } catch (err) {
    console.error(err);
    json(res, 500, { message: String(err) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`supabase mock on ${BASE}`));
