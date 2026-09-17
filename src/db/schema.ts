/**
 * UNNATI data model.
 *
 * Maps the entity list in the Project Development Document §6 onto Postgres.
 *
 * Money is stored as whole rupees in integer columns. Mandi prices are quoted per
 * quintal (100 kg), which is how Agmarknet and eNAM publish them; quantities are
 * stored in kilograms. Never store money as a float.
 */
import {
  pgTable,
  pgEnum,
  text,
  integer,
  doublePrecision,
  timestamp,
  boolean,
  index,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["FARMER", "OPERATOR", "ADMIN"]);
export const languageEnum = pgEnum("language", ["en", "hi"]);
export const gradeEnum = pgEnum("grade", ["A", "B", "C"]);
export const listingStatusEnum = pgEnum("listing_status", [
  "OPEN", // harvested, not yet assigned to a truck
  "BOOKED", // riding on a trip
  "SOLD", // trip completed, proceeds recorded
  "CANCELLED",
]);
export const truckStatusEnum = pgEnum("truck_status", [
  "AVAILABLE",
  "ON_TRIP",
  "OFFLINE",
]);
export const tripStatusEnum = pgEnum("trip_status", [
  "OPEN", // accepting loads
  "FULL", // at capacity, not yet departed
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED",
]);
export const loadStatusEnum = pgEnum("load_status", [
  "REQUESTED", // farmer asked to join; operator has not accepted
  "CONFIRMED",
  "PICKED_UP",
  "DELIVERED",
  "REJECTED",
  "CANCELLED",
]);
export const txnKindEnum = pgEnum("txn_kind", [
  "TRANSPORT_CHARGE", // farmer owes their share of the truck
  "SALE_PROCEEDS", // mandi paid the farmer
  "PLATFORM_FEE",
  "OPERATOR_SETTLEMENT", // UNNATI pays the truck operator
]);
export const txnStatusEnum = pgEnum("txn_status", [
  "DUE",
  "PAID",
  "FAILED",
  "WAIVED",
]);
export const notifTypeEnum = pgEnum("notif_type", [
  "PRICE_ALERT",
  "POOLING_ALERT",
  "BILLING_REMINDER",
  "TRIP_UPDATE",
  "SPOILAGE_WARNING",
  "SYSTEM",
]);
export const channelEnum = pgEnum("channel", [
  "PUSH",
  "SMS",
  "IVR",
  "IN_APP",
  "WHATSAPP",
]);
export const waDirectionEnum = pgEnum("wa_direction", ["OUTBOUND", "INBOUND"]);
export const waStatusEnum = pgEnum("wa_status", [
  "QUEUED", // written, provider not called yet
  "SENT", // provider accepted it
  "DELIVERED", // reached the handset
  "READ",
  "FAILED",
  "SKIPPED", // opted out, or no credentials configured
]);
export const poolStatusEnum = pgEnum("pool_status", [
  "OPEN", // gathering farmers
  "READY", // enough weight to be worth a truck
  "MATCHED", // an operator took it; a trip now exists
  "EXPIRED", // the dispatch window passed with no truck
  "CANCELLED",
]);

/* ------------------------------------------------------------------ users */

