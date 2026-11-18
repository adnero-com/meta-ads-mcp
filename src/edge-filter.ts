/**
 * `GET /act_<id>/adsets` and `/ads` ignore a plain `campaign_id` / `adset_id` query parameter and return the whole
 * account, so a "list the ad sets of campaign X" answered with other campaigns' ad sets. The edge filters by
 * `filtering`, with the field names `campaign.id` and `adset.id`.
 */
export type ParentFilter = { readonly campaign_id?: string | undefined; readonly adset_id?: string | undefined };

/** The `filtering` query value for the parents asked for; undefined when none is. */
export function parentFiltering(f: ParentFilter): string | undefined {
  const clauses = [
    ...(f.campaign_id ? [{ field: "campaign.id", operator: "IN", value: [f.campaign_id] }] : []),
    ...(f.adset_id ? [{ field: "adset.id", operator: "IN", value: [f.adset_id] }] : []),
  ];
  return clauses.length === 0 ? undefined : JSON.stringify(clauses);
}
