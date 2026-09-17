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
| `npm test` | Unit tests (178, Node's built-in runner) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenerate SQL migrations after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to a real Postgres (needs `DATABASE_URL`) |
| `npm run db:seed` | Load the crop catalogue, mandis and pilot demo data (idempotent) |
| `npm run db:ingest` | Pull current mandi prices from the government feed |
| `npm run wa:templates` | Print the WhatsApp templates to register with Meta |
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
   │   ├── languages.ts  the thirteen languages, and the fallback chain
   │   ├── i18n.ts       the dictionary and the lookup rules
   │   └── speech.ts     preparing text for the read-aloud engine
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

The assistant in `lib/assistant/` sits on top of these rather than beside them: it
routes a question to one of these same functions and reports what they return.

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
| FR-8 | Price and pooling notifications | `notifications.ts`; opening a trip alerts farmers within 35 km, and WhatsApp carries them to anyone opted in |
| FR-9 | Billing notice **7 days** before the due date | `chargeWithReminder` — a payable cannot be created without one |
| FR-10 | Regional language support | Thirteen languages, stored per user; read-aloud on every figure that matters |
| FR-11 | Transaction log for income tracking | `/farmer/earnings` |
| — | Instant help, grounded in the app’s own data | `/help`, `lib/assistant/` |
| — | Finding nearby farmers and operators to collaborate with | `/connect` |

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
  carrier. `notify()` is the handoff point. **WhatsApp is fully built** and needs only
  Meta credentials and approved templates — see above.
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

## WhatsApp alerts

Farmers and truck operators can have every alert delivered to WhatsApp — mandi prices,
a truck-sharing group forming nearby, the seven-day payment reminder, a consignment
changing status. For this audience it is the channel that actually works: it arrives
on a weak connection, it survives the app being closed, and it is where they already
are.

```bash
npm run wa:templates          # prints what to register with Meta
# then set WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN
# and point Meta's webhook at https://<your-app>/api/whatsapp/webhook
```

**The constraint most WhatsApp integrations discover too late:** Meta does not let a
business send arbitrary text. Outside a 24-hour window opened by the *user* messaging
*you*, every message must be a **template approved in advance**, with variables passed
as ordered parameters. Every alert this app sends is business-initiated, so all of them
fall under that rule.

So `lib/whatsapp/templates.ts` is not a formatting helper — it is the contract with
Meta, and `npm run wa:templates` prints it in submission form. A test asserts each
template declares as many parameters as its body uses, and that Hindi and English use
the same variable numbers, because a mismatch is rejected at review and nobody notices
until an alert silently stops going out.

**Farmers can also ask it things.** A message inbound opens that 24-hour window, which
makes plain replies legal — so `pyaz ka bhav kya hai` sent to the business number is
routed through the same assistant the app uses, and answered with the same figures from
the same engine. A farmer who cannot keep the app open on a weak connection still gets
the real number.

Other decisions worth knowing:

- **Opt-in is stored with the moment it was given.** Meta requires a business to show
  when and how someone consented, and a farmer who did not understand what they agreed
  to will block the number — which costs the channel for everyone on it. Replying STOP
  turns it off, in Hindi or English, and the app honours it immediately.
- **Delivery is tracked, not assumed.** `whatsapp_messages` records every message in
  and out with its real status from Meta's receipts. "Sent" that nobody confirmed is
  not delivery, and on a channel carrying a payment reminder the difference matters.
  Receipts arrive out of order, so a late *sent* never overwrites a *read*.
- **A number is normalised or refused, never guessed.** `+91`, a leading zero, spaces
  from a contact card all resolve to the same id; a landline or a short code is
  refused, because guessing there means messaging a stranger.
- **Reminders go out when they are due, not when they are written.** A billing reminder
  is created the moment a charge is raised but scheduled for seven days before the due
  date; messaging three weeks early would train people to ignore the channel.

Without credentials the app records what it would have sent and marks it `SKIPPED` —
visible on the ops dashboard, which is far more useful during a pilot than silently
dropping it.

---

## Instant help

A question box, reachable from the **?** in the masthead on every screen. Ask in
Hindi, English or the Hinglish people actually type — *"pyaz ka bhav kya hai"*,
*"truck kaise share karu"*, *"mera kitna paisa baki hai"*.

**Every figure it quotes is read from the database or computed by the decision
engine** — the same code paths that draw the screens. It answers where to sell, what a
crop is fetching, whether a group is forming nearby, where a consignment is, what is
owed, and how to handle a crop.

Where a language model is configured it does exactly two things, and neither is
sourcing a fact:

1. Read the question and say which of nine intents it is.
2. Rewrite an already-computed answer into plainer words.

The rewrite is then **checked**: if it carries a different set of rupee figures than
the original, it is discarded and the computed text is used. A model that quietly
turns ₹1,551 into ₹1,550 has broken the one rule that matters when a farmer is
deciding whether to drive 200 km, so it does not get the benefit of the doubt.

```bash
# optional — the assistant works without it
OPENROUTER_API_KEY=...        # or ANTHROPIC_API_KEY
ASSISTANT_MODEL=...           # defaults to a small, cheap model
```

With no key it runs on keyword matching and templates against the same live data.
That is a working product, not a degraded one — it is what runs on a deployment with
no token budget, and it answers instantly on a bad connection. A model is only
consulted when the keywords are genuinely unsure, so the common questions stay free
and fast either way.

Matching handles Hindi word order: *"truck kaise share karu"* splits a phrase an
English-shaped matcher looks for whole, so co-occurring words carry these rather than
adjacency.

---

## Finding people to share with

Pooling only works if farmers can find each other, so **Connect** lists who is within
60 km: neighbours heading the same way, what they have ready to send, and the truck
owners close enough for the pickup run to be worth driving — with their fleet,
capacity, per-km rate and rating.

Groups already forming lead the page, because a route is the thing worth acting on.
A farmer in a group can invite a neighbour into it with one tap.

**Phone numbers are not listed.** You get the truck owner's number on a trip you have
actually joined, because you need to reach your driver. Publishing every farmer's
number to everyone within 60 km is not a feature, and PRD §8 limits this data to
matching and logistics. Collaboration happens through an invitation the other person
can decline — nobody is added to a booking, and so to a charge, by someone else.

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

## Thirteen languages, and reading them aloud

`lib/languages.ts` lists the languages: Hindi, English, Marathi, Bengali, Telugu,
Tamil, Gujarati, Kannada, Malayalam, Punjabi, Odia, Assamese and Urdu. They are ordered
by how many farming households speak each, not alphabetically, because the picker is
read by someone looking for their own language and the common ones should be reachable
without scrolling. Each carries its name in its own script — a picker that lists
"Marathi" in Latin is no use to someone who cannot read Latin — plus the speech tag its
voice engine wants, and, for Urdu, the flag that turns the page around.

**Missing translations fall back to Hindi, then English.** That order is the whole
design. A Marathi or Punjabi speaker meeting an untranslated string is far more likely
to read Hindi than English, and this app is for people who read slowly in any script.
Two functions carry the rule: `pick()` for strings a call site supplies, and
`prefersHindi()` for the English/Hindi ternaries written back when there were only two
languages. A test walks `src/` and fails on any new `lang === "hi"`, because each one
of those quietly sends everyone except Hindi readers to the English branch.

**What is actually translated.** Every string needed to *operate* the app: navigation,
every button, every line on the mandi slip, the money and weight words, the quality
grades, the pooling vocabulary and the trip statuses. A test enumerates those keys and
fails if any is missing in any language. The longer explanatory prose — handling advice,
the paragraphs explaining how a cost split works — is still Hindi and English only and
falls back to Hindi. So is the `name`/`nameHi` pair on crops and mandis, which needs
per-language columns rather than a dictionary entry. A Tamil farmer today gets a Tamil
interface with Hindi prose in it; that is worth saying plainly rather than claiming
thirteen complete languages.

**Fonts.** Latin and Devanagari ship from IBM Plex. The other ten scripts come from the
handset. Webfonts for Bengali, Telugu, Tamil, Gujarati, Kannada, Malayalam, Gurmukhi,
Odia and Nastaliq would add well over a megabyte to a first load that happens over 2G in
a field, and every Android sold in India already carries Noto for all of them.

**WhatsApp templates are the exception.** A template is a contract with Meta and each
language is a separate submission it has to approve; an unapproved locale is not a worse
message, it is a message that does not send. So `TemplateBody` requires English and
Hindi and accepts the rest optionally, and `templateLanguage()` routes a farmer to the
nearest language whose body has actually been registered.

### Read aloud

Every recommendation slip, assistant answer and alert carries a **Listen** button. It
uses the browser's own `speechSynthesis`, so nothing is uploaded to be spoken and it
works with no signal at all.

The work is in `lib/speech.ts`, and it is about figures. Left alone, a speech engine
reads "₹12,340" as *"twelve, three hundred and forty"* — the comma becomes a list
separator and the farmer hears two numbers. It skips or mispronounces the rupee sign,
and says "210 km" as *"two hundred ten kay em"*. So before anything is spoken, digit
grouping is stripped, the currency becomes the word for rupees in that language and
placed after the number where speech puts it, and units are spelled out. Long passages
are split at sentence ends, because Chrome silently stops partway through anything much
over two hundred characters — and a total that cuts off halfway is worse than one never
read.

The spoken slip is assembled from the same dictionary keys and the same engine figures
as the printed one, in the same order. A spoken price that disagreed with the printed
one would be the worst thing this app could do.

If the handset has no voice at all the button does not render. A control that does
nothing when pressed teaches the user the app is broken — and that user is, by
definition, the one who cannot read the screen to find out otherwise.

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
npm test        # 178 unit tests
npm run typecheck
npm run lint
```

Covering what the development document §8 names — price calculation, cost-split logic,
and the matching algorithm — plus the properties that matter for trust: shares always
sum to the trip cost, detours never go negative, a detour is never socialised, the
exact solver genuinely beats a greedy largest-first choice, a stale price is marked
low-confidence, the feed's own outliers are rejected before a farmer ever sees them,
a Hinglish question is understood whatever order the words arrive in, and a language
model cannot alter a figure on its way to the screen.

The language tests defend the properties a test can actually check: that no key renders
blank in any of the thirteen, that the words needed to operate the app are genuinely
translated rather than quietly falling back, that a gap degrades to Hindi and not
English, that numbers stay in Latin digits with Indian grouping in every language, and
that a rupee amount survives the trip into the speech engine intact.

---

## Not built

Out of scope per the development document, and listed so the gaps are explicit rather
than discovered: iOS, ML price forecasting, crop insurance, FPO bulk aggregation, photo
based quality grading, and voice/IVR input (the *channel* is modelled and copy is
written for it; speech recognition is not wired up).
