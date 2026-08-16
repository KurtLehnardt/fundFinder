import type { ValueTransformId } from "../config/schema";

/**
 * Deterministic, PURE value transforms (spec §3.2/§9.3). Every transform is a
 * plain string → string function with no side effects, no model call, no
 * guessing — a value that doesn't cleanly transform is returned unchanged
 * (never dropped, never fabricated) so the fill engine's read-back can still
 * report truthfully on what actually landed in the DOM.
 */

/** Full US state / territory name → 2-letter postal code. */
const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "puerto rico": "PR",
  guam: "GU",
  "american samoa": "AS",
  "u.s. virgin islands": "VI",
  "virgin islands": "VI",
  "northern mariana islands": "MP",
};

/** No-op: the value is written verbatim. */
function identity(value: string): string {
  return value;
}

/**
 * ISO-8601 date (`YYYY-MM-DD`, optionally with a time component) → the
 * `MM/DD/YYYY` shape most federal-portal date inputs expect. If `value`
 * doesn't parse as a plain `YYYY-MM-DD` date, it is returned unchanged rather
 * than guessed at.
 */
function dateIsoToMmddyyyy(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value;
  const [, year, month, day] = match;
  return `${month}/${day}/${year}`;
}

/**
 * Full US state/territory name → 2-letter postal code, case- and
 * whitespace-insensitive. Unrecognized input is returned unchanged (never
 * guessed) so a downstream `optionMatch` / select resolution can still try
 * an exact-text match against the original value.
 */
function stateNameToCode(value: string): string {
  const key = value.trim().toLowerCase().replace(/\s+/g, " ");
  return STATE_NAME_TO_CODE[key] ?? value;
}

/**
 * The package already carries a human-readable SF-424 "Type of Applicant"
 * label (e.g. "For-profit — small business" — see the vendored
 * `ENTITY_TYPE_LABELS` mapping the app's deterministic form mapper applies
 * before this value ever reaches the extension). Because no live SF-424
 * `<select>` option strings have been captured yet (every selector in the
 * seed configs is `TODO`), this transform is currently an identity pass:
 * `writeValue`'s `select` handling matches an option by normalized text
 * against this value. Once an in-session capture pass records the portal's
 * actual option value/text pairs, this function is the single place to add
 * label → option-value remapping without touching the fill engine.
 */
function entityTypeToSf424Option(value: string): string {
  return value;
}

/**
 * Strip currency formatting (a leading `$`, thousands separators) down to a
 * plain numeric string a text/number input can accept, e.g. `"$1,250.00"` →
 * `"1250.00"`. A value with no digits at all is returned unchanged.
 */
function currencyPlain(value: string): string {
  const stripped = value.replace(/[$,\s]/g, "");
  return /\d/.test(stripped) ? stripped : value;
}

const TRANSFORMS: Record<ValueTransformId, (value: string) => string> = {
  identity,
  date_iso_to_mmddyyyy: dateIsoToMmddyyyy,
  state_name_to_code: stateNameToCode,
  entity_type_to_sf424_option: entityTypeToSf424Option,
  currency_plain: currencyPlain,
};

/** Apply the named transform (defaults to `identity` when `id` is omitted). */
export function applyTransform(value: string, id: ValueTransformId | undefined): string {
  const fn = TRANSFORMS[id ?? "identity"];
  return fn(value);
}
