# UNNATI

**कम नुकसान, ज़्यादा मुनाफ़ा** — less loss, more profit.

A decision tool for smallholder farmers: **which mandi to sell at, on whose truck, and
whether to share it with neighbours** — ranked by what the farmer actually takes home
after commission, transport and spoilage.

Built from `UNNATI_PRD.docx` and `UNNATI_Project_Development_Document.docx`, covering
the development document's Phase 1 → Phase 3 scope.

---

## The idea in one screen

The mandi with the highest price board is frequently not the one that leaves a farmer
the most money. From the seeded pilot data, for 12 quintal of tomato leaving Niphad:

| Mandi | Board price | Distance | Net to farmer |
|---|---:|---:|---:|
| **Vashi APMC, Navi Mumbai** (shared truck) | ₹2,136 | 210 km | **₹20,757** |
| Pimpalgaon Baswant | ₹1,372 | 21 km | ₹14,559 |
| Nashik APMC | ₹1,463 | 45 km | ₹14,497 |
| Lasalgaon APMC | ₹1,270 | 20 km | ₹13,432 |
| Pune Market Yard | ₹1,866 | 233 km | ₹10,746 |

Pune quotes a **36% higher board price than Pimpalgaon and finishes last**, because
hiring a truck 233 km alone costs more than the premium is worth. Vashi wins only
because a truck is already going there with room on it — which is the entire argument
for the pooling marketplace.

Every figure above is a line item on screen. Nothing is rolled up or hidden.

---

## Quick start

Requires Node 20.11 or newer. Nothing else — no Docker, no Postgres to install.

```bash
npm install
npm run db:seed
npm run dev
```

Open **http://localhost:3100**.

