/**
 * Fields sent to the Graph API when a list tool's caller omits `fields`.
 * Graph's own default is id only, which forces a second call to see anything useful.
 * An explicit `fields` argument always wins.
 */
export const DEFAULT_CAMPAIGN_FIELDS =
  "id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,bid_strategy,created_time,updated_time";

export const DEFAULT_ADSET_FIELDS =
  "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,budget_remaining,bid_strategy,bid_amount,optimization_goal,billing_event,start_time,end_time";

export const DEFAULT_AD_FIELDS =
  "id,name,status,effective_status,campaign_id,adset_id,creative{id,name},created_time,updated_time";

/** Schema description for a `fields` argument that falls back to `defaults`. */
export const fieldsDescription = (defaults: string): string =>
  `Comma-separated fields to return. Default when omitted: ${defaults}`;
