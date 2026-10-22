🎯 **What:** The vulnerability fixed
The `parseChatGPTUser` function previously allowed falling back to the standard `authorization` header to retrieve a custom proxy secret if the `x-chatgpt-proxy-secret` header was missing. This fallback has been removed.

⚠️ **Risk:** The potential impact if left unfixed
Allowing the proxy secret to be passed via the standard `authorization` header could conflict with other authentication mechanisms. It might also lead to unintended exposure of the proxy secret if the authorization header is logged, forwarded inappropriately, or handled by middleware that isn't expecting a proxy secret in that field.

🛡️ **Solution:** How the fix addresses the vulnerability
The assignment of `providedSecret` has been updated to strictly check only the `x-chatgpt-proxy-secret` (`PROXY_SECRET_HEADER`). The fallback to the `authorization` header and the associated regex replacement have been entirely removed. The corresponding test `accepts the existing bearer authorization fallback` was updated to `rejects the bearer authorization fallback` and now asserts that relying solely on the authorization header fails to authenticate the user and returns `null`.