With `DATABASE_URL` unset the app runs on [PGlite](https://pglite.dev) — real Postgres
compiled to WebAssembly, stored in `.data/pglite` — and applies its own migrations on
first connect. Production uses a real Postgres server through the same schema and the
same SQL.

### Demo accounts

PIN is `1234` for all of them.

| Phone | Who | Role |
|---|---|---|
| `9000000001` | Ramesh Pawar, Vinchur | Farmer |
| `9000000002` | Sunita Jadhav, Niphad | Farmer |
| `9000000011` | Rajbir Singh, Kharkhoda (Sonipat) | Farmer, NCR |
| `9000000012` | Anita Yadav, Najafgarh (Delhi) | Farmer, NCR |
| `9111111111` | Santosh Transport, Niphad | Truck operator |
| `9111111113` | Dahiya Roadlines, Kharkhoda | Truck operator, NCR |
| `9999999999` | UNNATI Ops | Admin |

### Where it covers

**Delhi NCR** — Azadpur, Ghazipur, Okhla, Narela, Keshopur, Noida, Ghaziabad,
Faridabad, Gurugram, Sonipat, Bahadurgarh, Palwal, Tauru, Sohna, Meerut, Khurja,
Panipat — and the **Nashik corridor** plus the Vashi and Pune terminal markets:
25 mandis, all with real coordinates. **35 crops** across vegetables, fruits, grains,
pulses and oilseeds, and a farmer can add one the list is missing.

### A five-minute walkthrough

1. Sign in as **Sunita** → *Sell produce* → pick tomato, 12 quintal → **Find the best
   mandi**. Read the slip: commission, market fee, transport, spoilage, then the stamp.
2. Tap **Share this truck**. The quote, the saving against hiring alone, and the two
   farmers already aboard with their exact shares.
3. Sign in as **Santosh** → open the Vashi trip. The **best fill** panel says which
   pending request to take and what it earns net of its detour. Accept it.
4. Back as Sunita: her share appears, every other farmer's share **drops**, and a
   payment reminder is scheduled for seven days before the due date.
5. As Santosh: **Start journey**, then **Send location**. Sunita's trip view tracks it.
6. Sign in as **Rajbir** (NCR) → *Nearby mandis*. Seventeen markets by distance with
   today's prices; the badged ones are live from the government feed.
7. Sign in as **Ops** for feed health, fill rates, money, and **Refresh live prices**.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3100 |
| `npm run build` | Production build |
| `npm start` | Serve the production build (reads `PORT`) |
| `npm test` | Unit tests (75, Node's built-in runner) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenerate SQL migrations after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to a real Postgres (needs `DATABASE_URL`) |
| `npm run db:seed` | Load the crop catalogue, mandis and pilot demo data (idempotent) |
| `npm run db:ingest` | Pull current mandi prices from the government feed |
| `npm run db:reset` | Delete the local PGlite database |

---

## How it is built

```
Browser
   │  same-origin HTTP
   ▼
Next.js 15 — one service, one port
   │
   ├── app/            pages (Server Components) and API routes
   ├── components/     the slip, the shell, the client-side forms
   ├── lib/
   │   ├── engine/     THE DECISION ENGINE — pure, deterministic, no I/O
   │   ├── booking.ts  orchestration: the only place routes and engine meet
   │   ├── notifications.ts
   │   ├── auth.ts     phone + PIN, scrypt, signed cookie sessions
   │   └── i18n.ts     Hindi and English
   └── db/             Drizzle schema + driver switch
   │
   ▼
Postgres   — PGlite locally, Render Managed Postgres in production
```

**Nothing a farmer is shown comes from a language model.** Every rupee on screen is
computed by `src/lib/engine/`, which is pure TypeScript with no network calls and no
database access, and is unit-tested. PRD §8 makes transparent, checkable pricing a
requirement; an opaque model would fail it.

### The engine

| File | Responsibility | Requirement |
|---|---|---|
| `geo.ts` | Haversine, road-distance estimate, detour, transit time | — |
| `spoilage.ts` | Value lost to time, from crop shelf life and grade | PRD §5.1 |
| `costs.ts` | Trip cost and the cost-split rule | FR-6 |
| `netPrice.ts` | Rank mandis by net realisable price | FR-1, FR-2 |
| `pooling.ts` | En-route matching, best-fill packing, loading order | FR-4, FR-5 |
| `grouping.ts` | Vehicle choice and cost projection for a group that has no truck yet | FR-4, PRD §5.2 |
| `sources.ts` | Which of two prices for the same mandi to believe | PRD §12 |

**The cost-split rule**, shown to farmers in these words:

1. The shared leg — the run the truck would have made anyway — splits **by weight**.
2. A detour made to collect one farmer is charged **to that farmer alone**.

Splitting purely by weight would make a farmer on the highway subsidise one 20 km off
it. Splitting purely by distance would let someone send 50 kg for the price of three
tonnes. Rounding remainders go to the largest load, so the shares always sum to exactly
the trip cost — there is never a stray rupee.

**Best fill** is a 0/1 knapsack solved exactly by dynamic programming over 25 kg
buckets, maximising net value rather than weight: a heavy load fetched from 30 km off
the route can be worth less to a trip than a lighter one already on it. Above 22
candidates it falls back to a greedy pass by value density.

### Requirements coverage

| | | |
|---|---|---|
| FR-1 | Mandi prices within a configurable radius | `netPrice.ts`, radius slider 10–300 km; `/mandis` browses them by distance |
| FR-2 | Net realisable price per mandi | `netPrice.ts`, itemised on the slip |
| FR-3 | Operators list vehicle, capacity, availability | `/operator/trucks` |
| FR-4 | Match capacity to loads going the same way | `findJoinableTrips` for open runs, `pools.ts` for farmer-led groups, both detour-bounded |
| FR-5 | Suggest the optimal load combination | `bestFill`, exact DP |
| FR-6 | Split transport cost proportionally | `splitCost`, recomputed on every change |
| FR-7 | Real-time tracking for everyone on a booking | `/api/trips/[id]/ping`, `/farmer/trip/[id]` |
| FR-8 | Price and pooling notifications | `notifications.ts`; opening a trip alerts farmers within 35 km |
| FR-9 | Billing notice **7 days** before the due date | `chargeWithReminder` — a payable cannot be created without one |
| FR-10 | Regional language support | Hindi and English throughout, stored per user |
| FR-11 | Transaction log for income tracking | `/farmer/earnings` |

FR-9 is enforced structurally rather than by convention: the only function that writes
a payable also writes its reminder, so the rule cannot be skipped by forgetting a call.
A reminder whose time has not arrived stays out of the inbox — it is a scheduled
promise, not a message.

### What is deliberately not real

Honest about the seams, so nobody demonstrates these as working integrations:

- **Mandi prices are live** where the government feed reports them, and shipped
  baselines where it does not — every figure on screen carries its source and age, and
  live ones are badged. See "Live prices" below.
- **Payments** record settlement directly instead of calling a UPI gateway. The button
  says so. `/api/transactions/[id]/pay` is where the gateway goes.
- **SMS and IVR** are stored with the right channel and timing but not dispatched to a
  carrier. `notify()` is the handoff point.
- **Registration has no OTP.** Anyone can register any number. This must be fixed
  before real users — see `/api/auth/register`.
- **Tracking** accepts real GPS from the driver's handset; when the browser refuses
  location it advances the truck along its route rather than inventing a position that
  claims to be measured.

---

## Sharing a truck

A smallholder with five quintal cannot fill a vehicle. Quoting them a whole truck is
the problem this product exists to solve, so the app offers two routes to a shared one
and always prices both against going alone.

**Join a truck already running.** When an operator has an open trip to that mandi with
room, the farmer buys space on it. Handled in `booking.ts`.

**Start a group when no truck is running**, which is the common case. The farmer says
where they want to send produce and by when; neighbours within 40 km of the route
join; the cost per farmer falls as weight accumulates; and once the group passes 60%
of a vehicle an operator can claim it — at which point it becomes an ordinary trip
with confirmed loads, a weight-based cost split and a payable per farmer. Handled in
`pools.ts`, projected by `engine/grouping.ts`.

From the demo data — 5 quintal of onion from Kharkhoda to Noida APMC, 70 km:

| | Cost to the farmer |
|---|---:|
| Hire a truck alone (Ashok Leyland Dost) | ₹1,551 |
| Share a Tata 407 with a 24-quintal group | ₹499 |
| The same truck, filled | ₹299 |

**The figure shown is what the group costs at its current size, never what it would
cost full.** A price the group might never reach is not a price, it is bait — so the
screen carries the cost now, the cost if it fills, and the solo cost together, and
says plainly when the group is still too small to beat hiring alone.

Two rules keep the split honest. Both were wrong first and were caught by testing:

- *The solo comparison uses the truck the farmer would really hire*, sized to their
  own load. Comparing against the group's larger vehicle inflated the saving from 61%
  to 75%, by charging the solo case for capacity the farmer would never have bought.
- *A detour is charged to whoever caused it, and refused when it is too long.* A test
  farmer 112 km off the route was billed ₹4,925 against a ₹1,551 solo cost, because
  the detour cap applied when browsing groups but not when joining one by link. It is
  enforced on the join itself now, with a message saying why and what to do instead.

---

## Live prices

Mandi prices come from the Government of India **Agmarknet** feed on data.gov.in
(resource `9ef84268-d588-465a-a308-a864a43d0070`, published by the Ministry of
Agriculture and Farmers Welfare), in rupees per quintal — the same unit this app
stores, so nothing is converted.

```bash
# free key, about a minute to register at https://data.gov.in
echo 'DATA_GOV_API_KEY=your-key-here' >> .env.local
npm run db:ingest
```

Or press **Refresh live prices** on the admin dashboard. On Render a cron service runs
it four times a day — Agmarknet markets report through the morning and afternoon, so a
single overnight run would miss most of them.

Without a key the app still works: it serves the baseline prices shipped in
`src/data/crops.ts` and labels them as such. It never presents an estimate as live.

**Three things this connector has to handle, and does:**

*The feed has no coordinates.* It reports state, district and market name only. Since
distance is the basis of every ranking here, prices are pulled only for the mandis in
`src/data/mandis.ts`, which carry real coordinates and the keys to match the feed.

*The feed carries genuine outliers.* A live response really does quote coriander
leaves at ₹32,528/quintal. Every crop declares a plausible price range and anything
outside it is rejected at ingest — a typical run stores 99 prices and throws away 9.
A farmer driving 200 km on a bad number is the worst failure this product has, so a
rejected row always beats a wrong one.

*Not every market reports every day.* Coverage varies by the hour. A mandi with no
fresh figure keeps its last known one, with its age shown; the badge only appears on
prices that really are live.

Which of two prices to believe is decided in `src/lib/engine/sources.ts`, not by
recency alone. The shipped baseline is timestamped when it is written, so it can look
*newer* than a real government price whose arrival stamp is that morning — and the
farmer would be shown an invented number while a real one sat unused. Within a day of
each other the more trustworthy source wins; beyond that, recency does, because a
week-old government price is worse than today's estimate.

---

## Deploying to Render

The repository carries a blueprint, so the whole stack comes up in one step.

1. Push this repository to GitHub.
2. Render dashboard → **New** → **Blueprint** → select the repository → **Apply**.

`render.yaml` creates a web service and a Postgres database, wires `DATABASE_URL`
between them, generates `SESSION_SECRET`, runs `npm run db:migrate && npm run db:seed`
before the release goes live, and health-checks `/api/health` — which queries the
database rather than returning a constant, so a process that is listening but cannot
reach Postgres is correctly reported unhealthy.

Two things about the free tier, because they will otherwise look like bugs:

- A free web service **sleeps after 15 minutes idle** and takes roughly 50 seconds to
  wake. Load the URL once before demonstrating it.
- A free Postgres instance **expires after 30 days**.

Remove the seed from `preDeployCommand` once the database holds real data — it rewrites
the demo rows every deploy.

---

## Design

The interface is built as a **mandi patti** — the ruled paper slip a farmer is handed
after a sale, listing every deduction on its own line. It is the artifact this audience
already trusts to be honest about money, and the product makes the same promise.

Colour is semantic and never decorative: deep stamp-green is money kept, stamp-red is
money that leaves, jute-gold is a shared truck. Figures are set in a monospace so
columns align like a printed form. Type is IBM Plex throughout, because its Devanagari
shares metrics with its Latin and every screen here carries both scripts. Touch targets
are 48px minimum — the app is used one-handed, standing in a field.

The route view is an inline SVG, not a tile map: a farmer on 2G does not need satellite
imagery of a road they have driven their whole life, and a blank grey square when the
network drops is worse than a diagram that always renders.

---

## Testing

```bash
npm test        # 35 unit tests on the decision engine
npm run typecheck
npm run lint
```

Covering what the development document §8 names — price calculation, cost-split logic,
and the matching algorithm — plus the properties that matter for trust: shares always
sum to the trip cost, detours never go negative, a detour is never socialised, the
exact solver genuinely beats a greedy largest-first choice, a stale price is marked
low-confidence, and the feed's own outliers are rejected before a farmer ever sees them.

---

## Not built

Out of scope per the development document, and listed so the gaps are explicit rather
than discovered: iOS, ML price forecasting, crop insurance, FPO bulk aggregation, photo
based quality grading, and voice/IVR input (the *channel* is modelled and copy is
written for it; speech recognition is not wired up).
