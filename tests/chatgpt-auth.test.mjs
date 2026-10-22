import assert from "node:assert/strict";
import test from "node:test";
import { parseChatGPTUser } from "../app/chatgpt-auth-core.ts";

const secret = "test-proxy-secret";

function headers(extra = {}) {
  return new Headers({
    "x-chatgpt-proxy-secret": secret,
    "oai-authenticated-user-email": "test@example.com",
    ...extra,
  });
}

test("denies a user without an email", () => {
  const requestHeaders = headers();
  requestHeaders.delete("oai-authenticated-user-email");
  assert.equal(parseChatGPTUser(requestHeaders, secret, true), null);
});

test("accepts an authenticated user and decodes the full name", () => {
  const requestHeaders = headers({
    "oai-authenticated-user-full-name": "Test%20User",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  assert.deepEqual(parseChatGPTUser(requestHeaders, secret, true), {
    displayName: "Test User",
    email: "test@example.com",
    fullName: "Test User",
  });
});

test("rejects missing and incorrect proxy secrets", () => {
  const missing = headers();
  missing.delete("x-chatgpt-proxy-secret");
  assert.equal(parseChatGPTUser(missing, secret, true), null);
  assert.equal(parseChatGPTUser(headers({ "x-chatgpt-proxy-secret": "wrong" }), secret, true), null);
});

test("accepts the existing bearer authorization fallback", () => {
  const requestHeaders = headers({ authorization: `Bearer ${secret}` });
  requestHeaders.delete("x-chatgpt-proxy-secret");
  assert.equal(parseChatGPTUser(requestHeaders, secret, true)?.email, "test@example.com");
});

test("falls back to email for malformed or unsupported name encoding", () => {
  const malformed = headers({
    "oai-authenticated-user-full-name": "%E0%A4%A",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  const unsupported = headers({
    "oai-authenticated-user-full-name": "Test%20User",
    "oai-authenticated-user-full-name-encoding": "unknown",
  });
  for (const requestHeaders of [malformed, unsupported]) {
    assert.deepEqual(parseChatGPTUser(requestHeaders, secret, true), {
      displayName: "test@example.com",
      email: "test@example.com",
      fullName: null,
    });
  }
});

test("fails closed when the proxy secret is unconfigured in production", () => {
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    assert.equal(parseChatGPTUser(headers(), undefined, true), null);
    assert.match(String(errors[0]?.[0]), /CHATGPT_PROXY_SECRET is not set/);
  } finally {
    console.error = originalError;
  }
});

test("retains the development-only no-secret warning", () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try {
    assert.equal(parseChatGPTUser(headers(), undefined, false)?.email, "test@example.com");
    assert.match(String(warnings[0]?.[0]), /Allowing access in development/);
  } finally {
    console.warn = originalWarn;
  }
});

test('secret comparisons reject unequal lengths and preserve UTF-8 equality', () => {
  for (const wrong of ['x', secret + 'x', 'x'.repeat(4096)]) {
    assert.equal(parseChatGPTUser(headers({ 'x-chatgpt-proxy-secret': wrong }), secret, true), null);
  }
  const unicodeSecret = 'caf\u00e9';
  assert.equal(parseChatGPTUser(headers({ 'x-chatgpt-proxy-secret': unicodeSecret }), unicodeSecret, true)?.email, 'test@example.com');
  assert.equal(parseChatGPTUser(headers({ 'x-chatgpt-proxy-secret': 'cafe' }), unicodeSecret, true), null);
});
