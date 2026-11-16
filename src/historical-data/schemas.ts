/**
 * Castle Map data model.
 *
 * These Zod schemas are the single source of truth for every historical record.
 * They are used by the build pipeline (scripts/build-data) to validate curated and
 * imported data, and their inferred TypeScript types are used throughout the app.
 *
 * Conventions
 * - Coordinates are GeoJSON order: [longitude, latitude] in WGS84.
 * - Unknown values are `null`, never 0. A missing casualty figure is unknown, not zero.
 * - IDs are stable, lowercase, hyphenated strings with a type prefix (e.g. "castle-", "evt-").
 */
import { z } from 'zod';

export const Confidence = z.enum(['high', 'medium', 'low', 'very-low']);
export type DataConfidence = z.infer<typeof Confidence>;

/** How a record entered the dataset. */
export const Provenance = z.enum([
  'curated', // hand-compiled record with cited references
  'historic-england', // Historic England National Heritage List (OGL)
  'hes', // Historic Environment Scotland designations (OGL)
  'wikidata', // Wikidata (CC0) — crowd-sourced, lower confidence
]);
export type Provenance = z.infer<typeof Provenance>;

/**
 * Verification state of a record. Curated records compiled from reference knowledge
 * without page-level checking are "compiled-unverified" and say so in the UI.
 */
export const Verification = z.enum(['source-checked', 'compiled-unverified', 'imported-unreviewed']);
export type Verification = z.infer<typeof Verification>;

export const LngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LngLat = z.infer<typeof LngLat>;

/** ISO-like partial date: "1066", "1066-10", "1066-10-14". */
export const PartialDate = z.string().regex(/^\d{3,4}(-\d{2}(-\d{2})?)?$/, 'Expected YYYY, YYYY-MM or YYYY-MM-DD');

export const DatePrecision = z.enum(['day', 'month', 'year', 'decade', 'century', 'range']);

/**
 * A historical date or date range.
 * `from` is the earliest supported date, `to` the latest (inclusive). For a single
 * day both are equal or `to` is omitted. `approximate` marks dates the sources give
 * as "c." or that are reconstructed; `disputed` marks dates where sources disagree.
 */
export const HistoricalDate = z.object({
  from: PartialDate,
  to: PartialDate.optional(),
  precision: DatePrecision,
  approximate: z.boolean().default(false),
  disputed: z.boolean().default(false),
  display: z.string().optional(),
  note: z.string().optional(),
});
export type HistoricalDate = z.infer<typeof HistoricalDate>;

/** A citation of a register source supporting a specific statement. */
export const Citation = z.object({
  sourceId: z.string(),
  pages: z.string().optional(),
  supports: z.string().optional(),
});
export type Citation = z.infer<typeof Citation>;

export const SourceKind = z.enum(['dataset', 'book', 'article', 'website', 'primary', 'register']);

export const SourceReference = z.object({
  id: z.string().regex(/^src-[a-z0-9-]+$/),
  kind: SourceKind,
  publisher: z.string(),
  title: z.string(),
  author: z.string().nullable().default(null),
  publicationDate: z.string().nullable().default(null),
  url: z.string().url().nullable().default(null),
  bibliographic: z.string().nullable().default(null),
  accessDate: z.string().nullable().default(null),
  licence: z.string().nullable().default(null),
  attribution: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});
export type SourceReference = z.infer<typeof SourceReference>;

/* ------------------------------------------------------------------ */
/* Location and spatial uncertainty                                    */
/* ------------------------------------------------------------------ */

export const LocationKind = z.enum([
  'verified-point', // position supported by archaeology or an official register
  'approximate-point', // general position known; uncertainty radius given
  'area', // event spread over / only known within an area
  'disputed', // two or more scholarly candidate sites
  'multiple', // event genuinely occurred at several distinct places
  'unknown', // too uncertain to map meaningfully
]);
export type LocationKind = z.infer<typeof LocationKind>;

export const LocationAlternative = z.object({
  point: LngLat,
  label: z.string(),
  /** Relative weight; alternatives are normalised to sum to 1. Equal weights unless sources favour one. */
  weight: z.number().positive().default(1),
});

export const EventLocation = z.object({
  kind: LocationKind,
  /** Representative point (required unless kind is "unknown"). */
  point: LngLat.nullable().default(null),
  /** Positional uncertainty radius in km (approximate-point and area). */
  uncertaintyKm: z.number().nonnegative().nullable().default(null),
  /** Reference to an official battlefield polygon, e.g. "he-1000043" or "hes-BTL1". */
  polygonRef: z.string().nullable().default(null),
  alternatives: z.array(LocationAlternative).default([]),
  placeName: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
  /** Build-time sample points inside an official battlefield polygon; heat is spread evenly across them. */
  samples: z.array(LngLat).default([]),
});
export type EventLocation = z.infer<typeof EventLocation>;

export const Country = z.enum(['England', 'Scotland', 'Wales', 'Cross-border', 'Unknown']);
export type Country = z.infer<typeof Country>;

