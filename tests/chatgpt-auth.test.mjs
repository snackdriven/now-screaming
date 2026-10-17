import { test } from "node:test";
import assert from "node:assert/strict";
import { chatGPTSignInPath } from "../app/chatgpt-auth.ts";

test("safeRelativeReturnPath handles valid paths", () => {
  assert.equal(chatGPTSignInPath("/foo"), "/signin-with-chatgpt?return_to=%2Ffoo");
  assert.equal(chatGPTSignInPath("/foo/bar?q=1#hash"), "/signin-with-chatgpt?return_to=%2Ffoo%2Fbar%3Fq%3D1%23hash");
});

test("safeRelativeReturnPath defaults to / on missing initial /", () => {
  assert.equal(chatGPTSignInPath("foo"), "/signin-with-chatgpt?return_to=%2F");
  assert.equal(chatGPTSignInPath(""), "/signin-with-chatgpt?return_to=%2F");
});

test("safeRelativeReturnPath defaults to / on double /", () => {
  assert.equal(chatGPTSignInPath("//foo"), "/signin-with-chatgpt?return_to=%2F");
});

test("safeRelativeReturnPath catches invalid URLs and returns /", () => {
  // Unencoded IPv6 brackets in a path component cause 'new URL(value, base)' to throw a TypeError in Node.js.
  assert.equal(chatGPTSignInPath("/\\[invalid]"), "/signin-with-chatgpt?return_to=%2F");
});

test("safeRelativeReturnPath excludes absolute URLs", () => {
  // Should default to / since it starts with http which doesn't start with /
  assert.equal(chatGPTSignInPath("http://example.com/foo"), "/signin-with-chatgpt?return_to=%2F");
});

test("safeRelativeReturnPath excludes reserved auth paths", () => {
  assert.equal(chatGPTSignInPath("/signin-with-chatgpt"), "/signin-with-chatgpt?return_to=%2F");
  assert.equal(chatGPTSignInPath("/callback"), "/signin-with-chatgpt?return_to=%2F");
});
