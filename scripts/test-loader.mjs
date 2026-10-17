import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/headers") {
    return nextResolve("next/headers.js", context);
  }
  if (specifier === "next/navigation") {
    return nextResolve("next/navigation.js", context);
  }
  return nextResolve(specifier, context);
}