/* ------------------------------------------------------------------ */
/* Castles                                                             */
/* ------------------------------------------------------------------ */

export const CastleClass = z.enum([
  'motte-and-bailey',
  'ringwork',
  'stone-keep',
  'enclosure',
  'concentric',
  'quadrangular',
  'tower-house',
  'peel-tower',
  'fortified-manor',
  'artillery-fort',
  'royal-castle',
  'welsh-native',
  'castle-unspecified',
]);
export type CastleClass = z.infer<typeof CastleClass>;

export const CastleCondition = z.enum(['intact', 'altered-in-use', 'ruin', 'earthwork', 'lost', 'unknown']);
export type CastleCondition = z.infer<typeof CastleCondition>;

export const CastlePhase = z.object({
  date: HistoricalDate,
  description: z.string(),
  citations: z.array(Citation).default([]),
});

export const CastleOwner = z.object({
  name: z.string(),
  authorityId: z.string().nullable().default(null),
  from: PartialDate.nullable().default(null),
  to: PartialDate.nullable().default(null),
  note: z.string().nullable().default(null),
});

export const ControlChange = z.object({
  date: HistoricalDate,
  from: z.string().nullable().default(null),
  to: z.string(),
  description: z.string(),
  eventId: z.string().nullable().default(null),
});

export const Castle = z.object({
  id: z.string().regex(/^castle-[a-z0-9-]+$/),
  name: z.string().min(1),
  altNames: z.array(z.string()).default([]),
  country: Country,
  region: z.string().nullable().default(null),
  coord: LngLat,
  locationAccuracy: z.enum(['precise', 'approximate', 'uncertain']),
  classification: CastleClass,
  classificationConfidence: Confidence.default('medium'),
  /** Earliest known construction (date or range). null = unknown; the castle is then "undated". */
  built: HistoricalDate.nullable().default(null),
  phases: z.array(CastlePhase).default([]),
  owners: z.array(CastleOwner).default([]),
  eventIds: z.array(z.string()).default([]),
  controlChanges: z.array(ControlChange).default([]),
  /** Destruction, slighting or abandonment, where known. The castle is NOT hidden after this date. */
  endOfUse: z
    .object({ date: HistoricalDate, kind: z.enum(['slighted', 'destroyed', 'demolished', 'abandoned', 'ruinous']), note: z.string().nullable().default(null) })
    .nullable()
    .default(null),
  condition: CastleCondition,
  summary: z.string().nullable().default(null),
  significance: z.string().nullable().default(null),
  /** 1 (minor) – 5 (major). Derived from data (curation status, linked events); controls label priority only. */
  importance: z.number().int().min(1).max(5).default(1),
  sources: z.array(Citation).min(1),
  confidence: Confidence,
  provenance: Provenance,
  verification: Verification,
  /** Reasons a record needs human review (e.g. 'post-1700 inception', 'possible country house'). */
  reviewFlags: z.array(z.string()).default([]),
  externalIds: z
    .object({
      wikidata: z.string().optional(),
      nhle: z.string().optional(),
      canmore: z.string().optional(),
      hesDesignation: z.string().optional(),
      cadw: z.string().optional(),
      wikipedia: z.string().optional(),
    })
    .default({}),
});
export type Castle = z.infer<typeof Castle>;

/* ------------------------------------------------------------------ */
/* Historical events (battles, sieges, raids, campaigns...)            */
/* ------------------------------------------------------------------ */

export const EventType = z.enum([
  'battle',
  'siege',
  'raid',
  'skirmish',
  'rebellion',
  'campaign',
  'massacre',
  'air-raid',
  'political-change',
]);
export type EventType = z.infer<typeof EventType>;

export const Participant = z.object({
  name: z.string(),
  authorityId: z.string().nullable().default(null),
  side: z.string().nullable().default(null),
});

export const Commander = z.object({ name: z.string(), side: z.string().nullable().default(null), note: z.string().nullable().default(null) });

export const HistoricalEvent = z.object({
  id: z.string().regex(/^evt-[a-z0-9-]+$/),
  name: z.string(),
  altNames: z.array(z.string()).default([]),
  type: EventType,
  date: HistoricalDate,
  location: EventLocation,
  country: Country,
  region: z.string().nullable().default(null),
  participants: z.array(Participant).default([]),
  commanders: z.array(Commander).default([]),
  narrative: z.string().nullable().default(null),
  outcome: z.string().nullable().default(null),
  castleIds: z.array(z.string()).default([]),
  /** Parent campaign / war / rebellion this event belongs to. Used for double-count prevention. */
  parentId: z.string().nullable().default(null),
  disagreements: z.array(z.string()).default([]),
  sources: z.array(Citation).min(1),
  confidence: Confidence,
  provenance: Provenance,
  verification: Verification,
  /** Reasons a record needs human review (e.g. 'post-1700 inception', 'possible country house'). */
  reviewFlags: z.array(z.string()).default([]),
  /** Documented sequence of places (campaign itineraries only). Straight segments are schematic. */
  itinerary: z
    .array(z.object({ point: LngLat, label: z.string(), date: PartialDate.nullable().default(null) }))
    .default([]),
  externalIds: z.object({ wikidata: z.string().optional(), heListEntry: z.string().optional(), hesBattlefield: z.string().optional() }).default({}),
  /** Crowd-sourced Wikidata death figure kept ONLY for comparison; never used in calculations. */
  wikidataDeathsForComparison: z.number().nullable().default(null),
});
export type HistoricalEvent = z.infer<typeof HistoricalEvent>;

