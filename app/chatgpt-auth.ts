import { headers } from "next/headers";
import { parseChatGPTUser } from "./chatgpt-auth-core";

export type { ChatGPTUser } from "./chatgpt-auth-core";

export async function getChatGPTUser() {
  return parseChatGPTUser(
    await headers(),
    process.env.CHATGPT_PROXY_SECRET,
    process.env.NODE_ENV === "production",
  );
}
