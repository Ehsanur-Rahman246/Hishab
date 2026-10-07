// CSRF verification for cookie sessions (offline + signed-token checks).
// Covers: valid flow, missing/invalid/cross-user/expired rejection, safe-method
// + login/register exemption, cookie flags, CORS allowlist (no wildcard creds).
// Run: node --test tests/csrf.test.js

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  mintCsrfToken,
  requireCsrf,
  verifyCsrfToken,
} from "../src/middleware/csrf.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-csrf";

const mockReq = ({ method = "POST", path = "/api/goals", cookies = {}, headers = {}, baseUrl = "" } = {}) => ({
  method, path, baseUrl, cookies, headers,
  get: (k) => headers[k.toLowerCase()],
  url: path,
});
const mockRes = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};

describe("CSRF double-submit tokens", () => {
  it("valid header==cookie with good signature passes", () => {
    const t = mintCsrfToken();
    const req = mockReq({ cookies: { token: "jwt", [CSRF_COOKIE]: t }, headers: { [CSRF_HEADER]: t } });
    let next = false;
    requireCsrf(req, mockRes(), () => { next = true; });
    assert.equal(next, true);
  });

  it("missing token rejected (403)", () => {
    const req = mockReq({ cookies: { token: "jwt" }, headers: {} });
    const res = mockRes();
    let next = false;
    requireCsrf(req, res, () => { next = true; });
    assert.equal(next, false);
    assert.equal(res.statusCode, 403);
  });

  it("invalid signature rejected", () => {
    const t = mintCsrfToken().slice(0, -2) + "zz";
    const req = mockReq({ cookies: { token: "jwt", [CSRF_COOKIE]: t }, headers: { [CSRF_HEADER]: t } });
    const res = mockRes();
    let next = false;
    requireCsrf(req, res, () => { next = true; });
    assert.equal(next, false);
    assert.equal(res.statusCode, 403);
  });

  it("cross-user token (header != own cookie) rejected", () => {
    const tokenA = mintCsrfToken();
    const tokenB = mintCsrfToken();
    assert.notEqual(tokenA, tokenB);
    const req = mockReq({ cookies: { token: "jwt-B", [CSRF_COOKIE]: tokenB }, headers: { [CSRF_HEADER]: tokenA } });
    const res = mockRes();
    let next = false;
    requireCsrf(req, res, () => { next = true; });
    assert.equal(next, false);
    assert.equal(res.statusCode, 403);
  });

  it("expired token rejected", () => {
    const t = mintCsrfToken(-1000);
    assert.equal(verifyCsrfToken(t).ok, false);
    const req = mockReq({ cookies: { token: "jwt", [CSRF_COOKIE]: t }, headers: { [CSRF_HEADER]: t } });
    const res = mockRes();
    let next = false;
    requireCsrf(req, res, () => { next = true; });
    assert.equal(next, false);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /expired/i);
  });

  it("safe methods pass without tokens; login/register/csrf-token exempt", () => {
    for (const m of ["GET", "HEAD", "OPTIONS"]) {
      let next = false;
      requireCsrf(mockReq({ method: m, path: "/api/goals", cookies: { token: "jwt" }, headers: {} }), mockRes(), () => { next = true; });
      assert.equal(next, true, m);
    }
    for (const p of ["/login", "/register", "/csrf-token"]) {
      let next = false;
      requireCsrf(mockReq({ method: "POST", path: p, baseUrl: "/api/auth", cookies: {}, headers: {} }), mockRes(), () => { next = true; });
      assert.equal(next, true, p);
    }
  });

  it("state-changing routes without session cookie skip CSRF (auth returns 401 later)", () => {
    let next = false;
    requireCsrf(mockReq({ method: "POST", path: "/api/goals", cookies: {}, headers: {} }), mockRes(), () => { next = true; });
    assert.equal(next, true);
  });

  it("cookie flags: readable by JS, SameSite set, secure in production; CORS has no wildcard credentials", () => {
    const src = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
    assert.ok(src.includes("requireCsrf"), "server must mount CSRF middleware");
    assert.ok(!/origin:\s*["']\*["']/.test(src), "no wildcard CORS origin");
    assert.ok(src.includes("credentials: true"));
    const csrfSrc = fs.readFileSync(new URL("../src/middleware/csrf.js", import.meta.url), "utf8");
    assert.ok(csrfSrc.includes("httpOnly: false"), "double-submit cookie must be readable");
    assert.ok(csrfSrc.includes("sameSite"), "SameSite must be configured");
    assert.ok(csrfSrc.includes("secure"), "secure flag behaviour must be configured");
    const authSrc = fs.readFileSync(new URL("../src/controllers/authControllers.js", import.meta.url), "utf8");
    assert.ok(authSrc.includes("httpOnly: true"), "JWT cookie stays HttpOnly");
  });
});
