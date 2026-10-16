export interface AdsConfig {
  accessToken: string;
  adAccountId: string;
  appId: string;
  appSecret: string;
  businessId: string;
  pixelId: string;
  /** appsecret_proof for accessToken, computed by whoever holds the app secret. Optional. */
  appsecretProof?: string;
  /** Graph API base URL (default https://graph.facebook.com/v26.0); for tests against a fake Graph. */
  graphApiBase?: string;
}

export function loadConfig(): AdsConfig {
  return {
    accessToken: process.env.META_ADS_ACCESS_TOKEN || "",
    adAccountId: process.env.META_AD_ACCOUNT_ID || "",
    appId: process.env.META_APP_ID || "",
    appSecret: process.env.META_APP_SECRET || "",
    businessId: process.env.META_BUSINESS_ID || "",
    pixelId: process.env.META_PIXEL_ID || "",
    graphApiBase: process.env.META_GRAPH_API_BASE || undefined,
  };
}
