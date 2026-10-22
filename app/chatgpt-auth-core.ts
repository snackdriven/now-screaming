import { timingSafeEqual } from "crypto";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

type HeaderReader = Pick<Headers, "get">;

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const PROXY_SECRET_HEADER = "x-chatgpt-proxy-secret";

function isTimingSafeEqual(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf-8"), Buffer.from(b, "utf-8"));
  } catch {
    return false;
  }
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function parseChatGPTUser(
  requestHeaders: HeaderReader,
  expectedSecret: string | undefined,
  isProduction: boolean,
): ChatGPTUser | null {
  if (!expectedSecret) {
    if (isProduction) {
      console.error("Security Error: CHATGPT_PROXY_SECRET is not set. Authentication is blocked to prevent header spoofing.");
      return null;
    }
    console.warn("Security Warning: CHATGPT_PROXY_SECRET is not set. Allowing access in development.");
  } else {
    const providedSecret = requestHeaders.get(PROXY_SECRET_HEADER);
    if (!isTimingSafeEqual(providedSecret, expectedSecret)) return null;
  }

  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return { displayName: fullName ?? email, email, fullName };
}
