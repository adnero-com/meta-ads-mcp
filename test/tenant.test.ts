import test from "node:test";
import assert from "node:assert/strict";
import { tenantConfigFromHeaders } from "../src/tenant.js";

const TOKEN = "EAAtenantTokenAAAAAAAAAAAAAAAAAAAA";

const cases: Array<{
  name: string;
  headers: Record<string, string | string[] | undefined>;
  opts?: { sharedSecret?: string; graphApiBase?: string };
  expect: unknown;
}> = [
  {
    name: "token and ad account map onto the config; app credentials are never used",
    headers: { "x-meta-access-token": TOKEN, "x-meta-ad-account-id": "act_1" },
    expect: { ok: true, config: { accessToken: TOKEN, adAccountId: "act_1", businessId: "", pixelId: "", appId: "", appSecret: "" } },
  },
  {
    name: "appsecret_proof is passed only when present",
    headers: { "x-meta-access-token": TOKEN, "x-meta-appsecret-proof": "abc123" },
    expect: { ok: true, config: { accessToken: TOKEN, adAccountId: "", businessId: "", pixelId: "", appId: "", appSecret: "", appsecretProof: "abc123" } },
  },
  {
    name: "an empty appsecret_proof means unsigned",
    headers: { "x-meta-access-token": TOKEN, "x-meta-appsecret-proof": "" },
    expect: { ok: true, config: { accessToken: TOKEN, adAccountId: "", businessId: "", pixelId: "", appId: "", appSecret: "" } },
  },
  {
    name: "the first of repeated headers wins",
    headers: { "x-meta-access-token": [TOKEN, "other"] },
    expect: { ok: true, config: { accessToken: TOKEN, adAccountId: "", businessId: "", pixelId: "", appId: "", appSecret: "" } },
  },
  {
    name: "graph base comes from options, not headers",
    headers: { "x-meta-access-token": TOKEN },
    opts: { graphApiBase: "http://fake-graph/v26.0" },
    expect: { ok: true, config: { accessToken: TOKEN, adAccountId: "", businessId: "", pixelId: "", appId: "", appSecret: "", graphApiBase: "http://fake-graph/v26.0" } },
  },
  {
    name: "no token: 401",
    headers: { "x-meta-ad-account-id": "act_1" },
    expect: { ok: false, status: 401, message: "No Meta access token for this request." },
  },
  {
    name: "whitespace-only token: 401",
    headers: { "x-meta-access-token": "   " },
    expect: { ok: false, status: 401, message: "No Meta access token for this request." },
  },
  {
    name: "shared secret set and missing: 401 before reading the token",
    headers: { "x-meta-access-token": TOKEN },
    opts: { sharedSecret: "s3cret-s3cret" },
    expect: { ok: false, status: 401, message: "Requests must come through the gateway." },
  },
  {
    name: "shared secret wrong (other length): 401",
    headers: { "x-meta-access-token": TOKEN, "x-meta-mcp-key": "nope" },
    opts: { sharedSecret: "s3cret-s3cret" },
    expect: { ok: false, status: 401, message: "Requests must come through the gateway." },
  },
  {
    name: "shared secret wrong (same length): 401",
    headers: { "x-meta-access-token": TOKEN, "x-meta-mcp-key": "s3cret-s3creX" },
    opts: { sharedSecret: "s3cret-s3cret" },
    expect: { ok: false, status: 401, message: "Requests must come through the gateway." },
  },
  {
    name: "shared secret right: accepted",
    headers: { "x-meta-access-token": TOKEN, "x-meta-mcp-key": "s3cret-s3cret" },
    opts: { sharedSecret: "s3cret-s3cret" },
    expect: { ok: true, config: { accessToken: TOKEN, adAccountId: "", businessId: "", pixelId: "", appId: "", appSecret: "" } },
  },
];

for (const c of cases) {
  test(`tenantConfigFromHeaders: ${c.name}`, () => {
    const got = tenantConfigFromHeaders(c.headers, c.opts);
    assert.deepEqual(got, c.expect);
    if (!got.ok) assert.ok(!got.message.includes(TOKEN));
  });
}

test("tenantConfigFromHeaders ignores the environment", () => {
  process.env.META_ADS_ACCESS_TOKEN = "env-token-must-not-be-used";
  process.env.META_AD_ACCOUNT_ID = "act_env";
  try {
    const got = tenantConfigFromHeaders({});
    assert.equal(got.ok, false);
    const withToken = tenantConfigFromHeaders({ "x-meta-access-token": TOKEN });
    assert.ok(withToken.ok && withToken.config.adAccountId === "");
  } finally {
    delete process.env.META_ADS_ACCESS_TOKEN;
    delete process.env.META_AD_ACCOUNT_ID;
  }
});

import { encodeGraphPath } from "../src/services/ads-client.js";

const paths: Array<[string, string | null]> = [
  ["/act_123/campaigns", "/act_123/campaigns"],
  ["/123456", "/123456"],
  ["/123?fields=access_token", "/123%3Ffields%3Daccess_token"],
  ["/123#frag", "/123%23frag"],
  ["/act_1/../me", null],
  ["/./me", null],
  ["/a//b", null],
];
for (const [input, want] of paths) {
  test(`encodeGraphPath(${JSON.stringify(input)})`, () => {
    if (want === null) assert.throws(() => encodeGraphPath(input));
    else assert.equal(encodeGraphPath(input), want);
  });
}
