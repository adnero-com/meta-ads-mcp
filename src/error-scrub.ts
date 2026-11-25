import type { Transport, TransportSendOptions } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/*
 * No credential leaves in a JSON-RPC error answer. The gateway in front of this server scrubs every tool RESULT of
 * credentials, but it never sees an error answer (agentgateway skips its response hook for JSON-RPC errors), and a
 * Graph error or URL echoed into an error message carries the caller's token. So this server scrubs its own error
 * answers before they are sent, and fails closed: an error it cannot check becomes a generic internal error.
 * The names and rules are the platform's (adplatform packages/contracts/src/result-secrets.ts); keep them in step.
 */

const SECRET_PARAMS = ["access_token", "appsecret_proof", "client_secret", "fb_exchange_token", "input_token"];
const NAMES = SECRET_PARAMS.join("|");
const HINT = new RegExp(NAMES, "i");
const SECRET_KEY = new RegExp(`^(?:${NAMES})$`, "i");
const VALUE = `[^&\\s#"'<>\\\\]*`;
const AMP = `&amp;|\\\\u0026|&`;
const PARAM = `(?:${NAMES})=${VALUE}`;
const PARAM_RUN = new RegExp(`(\\?|${AMP})${PARAM}(?:(?:${AMP})${PARAM})*(${AMP})?`, "gi");
const ENCODED_PARAM = new RegExp(`(%3F|%26)(${NAMES})%3D(?:[^%&\\s#"'<>\\\\]|%(?!26|23)[0-9a-f]{2})*`, "gi");
const JSON_FIELD = new RegExp(`((?:\\\\)?"(?:${NAMES})(?:\\\\)?"\\s*:\\s*(?:\\\\)?")[^"\\\\]*`, "gi");
const MAX_DEPTH = 64;

export const UNCHECKED_ERROR_MESSAGE =
  "The answer could not be checked, so it is not shown. The call may have run: check its effect before trying again.";

/** Free text without any secret parameter or JSON field value (the rest of each URL stays). */
export const withoutSecretText = (text: string): string =>
  !HINT.test(text)
    ? text
    : text
        .replace(PARAM_RUN, (_run: string, sep: string, amp: string | undefined) =>
          sep === "?" ? (amp === undefined ? "" : "?") : (amp ?? ""),
        )
        .replace(ENCODED_PARAM, "$1$2%3D")
        .replace(JSON_FIELD, "$1");

/** The same value without credentials; the SAME reference when there was nothing to remove. Throws when too deep. */
const walk = (v: unknown, depth: number): unknown => {
  if (depth > MAX_DEPTH) throw new Error("nested too deeply to check");
  if (typeof v === "string") return withoutSecretText(v);
  if (typeof v !== "object" || v === null) return v;
  if (Array.isArray(v)) {
    const out = v.map((x) => walk(x, depth + 1));
    return out.every((x, i) => x === v[i]) ? v : out;
  }
  const entries = Object.entries(v);
  const kept = entries.filter(([k, x]) => !(SECRET_KEY.test(k) && typeof x === "string"));
  const out = kept.map(([k, x]) => [k, walk(x, depth + 1)] as const);
  return kept.length === entries.length && out.every(([, x], i) => x === kept[i]?.[1]) ? v : Object.fromEntries(out);
};

const uncheckedFor = (id: unknown): JSONRPCMessage =>
  ({
    jsonrpc: "2.0",
    id: typeof id === "string" || typeof id === "number" ? id : null,
    error: { code: -32603, message: UNCHECKED_ERROR_MESSAGE },
  }) as unknown as JSONRPCMessage;

/** The message as it may be sent: an error answer scrubbed (or, if it cannot be checked, a generic one). */
export const scrubbedMessage = (m: JSONRPCMessage): JSONRPCMessage => {
  if (!("error" in m)) return m;
  try {
    const clean = walk(m.error, 0);
    if (clean === m.error) return m;
    return typeof clean === "object" && clean !== null && !Array.isArray(clean)
      ? ({ ...m, error: clean } as JSONRPCMessage)
      : uncheckedFor(m.id);
  } catch {
    return uncheckedFor(m.id);
  }
};

/** The request's own transport with every outgoing message passed through scrubbedMessage. */
export const scrubbing = <T extends Pick<Transport, "send">>(transport: T): T => {
  const send = transport.send.bind(transport);
  return Object.assign(transport, {
    send: (m: JSONRPCMessage, o?: TransportSendOptions) => send(scrubbedMessage(m), o),
  });
};
