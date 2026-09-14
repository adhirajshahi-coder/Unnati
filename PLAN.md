# UNNATI — Build & Deploy Plan

Derived from `UNNATI_PRD.docx` (product requirements) and
`UNNATI_Project_Development_Document.docx` (engineering plan).

Tagline: **"Kam Nuksan, Zyada Munafa"** — Less Loss, More Profit.

---

## 1. What we are building

A deployable web application covering the PDD's **Phase 1 → Phase 3** scope, with two
stakeholder roles plus an ops view:

| Role | What they do |
|---|---|
| **Farmer** | List a harvest, see nearby mandis ranked by *net* realisable price, join or create a pooled truck booking, track the truck, see the cost split and income summary |
| **Logistics Operator** | Register trucks, open trips to a mandi, get "best fill" load suggestions, accept farmer loads, push location pings, close out trips |
| **Admin / Ops** | Price-feed health, bookings, users, notification log |

The five PDD core modules all land as real code:

1. **Price Discovery & Auto-Analysis** — net price = gross − transport − spoilage, ranked
2. **Logistics Matching & Pooling** — capacity matching, en-route detour, best-fill bin packing
3. **Tracking** — GPS ping ingestion + live position for everyone on the booking
4. **Notifications** — price alerts, pooling alerts, billing reminders 7 days before due date
5. **Payments / Cost-Split** — proportional split by weight, UPI-style ledger with due dates

---

## 2. Stack decision, and why

The PDD proposes Kotlin/Flutter + NestJS/Spring + Postgres + Redis + Kubernetes. That is the
right *production* target for a funded team. It is the wrong target for "test it and deploy it
on Render this week", and this machine forces the issue:

- **No Python** installed → a FastAPI backend could not be run or tested here at all.
- **No Docker, no local Postgres** → nothing container-based can be verified before pushing.
- **Render has no managed MySQL** → the earlier `unnati-app.zip` prototype (FastAPI + React +
  MySQL) would need an external database provider on top of Render.
- Render's free tier is happiest with **one web service + one Postgres**.

So: **one Next.js service that serves both the UI and the API on a single port.**

| Layer | Choice | Reason |
|---|---|---|
| App | Next.js 15 (App Router) + TypeScript | UI and API in one deployable, one port, one build |
| Styling | Tailwind v4 | Low-literacy UI: big targets, icon-led, high contrast |
| ORM | Drizzle ORM (Postgres dialect) | One schema, two drivers |
| DB (local) | PGlite — real Postgres compiled to WASM | Zero install; lets us actually test here |
| DB (Render) | Render Managed Postgres via `node-postgres` | Same SQL dialect as local |
| Auth | Phone + PIN, signed cookie session, `node:crypto` scrypt | No native deps, no third-party auth service |
| Tests | `node --test` (built into Node 24) | No test framework dependency |
| Deploy | `render.yaml` blueprint | Reproducible, one-click from the repo |

The decision engine is **pure deterministic TypeScript**. No number a farmer sees is produced by
a model — that is a trust requirement from PRD §8 and it stays true here.

---

## 3. Data model

Postgres via Drizzle, mapping the PDD §6 entity list:

```
users          id, phone, pinHash, name, role, language, village, lat, lng
crops          id, name, nameHi, shelfLifeHours, spoilagePctPerDay, perishability
mandis         id, name, nameHi, district, state, lat, lng, commissionPct
price_records  mandiId, cropId, minPrice, modalPrice, maxPrice, source, recordedAt
listings       farmerId, cropId, quantityKg, grade, harvestDate, dispatchBy, status
trucks         operatorId, regNo, vehicleType, capacityKg, ratePerKm, lat, lng, status, rating
trips          truckId, mandiId, originName/lat/lng, departAt, capacityKg, usedKg, status
loads          tripId, farmerId, listingId, quantityKg, pickup, costShare, status
tracking_pings tripId, lat, lng, at
transactions   loadId, amount, kind, status, dueDate, paidAt, upiRef
notifications  userId, type, title, body, channel, scheduledFor, sentAt, readAt
```

## 4. The decision engine (`src/lib/engine/`)

- `geo.ts` — haversine distance, road-distance factor
- `spoilage.ts` — loss % from crop shelf life × transit hours
- `costs.ts` — transport cost, solo vs pooled, proportional split by weight
- `netPrice.ts` — FR-1, FR-2: rank mandis in radius by net realisable price
- `pooling.ts` — FR-4, FR-5, FR-6: en-route matching, best-fill bin packing, cost split

Unit-tested, as PDD §8 requires for price calculation, cost-split and matching.

## 5. Pilot data

Seeded on the **Nashik, Maharashtra** corridor — the canonical Indian post-harvest-loss story:
Lasalgaon (Asia's largest onion market), Pimpalgaon, Yeola, Nashik, Manmad, plus the
high-price distant options Vashi APMC (Navi Mumbai) and Pune Market Yard. Crops: onion,
tomato, grape, pomegranate, wheat, soybean. Demo farmer / operator / admin accounts.

## 6. Build order

1. Scaffold Next.js + deps
2. Schema + driver switch + seed
3. Engine + unit tests
4. Auth + i18n (Hindi / English)
5. Farmer flow → Operator flow → Admin
6. Notification generator
7. Verify: typecheck, unit tests, run the app, walk the flow in a browser
8. `render.yaml`, README, git repo, deployment instructions

## 7. On the Render deployment

Everything needed is committed: blueprint, migrations, idempotent seed, health check.
The final push requires the account holder — pushing to their GitHub and clicking through
Render's dashboard needs their credentials, which are theirs to enter, not mine. The repo is
prepared so that step is: push → New Blueprint → select repo → Apply.
