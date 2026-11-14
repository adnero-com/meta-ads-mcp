/**
 * Fields sent to the Graph API when a list tool's caller omits `fields`.
 * Graph's own default is id only, which forces a second call to see anything useful.
 * An explicit `fields` argument always wins.
 */
export const DEFAULT_CAMPAIGN_FIELDS =
  "id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,bid_strategy,created_time,updated_time";

export const DEFAULT_ADSET_FIELDS =
  "id,name,status,effective_status,campaign_id,daily_budget,lifetime_budget,budget_remaining,bid_strategy,bid_amount,optimization_goal,billing_event,start_time,end_time";

/**
 * Fields get_adset sends when its caller omits `fields`: the list columns plus what one ad set is read for (its
 * targeting, what it promotes, and why it does not deliver). Graph's own default is id and name only.
 */
export const DEFAULT_ADSET_DETAIL_FIELDS = `${DEFAULT_ADSET_FIELDS},targeting,promoted_object,destination_type,issues_info`;

export const DEFAULT_AD_FIELDS =
  "id,name,status,effective_status,campaign_id,adset_id,creative{id,name},created_time,updated_time";

/** Schema description for a `fields` argument that falls back to `defaults`. */
export const fieldsDescription = (defaults: string): string =>
  `Comma-separated fields to return. Default when omitted: ${defaults}`;

/**
 * Keys of an ad set's targeting spec. They are not fields of the AdSet node: asking Graph for `age_min` on an ad set
 * fails the whole read with "(#100) Tried accessing nonexisting field (age_min)". They live under `targeting`.
 */
export const ADSET_TARGETING_KEYS: ReadonlySet<string> = new Set([
  "age_min",
  "age_max",
  "age_range",
  "genders",
  "geo_locations",
  "excluded_geo_locations",
  "locales",
  "interests",
  "behaviors",
  "life_events",
  "income",
  "education_statuses",
  "relationship_statuses",
  "custom_audiences",
  "excluded_custom_audiences",
  "flexible_spec",
  "exclusions",
  "publisher_platforms",
  "facebook_positions",
  "instagram_positions",
  "audience_network_positions",
  "messenger_positions",
  "threads_positions",
  "device_platforms",
  "user_os",
  "user_device",
  "excluded_user_device",
  "wireless_carrier",
  "targeting_automation",
  "targeting_optimization",
  "brand_safety_content_filter_levels",
]);

/** Top-level comma-separated parts of a Graph `fields` value: commas inside `{…}` or `(…)` do not split. */
export const splitFields = (fields: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of fields) {
    if (ch === "{" || ch === "(") depth++;
    if (ch === "}" || ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur.trim());
  return parts.filter((p) => p !== "");
};

/** The name of a field part (`targeting{age_min}` → `targeting`, `insights.date_preset(x){spend}` → `insights`). */
const nameOf = (part: string): string => part.split(/[{.(]/)[0].trim();

/**
 * An ad set `fields` value Graph accepts: targeting keys asked for on the ad set itself (`age_min`, `geo_locations`)
 * move under `targeting{…}`, merged into a `targeting{…}` already asked for; a plain `targeting` already returns all
 * of them. Everything else is sent as given, in order.
 */
export const adsetFields = (fields: string): string => {
  const parts = splitFields(fields);
  const moved = parts.filter((p) => ADSET_TARGETING_KEYS.has(nameOf(p)));
  if (moved.length === 0) return fields;
  const rest = parts.filter((p) => !ADSET_TARGETING_KEYS.has(nameOf(p)));
  const at = rest.findIndex((p) => nameOf(p) === "targeting");
  if (at === -1) return [...rest, `targeting{${moved.join(",")}}`].join(",");
  const existing = rest[at];
  const open = existing.indexOf("{");
  if (open === -1) return rest.join(",");
  const inner = splitFields(existing.slice(open + 1, existing.lastIndexOf("}")));
  const merged = [...inner, ...moved.filter((m) => !inner.includes(m))];
  return rest.map((p, i) => (i === at ? `targeting{${merged.join(",")}}` : p)).join(",");
};