export const users = pgTable(
  "users",
  {
    id: id(),
    phone: text("phone").notNull().unique(),
    pinHash: text("pin_hash").notNull(),
    name: text("name").notNull(),
    role: roleEnum("role").notNull().default("FARMER"),
    language: languageEnum("language").notNull().default("hi"),
    village: text("village"),
    district: text("district"),
    state: text("state"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    /**
     * WhatsApp delivery. Opt-in is stored with the moment it was given because Meta
     * requires a business to be able to show when and how a user consented, and
     * because sending to someone who never agreed is the fastest way to lose the
     * number for everyone.
     */
    whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
    whatsappOptInAt: timestamp("whatsapp_opt_in_at", { withTimezone: true }),
    /** Null means use the login number; some farmers use WhatsApp on a second SIM. */
    whatsappNumber: text("whatsapp_number"),
    /**
     * Last message the user sent us. WhatsApp only allows free-form replies within
     * 24 hours of one; outside that window every message must be a pre-approved
     * template. This is what that clock is read from.
     */
    whatsappLastInboundAt: timestamp("whatsapp_last_inbound_at", {
      withTimezone: true,
    }),
    createdAt: createdAt(),
  },
  (t) => [index("users_role_idx").on(t.role)],
);

/* ------------------------------------------------- reference: crops, mandis */

export const crops = pgTable("crops", {
  id: text("id").primaryKey(), // stable slug, e.g. "onion"
  name: text("name").notNull(),
  nameHi: text("name_hi").notNull(),
  /** Hours from harvest before quality degrades materially, un-refrigerated. */
  shelfLifeHours: integer("shelf_life_hours").notNull(),
  /** Share of value lost per day in transit/holding, as a fraction (0.04 = 4%/day). */
  spoilageRatePerDay: doublePrecision("spoilage_rate_per_day").notNull(),
  /** HIGH / MEDIUM / LOW — drives advisory copy and dispatch warnings. */
  perishability: text("perishability").notNull(),
  /** Packing and handling guidance — PRD §5.4. */
  handlingTip: text("handling_tip").notNull(),
  handlingTipHi: text("handling_tip_hi").notNull(),
  /** Grouping for the crop picker: VEGETABLE / FRUIT / GRAIN / PULSE / OILSEED / SPICE. */
  category: text("category").notNull().default("VEGETABLE"),
  /**
   * Commodity name as Agmarknet spells it, used to match rows from the government
   * feed. Null means no live price is available for this crop and it keeps whatever
   * was last recorded manually.
   */
  agmarknetName: text("agmarknet_name"),
  /**
   * Plausible range for a modal price in Rs/quintal. The government feed carries
   * genuine outliers - a decimal in the wrong place, or a herb priced by a different
   * convention - and a farmer acting on a bad figure is the worst failure this app
   * has. Anything outside the range is rejected at ingest rather than shown.
   */
  sanePriceMin: integer("sane_price_min").notNull().default(200),
  sanePriceMax: integer("sane_price_max").notNull().default(50000),
  /**
   * Prominence in the crop picker: lower comes first. Ordering alphabetically would
   * bury onion, tomato and potato behind apple and bajra, which is backwards for
   * every farmer who opens this screen. Farmer-added crops sort last.
   */
  sortOrder: integer("sort_order").notNull().default(999),
  /** True for a crop a farmer added themselves rather than one we shipped. */
  isCustom: boolean("is_custom").notNull().default(false),
  createdBy: text("created_by"),
});

export const mandis = pgTable(
  "mandis",
  {
    id: text("id").primaryKey(), // stable slug, e.g. "lasalgaon"
    name: text("name").notNull(),
    nameHi: text("name_hi").notNull(),
    district: text("district").notNull(),
    state: text("state").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    /** Arhtiya / APMC commission withheld at sale, as a fraction. */
    commissionRate: doublePrecision("commission_rate").notNull().default(0.02),
    /** Per-quintal mandi entry + labour charges in rupees. */
    marketFeePerQuintal: integer("market_fee_per_quintal").notNull().default(0),
    /** Pilot grouping shown in the UI, e.g. "NCR" or "Nashik". */
    region: text("region").notNull().default("Other"),
    /**
     * How this mandi is spelled in the Agmarknet feed. The feed has no coordinates,
     * so every mandi we can place on a map is listed here with the keys needed to
     * pull its live prices. Null means prices for it are entered manually.
     */
    agmarknetMarket: text("agmarknet_market"),
    agmarknetState: text("agmarknet_state"),
    agmarknetDistrict: text("agmarknet_district"),
  },
  (t) => [index("mandis_district_idx").on(t.district)],
);

export const priceRecords = pgTable(
  "price_records",
  {
    id: id(),
    mandiId: text("mandi_id")
      .notNull()
      .references(() => mandis.id, { onDelete: "cascade" }),
    cropId: text("crop_id")
      .notNull()
      .references(() => crops.id, { onDelete: "cascade" }),
    minPrice: integer("min_price").notNull(), // ₹ per quintal
    modalPrice: integer("modal_price").notNull(),
    maxPrice: integer("max_price").notNull(),
    arrivalsQuintal: integer("arrivals_quintal"),
    /** "AGMARKNET" | "ENAM" | "FIELD_VERIFIED" — cited in the UI per PRD §8. */
    source: text("source").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("price_mandi_crop_idx").on(t.mandiId, t.cropId, t.recordedAt)],
);

/* ------------------------------------------------------------- farmer side */

export const listings = pgTable(
  "listings",
  {
    id: id(),
    farmerId: text("farmer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cropId: text("crop_id")
      .notNull()
      .references(() => crops.id),
    quantityKg: integer("quantity_kg").notNull(),
    grade: gradeEnum("grade").notNull().default("B"),
    harvestedAt: timestamp("harvested_at", { withTimezone: true }).notNull(),
    /** Must leave the farm by this time or spoilage risk becomes material. */
    dispatchBy: timestamp("dispatch_by", { withTimezone: true }).notNull(),
    pickupName: text("pickup_name").notNull(),
    pickupLat: doublePrecision("pickup_lat").notNull(),
    pickupLng: doublePrecision("pickup_lng").notNull(),
    status: listingStatusEnum("status").notNull().default("OPEN"),
    createdAt: createdAt(),
  },
  (t) => [index("listings_farmer_idx").on(t.farmerId, t.status)],
);

/* ---------------------------------------------------------- logistics side */

export const trucks = pgTable(
  "trucks",
  {
    id: id(),
    operatorId: text("operator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    regNo: text("reg_no").notNull().unique(),
    vehicleType: text("vehicle_type").notNull(), // "Tata 407", "Eicher 14ft", ...
    capacityKg: integer("capacity_kg").notNull(),
    /** Operator's asking rate in ₹ per km for the whole vehicle. */
    ratePerKm: integer("rate_per_km").notNull(),
    status: truckStatusEnum("status").notNull().default("AVAILABLE"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    ratingSum: integer("rating_sum").notNull().default(0),
    ratingCount: integer("rating_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("trucks_operator_idx").on(t.operatorId)],
);

export const trips = pgTable(
  "trips",
  {
    id: id(),
    truckId: text("truck_id")
      .notNull()
      .references(() => trucks.id, { onDelete: "cascade" }),
    mandiId: text("mandi_id")
      .notNull()
      .references(() => mandis.id),
    originName: text("origin_name").notNull(),
    originLat: doublePrecision("origin_lat").notNull(),
    originLng: doublePrecision("origin_lng").notNull(),
    departAt: timestamp("depart_at", { withTimezone: true }).notNull(),
    capacityKg: integer("capacity_kg").notNull(),
    /** Denormalised sum of confirmed load weights; kept in step by the booking service. */
    usedKg: integer("used_kg").notNull().default(0),
    /** Whole-vehicle cost for the run, in rupees; split across loads by weight. */
    totalCost: integer("total_cost").notNull(),
    baseDistanceKm: doublePrecision("base_distance_km").notNull(),
    status: tripStatusEnum("status").notNull().default("OPEN"),
    createdAt: createdAt(),
  },
  (t) => [index("trips_mandi_status_idx").on(t.mandiId, t.status, t.departAt)],
);

export const loads = pgTable(
  "loads",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    farmerId: text("farmer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingId: text("listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    cropId: text("crop_id")
      .notNull()
      .references(() => crops.id),
    quantityKg: integer("quantity_kg").notNull(),
    grade: gradeEnum("grade").notNull().default("B"),
    pickupName: text("pickup_name").notNull(),
    pickupLat: doublePrecision("pickup_lat").notNull(),
    pickupLng: doublePrecision("pickup_lng").notNull(),
    /** Detour this pickup adds to the trip, in km — feeds the fairness of the split. */
    detourKm: doublePrecision("detour_km").notNull().default(0),
    /** This farmer's share of totalCost, in rupees. Recomputed whenever the trip changes. */
    costShare: integer("cost_share").notNull().default(0),
    /** What the mandi actually paid, filled in on delivery. */
    salePricePerQuintal: integer("sale_price_per_quintal"),
    status: loadStatusEnum("status").notNull().default("REQUESTED"),
    createdAt: createdAt(),
  },
  (t) => [
    index("loads_trip_idx").on(t.tripId, t.status),
    index("loads_farmer_idx").on(t.farmerId),
  ],
);

export const trackingPings = pgTable(
  "tracking_pings",
  {
    id: id(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    speedKmph: doublePrecision("speed_kmph"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pings_trip_idx").on(t.tripId, t.at)],
);

/* ------------------------------------------------ money and communications */

export const transactions = pgTable(
  "transactions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    loadId: text("load_id").references(() => loads.id, { onDelete: "cascade" }),
    tripId: text("trip_id").references(() => trips.id, { onDelete: "cascade" }),
    kind: txnKindEnum("kind").notNull(),
    amount: integer("amount").notNull(), // rupees; positive = owed to/by per kind
    status: txnStatusEnum("status").notNull().default("DUE"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    upiRef: text("upi_ref"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("txn_user_idx").on(t.userId, t.status, t.dueDate)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notifTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    titleHi: text("title_hi"),
    bodyHi: text("body_hi"),
    channel: channelEnum("channel").notNull().default("IN_APP"),
    /** FR-9: billing reminders are written with scheduledFor = dueDate − 7 days. */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    href: text("href"),
    createdAt: createdAt(),
  },
  (t) => [index("notif_user_idx").on(t.userId, t.scheduledFor)],
);

/* ----------------------------------------------------- farmer-led pooling */

/**
 * A group of farmers gathering to share a truck that does not exist yet.
 *
 * The trip-based pooling above only helps when an operator has already opened a run.
 * A smallholder with ten quintal usually has no such run to join, and quoting them a
 * whole vehicle is the exact problem this product exists to solve (PRD section 5.2:
 * "if no truck available, the farmer can book a new truck and the app opens its
 * remaining capacity to other nearby farmers").
 *
 * So a farmer can start the group instead. Neighbours going to the same mandi join,
 * and once the combined load is worth a vehicle an operator claims it and it becomes
 * a real trip. Demand organises itself before supply is committed.
 */
export const pools = pgTable(
  "pools",
  {
    id: id(),
    mandiId: text("mandi_id")
      .notNull()
      .references(() => mandis.id, { onDelete: "cascade" }),
    /** Anchored on the farmer who started it; later members add a detour from here. */
    originName: text("origin_name").notNull(),
    originLat: doublePrecision("origin_lat").notNull(),
    originLng: doublePrecision("origin_lng").notNull(),
    /** When the group wants to leave. Past this with no truck, it expires. */
    targetDepartAt: timestamp("target_depart_at", { withTimezone: true }).notNull(),
    /** Capacity of the vehicle the group is aiming to fill. */
    targetCapacityKg: integer("target_capacity_kg").notNull(),
    distanceKm: doublePrecision("distance_km").notNull(),
    status: poolStatusEnum("status").notNull().default("OPEN"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Set when an operator claims the group and a real trip is created. */
    tripId: text("trip_id").references(() => trips.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("pools_mandi_status_idx").on(t.mandiId, t.status, t.targetDepartAt)],
);

export const poolMembers = pgTable(
  "pool_members",
  {
    id: id(),
    poolId: text("pool_id")
      .notNull()
      .references(() => pools.id, { onDelete: "cascade" }),
    farmerId: text("farmer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingId: text("listing_id").references(() => listings.id, {
      onDelete: "set null",
    }),
    cropId: text("crop_id")
      .notNull()
      .references(() => crops.id),
    quantityKg: integer("quantity_kg").notNull(),
    grade: gradeEnum("grade").notNull().default("B"),
    pickupName: text("pickup_name").notNull(),
    pickupLat: doublePrecision("pickup_lat").notNull(),
    pickupLng: doublePrecision("pickup_lng").notNull(),
    detourKm: doublePrecision("detour_km").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("pool_members_pool_idx").on(t.poolId)],
);

/**
 * Every WhatsApp message in or out.
 *
 * Kept separately from `notifications` because the two answer different questions.
 * A notification is what the app decided to tell someone; this is what actually
 * reached their handset, when, and what the carrier said about it. "Sent" that nobody
 * confirmed is not delivery, and on a channel a farmer is relying on for a payment
 * reminder the difference matters.
 */
export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notificationId: text("notification_id").references(() => notifications.id, {
      onDelete: "set null",
    }),
    direction: waDirectionEnum("direction").notNull().default("OUTBOUND"),
    /** Null for a free-form reply inside the 24-hour window, and for inbound. */
    templateName: text("template_name"),
    /** What was actually sent or received, for the ops view and for disputes. */
    body: text("body").notNull(),
    status: waStatusEnum("status").notNull().default("QUEUED"),
    /** The provider's id, which delivery receipts arrive against. */
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    index("wa_user_idx").on(t.userId, t.createdAt),
    index("wa_provider_idx").on(t.providerMessageId),
  ],
);

/** Single-row table recording the last successful price-feed ingest, for the ops view. */
export const feedHealth = pgTable("feed_health", {
  id: text("id").primaryKey(), // source name
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull(),
  recordsIngested: integer("records_ingested").notNull().default(0),
  ok: boolean("ok").notNull().default(true),
  message: text("message"),
});

export type User = typeof users.$inferSelect;
export type Crop = typeof crops.$inferSelect;
export type Mandi = typeof mandis.$inferSelect;
export type PriceRecord = typeof priceRecords.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type Truck = typeof trucks.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type Load = typeof loads.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Pool = typeof pools.$inferSelect;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type PoolMember = typeof poolMembers.$inferSelect;
