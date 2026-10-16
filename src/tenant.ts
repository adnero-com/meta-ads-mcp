import { timingSafeEqual } from "node:crypto";
import { AdsConfig } from "./config.js";

/**
 * Multi-tenant HTTP mode: the credentials of each request come from headers
 * set by a trusted gateway in front of this server, never from the
 * environment, and are never shared between requests.
 */
export const TENANT_HEADERS = {
  accessToken: "x-meta-access-token",
  adAccountId: "x-meta-ad-account-id",
  appsecretProof: "x-meta-appsecret-proof",
  businessId: "x-meta-business-id",
  pixelId: "x-meta-pixel-id",
  /** The shared secret proving the request came from the gateway (MCP_HTTP_SHARED_SECRET). */
  gatewayKey: "x-meta-mcp-key",
} as const;

export type HeaderBag = Record<string, string | string[] | undefined>;

export type TenantResult =
  | { ok: true; config: AdsConfig }
  | { ok: false; status: 401; message: string };

const one = (headers: HeaderBag, name: string): string => {
  const v = headers[name];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
};

const sameSecret = (presented: string, expected: string): boolean => {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Pure: the AdsConfig of one HTTP request. When a shared secret is set, a
 * request without it is refused before any header is read. A request
 * without an access token is refused. An empty header counts as absent, so
 * a gateway can always overwrite every header (an empty appsecret_proof
 * means unsigned). Messages never echo header values.
 */
export function tenantConfigFromHeaders(
  headers: HeaderBag,
  opts: { sharedSecret?: string; graphApiBase?: string } = {}
): TenantResult {
  if (opts.sharedSecret && !sameSecret(one(headers, TENANT_HEADERS.gatewayKey), opts.sharedSecret)) {
    return { ok: false, status: 401, message: "Requests must come through the gateway." };
  }
  const accessToken = one(headers, TENANT_HEADERS.accessToken);
  if (!accessToken) {
    return { ok: false, status: 401, message: "No Meta access token for this request." };
  }
  const proof = one(headers, TENANT_HEADERS.appsecretProof);
  return {
    ok: true,
    config: {
      accessToken,
      adAccountId: one(headers, TENANT_HEADERS.adAccountId),
      businessId: one(headers, TENANT_HEADERS.businessId),
      pixelId: one(headers, TENANT_HEADERS.pixelId),
      // App credentials belong to one app, not to a tenant: never used in HTTP mode.
      appId: "",
      appSecret: "",
      ...(proof ? { appsecretProof: proof } : {}),
      ...(opts.graphApiBase ? { graphApiBase: opts.graphApiBase } : {}),
    },
  };
}