export type Battle = HistoricalEvent & { type: 'battle' };
export type Siege = HistoricalEvent & { type: 'siege' };
export type Campaign = HistoricalEvent & { type: 'campaign' };

/* ------------------------------------------------------------------ */
/* Casualties                                                          */
/* ------------------------------------------------------------------ */

const CountRange = z.object({ min: z.number().int().nonnegative().nullable(), max: z.number().int().nonnegative().nullable() });

export const CasualtyEstimate = z
  .object({
    /** Unique casualty account ID. One death may appear in only one leaf account. */
    id: z.string().regex(/^cas-[a-z0-9-]+$/),
    eventId: z.string(),
    /**
     * "event": deaths at a single event.
     * "aggregate": deaths across a campaign/war/period. If child accounts exist, only the
     * residual (aggregate minus children) is spatialised, so nothing is counted twice.
     */
    scope: z.enum(['event', 'aggregate']),
    /** Accounts whose deaths are contained within this aggregate account. */
    includesAccountIds: z.array(z.string()).default([]),
    /** Alternative accounts of the same deaths (e.g. contemporary claim vs modern estimate). Only `preferred` accounts are used. */
    alternativeOf: z.string().nullable().default(null),
    preferred: z.boolean().default(true),
    killedMin: z.number().int().nonnegative().nullable().default(null),
    killedMax: z.number().int().nonnegative().nullable().default(null),
    killedCentral: z.number().int().nonnegative().nullable().default(null),
    category: z.enum(['military', 'civilian', 'mixed', 'unknown']),
    side: z.string().nullable().default(null),
    wounded: CountRange.nullable().default(null),
    captured: CountRange.nullable().default(null),
    missing: CountRange.nullable().default(null),
    method: z.enum(['contemporary-claim', 'modern-estimate', 'official-record', 'burial-record', 'mixed']),
    sources: z.array(Citation).min(1),
    confidence: Confidence,
    notes: z.string().nullable().default(null),
  })
  .refine((c) => c.killedMin === null || c.killedMax === null || c.killedMin <= c.killedMax, {
    message: 'killedMin must be <= killedMax',
  });
export type CasualtyEstimate = z.infer<typeof CasualtyEstimate>;

/* ------------------------------------------------------------------ */
/* Political authorities and territories                               */
/* ------------------------------------------------------------------ */

export const PoliticalAuthority = z.object({
  id: z.string().regex(/^auth-[a-z0-9-]+$/),
  name: z.string(),
  altNames: z.array(z.string()).default([]),
  kind: z.enum(['kingdom', 'principality', 'lordships', 'earldom', 'commonwealth', 'union-state', 'crown-territory']),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  description: z.string(),
  sources: z.array(Citation).min(1),
});
export type PoliticalAuthority = z.infer<typeof PoliticalAuthority>;

/**
 * Geometry of a territory is built from named geographic units by set operations:
 * union(include) minus union(exclude), clipped to the land of Great Britain.
 * Units are either modern map units ("ne:England") used purely as a geographic
 * convenience where the boundary is historically comparable, or schematic zones
 * ("zone:...") drawn coarsely and flagged as approximate.
 */
export const Territory = z.object({
  id: z.string().regex(/^terr-[a-z0-9-]+$/),
  authorityId: z.string(),
  name: z.string(),
  validFrom: z.number().int(),
  /** Inclusive last year. */
  validTo: z.number().int(),
  include: z.array(z.string()).min(1),
  exclude: z.array(z.string()).default([]),
  boundaryStatus: z.enum(['documented-approximate', 'schematic', 'disputed']),
  confidence: Confidence,
  notes: z.string(),
  sources: z.array(Citation).min(1),
});
export type Territory = z.infer<typeof Territory>;

export const TerritorialTransition = z.object({
  id: z.string().regex(/^trans-[a-z0-9-]+$/),
  year: z.number().int(),
  date: HistoricalDate,
  title: z.string(),
  description: z.string(),
  territoryIds: z.array(z.string()).default([]),
  eventId: z.string().nullable().default(null),
  kind: z.enum(['conquest', 'treaty', 'succession', 'union', 'legislation', 'cession']),
  sources: z.array(Citation).min(1),
  confidence: Confidence,
});
export type TerritorialTransition = z.infer<typeof TerritorialTransition>;

/* Uncertainty of a record's location, as exposed to the UI. */
export type LocationUncertainty = Pick<EventLocation, 'kind' | 'uncertaintyKm' | 'alternatives' | 'note'>;
