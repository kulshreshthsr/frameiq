# Frame Engine

A mobile-first configurator and ordering system for custom wall frames. A customer uploads a photo of their own wall, picks a layout, adds their photos, chooses real frame products and sizes, sees a believable preview on their wall with a live price — then confirms the design, enters delivery details, pays, and gets an order confirmation. The business receives a production-ready package for every paid order.

Guest checkout only: there are no accounts.

The frontend (`frontend/`) and backend (`backend/`) are separate npm workspaces with their own `package.json` — each can be built and deployed independently — sharing one `shared/` folder of pricing/catalog/validation code so the two can never disagree (see "How it's organised"). `npm install` at the repo root installs both; every command below still runs from the root exactly as shown.

> **Status: ready for a real launch _except_ real payments.** Payments run against a built-in **sandbox** provider (no money moves). A Razorpay adapter is written and unit-tested, but it has **not** been run against Razorpay's live or test API — see [Going live](#going-live) before charging anyone.

## Run it

```bash
npm install
cp .env.example .env          # local settings; never commit .env
npm run db:seed -- --apply    # first time: load the catalog into the local database
npm run admin:create -- --email you@example.com --password "…"   # first time: create your owner login
npm run dev:api               # the backend  (http://127.0.0.1:8787)
npm run dev                   # the website  (proxies /api to the backend)
```

Open the address `npm run dev` prints. In development the payment window is a labelled **test payment** dialog with "succeed / fail / cancel" buttons. Owner admin is at `/admin`.

Production-style, one process serving both the site and the API:

```bash
npm run build && npm run build:server
node dist-server/index.js     # (npm start) — needs the production environment, below
```

## Verify it

```bash
npm run typecheck    # frontend + backend + e2e (delegates into each workspace)
npm run lint
npm test             # unit, component and backend tests (Vitest)
npm run test:e2e     # browser tests (Playwright) — builds the site and starts the real backend
```

First time only: `npx playwright install chromium`.

The Playwright suite runs the production build against the real server (fresh database, sandbox payments, `data/e2e/`) and covers the whole journey: design → review → details → delivery → payment → confirmation, plus decline/cancel/retry, refresh at every stage, double-clicking Pay, paying while the tab is closed, order links on another device, a price change mid-checkout, low-resolution photos, and phone layouts at 390×844, 375×812 and 430×932. `e2e/admin.spec.ts` separately covers signing in, creating and pricing a product, a bulk price change, and — the important one — that raising a price never touches an order already placed while a new one uses the new price.

Screenshot baselines live in `e2e/__screenshots__`. After an *intentional* visual change, review the diff and run `npm run test:e2e:update`.

## How an order works

1. **Design** in the browser (visualisation only — the browser never decides a price).
2. **Continue to order** freezes the design into a deterministic, versioned _design snapshot_ (`shared/orderSchema.ts`): wall, calibration, layout, every frame's product/size/options/position/crop, the price shown, and app + catalog versions. The design cannot change once checkout begins; the customer can go back and edit, then re-enter.
3. **Photos are checked for print quality.** The editor works on downsized copies; the customer's **original** is kept (memory + IndexedDB) and is what gets uploaded and printed. If an original is missing, or too small to print at the chosen size (below 100 pixels per inch), confirmation is blocked with a plain explanation and a way to fix it. The server re-checks. Nothing is ever printed from an editing copy.
4. **Review → Details → Delivery → Payment.** Only name, mobile, address, city, state and PIN are collected.
5. **The server creates the order** — recomputing every price from its own catalog (client prices are never trusted), validating everything, and storing an immutable price snapshot in integer paise. Creation is idempotent (`Idempotency-Key`), so double-clicks, refreshes and retries can't create duplicates.
6. **Payment is decided only by the server** — from a verified provider webhook (or a verified signature), never from the browser saying "it worked". The browser polls the server for the outcome. Webhook replays are ignored; late failures can't undo a payment.
7. **On payment**, the server writes the production package and queues a notification. The customer sees the confirmation with a private link (`/order/FRM-2026-000123?t=…`) that works on any device.

Public order IDs look like `FRM-2026-000123`; internal database IDs are never exposed.

### Guest access without accounts

The browser generates a random access token per order; the server stores only its hash. Reading or acting on an order needs the order ID **and** the token, and a wrong ID or a wrong token look identical (404).

## The production package

For every paid order the server writes `data/packages/<order id>/` (regenerate any time with `npm run order:package -- FRM-2026-000123`):

| File | What it is |
|---|---|
| `SHEET.txt` | One human-readable page for the workshop: customer, delivery address, every frame with product, physical size, glass, mat, photo, crop |
| `order.json` / `design.json` | Machine-readable order (prices, customer, delivery) and the full design snapshot |
| `preview.png` | The customer's final composed wall |
| `wall.*`, `photos/frame-NN.*` | The original files, untouched |
| `MANIFEST.json` | SHA-256 of every file, so a package can be verified |

## The catalog (prices, sizes, options)

Everything sellable — products, sizes, glass and mat options, prices, delivery fee — is data, not UI code, and the **database is the runtime source of truth**.

- `shared/catalogSeed.ts` is **development/bootstrap data only** (clearly marked **PLACEHOLDER**) — what `npm run db:seed` loads into an empty database. It is not consulted once the shop is running.
- Changing what's actually sold and what it costs is the owner admin's job (below), not a seed-file edit or a redeploy.
- The browser fetches the catalog from `GET /api/catalog` and falls back to the built-in copy for design, but ordering requires the server's.
- Each catalog gets a content-hash `version`; every order records the version it was priced against. **Existing orders never change when prices change** — an order carries its own immutable price snapshot, copied into `order_items` at the moment of purchase.

## Owner admin

At `/admin` — a small, separate area (its own code-split bundle; nothing from it reaches the customer download, and nothing from the customer app reaches it) where the owner manages the catalog without touching code, seed files, or the database directly.

- **Sign in**: `npm run admin:create -- --email you@example.com --password "…"` creates the account (or resets that email's password — there is no public sign-up). For a fresh deployment with no terminal access, set `OWNER_BOOTSTRAP_EMAIL` / `OWNER_BOOTSTRAP_PASSWORD` before the very first start instead; the server creates that one account when the `users` table is empty and ignores those variables forever after (rotate them out of the environment once done). Sessions are an httpOnly cookie, 12 hours, with CSRF protection on every mutation and a tight rate limit on login attempts.
- **Dashboard** (`/admin`): active/inactive product and size counts, recent price changes, recent orders.
- **Catalog** (`/admin/catalog`): search, filter, sort; activate/deactivate a product or a size inline. A product can't be created already active — it starts with no sizes, so the owner adds one, then switches it on. Deactivating is the only way to retire something; there is no delete, so a size or product referenced by a past order is never at risk.
- **A product's page** (`/admin/products/:id`): edit its details and offered glass/mat options; a sizes table with the price editable inline; **price history** per size, with a one-click **revert** (which writes a new, forward audit entry restoring the old value — it never edits or deletes what actually happened).
- **Bulk pricing** (`/admin/catalog/bulk`): tick several sizes, apply a percent or a fixed-₹ adjustment, **preview it**, review the full list of changes, then apply — one all-or-nothing request.
- **Orders** (`/admin/orders`): a read-only list and detail view with the full delivery address, for fulfilment — no status changes or refunds yet (see Known limits).

Every product/size write is validated against the *whole* resulting catalog (the same check the seed data must pass), so a bad edit is refused rather than reaching customers; and versioned per row, so a save built on a stale page is refused with a clear "reload and try again" (409) instead of silently overwriting someone else's edit made a moment earlier. Every change — single or bulk — is written to an append-only audit log with who, what, old value, new value and when.

## Configuration

Settings come from environment variables (or a local `.env`; real variables win). See `.env.example` and `.env.production.example`. Important ones:

| Variable | Meaning |
|---|---|
| `FRAMENGINE_ENV` | `development`, `test` or `production` |
| `DATABASE_URL` | libsql/SQLite URL. Local file in development; a path on a persistent disk (or hosted libsql) in production |
| `UPLOADS_DIR`, `PACKAGES_DIR` | Where uploaded photos and production packages are written |
| `PUBLIC_BASE_URL` | Public `https://` address (required in production) |
| `PAYMENT_PROVIDER` | `sandbox` (refused in production) or `razorpay` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Required for `razorpay`. Never commit these |
| `WHATSAPP_NUMBER` | Optional; shows a "message us" button on the confirmation |
| `OWNER_BOOTSTRAP_EMAIL`, `OWNER_BOOTSTRAP_PASSWORD`, `OWNER_BOOTSTRAP_NAME` | Optional; creates the first owner account on an empty database. See "Owner admin" |

The server refuses to start in production with the sandbox provider, without Razorpay credentials, without a database URL, or without an https base URL — and it never auto-seeds a production database. **No secrets are committed**; `.env` and `data/` are git-ignored.

## Going live

Read this before charging real money.

1. Create Razorpay **test-mode** keys and a webhook pointing at `https://<your-site>/api/webhooks/razorpay` (events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`).
2. Set the `RAZORPAY_*` variables, `PAYMENT_PROVIDER=razorpay`, `FRAMENGINE_ENV=production`, and the other production variables.
3. **Run a real end-to-end test payment in test mode** and check the webhook, the order status and the production package. The adapter's signature handling and state machine are unit-tested, but it has not been exercised against Razorpay itself.
4. Replace the placeholder catalog and delivery policy; only then switch to live keys.
5. Run behind HTTPS and back up `DATABASE_URL`, `UPLOADS_DIR` and `PACKAGES_DIR`.

## Deploying frontend and backend separately

They need two different kinds of host: the frontend is a static build (Vercel, Netlify, any static host); the backend is a long-running Node process that owns the database and every `/api/*` route (Vercel's default setup does **not** run it — deploying only the frontend there is why `/admin` and `/api/*` will 404 on a Vercel-only deployment).

- **Frontend on Vercel**: set the project's **Root Directory** to `frontend/`, and turn on **"Include files outside the Root Directory in the Build"** (a real Vercel project setting, needed because the build reads `../shared/*`). Build command `npm run build`, output `dist`.
- **Backend**: needs a host that runs a persistent Node process with a writable disk (for the SQLite file and uploads) — recommendations for exactly where are a separate step from this restructuring; ask if you want them now.

## How it's organised

| Area | What lives there |
|---|---|
| `shared/` | Code used by browser **and** server so they can't disagree: money, catalog types and validation, **pricing**, the design-snapshot schema, customer/delivery rules, production-image checks, the admin domain types and request validation. Lives at the repo root — not inside `frontend/` or `backend/` — and is never duplicated; both import it by relative path, one level up |
| `backend/` | Its own `package.json` (Hono, `@libsql/client`, no frontend deps) |
| `backend/server/` | The Hono API: orders, uploads, payments (provider abstraction + sandbox + Razorpay), catalog, production package, notification outbox, migrations, structured logging |
| `backend/server/auth/` | Password hashing, cookie sessions + CSRF, the OWNER-only auth middleware |
| `backend/server/catalog/adminCatalogRepo.ts` | The only write path for products/sizes: validated, versioned (optimistic concurrency), audited |
| `backend/server/admin/` | The `/api/admin/*` routes and the dashboard query |
| `backend/scripts/` | `db-seed`, `admin-create`, `order-package`, and the Playwright test server |
| `frontend/` | Its own `package.json` (React, Vite, Konva, zustand, no backend deps) |
| `frontend/src/domain/` | Frontend product model — a registry over the catalog, physical sizing/placement, print quality |
| `frontend/src/state/`, `frontend/src/persistence/` | Zustand stores; draft saving (localStorage + IndexedDB) |
| `frontend/src/order/` | Snapshot builder, crop maths, original-image store, API client |
| `frontend/src/checkout/` | The ordering flow: state, persistence, forms, payment, confirmation |
| `frontend/src/admin/` | The owner admin app — its own router, API client and pages. Imports nothing from `checkout`/`order`, and nothing outside it imports from it; `frontend/src/main.tsx` loads one or the other by URL |
| `frontend/src/components/` | Customer-facing UI. `CanvasStage/` is the Konva renderer; `Journey/` the design steps; `dev/` developer tools |
| `e2e/` | Playwright — exercises the whole system over HTTP; belongs to neither side, stays at the root |

### Ideas worth knowing before you change things

- **`shared/` never moves into `frontend/` or `backend/`, and never gets a copy in each.** It's imported by relative path from both (`../shared/...` from inside either workspace) specifically so pricing and validation can't drift into disagreeing. The production backend bundle doesn't need it present at runtime — `esbuild --bundle` inlines it into `dist-server/index.js` — but the *build* does, so a host building `backend/` needs the full repo checked out with its build directory set to `backend/`, not just that folder copied in isolation.
- **Money is integer paise.** Never do arithmetic on formatted prices. Pricing lives in `shared/pricing.ts` and runs identically in the browser and on the server.
- **The frozen snapshot is the only design checkout looks at.** Don't read the composition store from checkout code.
- **"Paid" is only ever a server fact.** The client's job is to ask, patiently, and to say so honestly when it can't tell yet.
- **Every checkout step is repeatable.** Uploads are content-addressed, order creation is idempotent, opening a payment reuses an open one — so any failure can offer a plain "try again".
- **Placement = anchor + size + scale.** A layout slot says where; the catalog says how big; the customer's wall width sets the scale. See `domain/placement.ts`.
- **Developer tools** (Frame Style Lab, Realism Lab) exist only in `npm run dev`.
- **A product/size write is validated as a whole catalog, not a field.** `adminCatalogRepo.ts` re-runs `validateCatalog` on the resulting catalog inside the same transaction as the write, so it inherits every invariant (unique ids, positive prices, at least one active size) for free — a new rule added there protects admin edits automatically, no separate admin-side validation to keep in sync.
- **`frontend/src/main.tsx`'s two branches must stay structurally different** (an early `return`, not an `if`/`else` with the same shape in both arms) — see the comment there. It's the only thing stopping the production minifier from merging the customer and admin dynamic imports, which would load both bundles' CSS on every page. Verify with a network trace on `/admin` after touching it.

## Known limits

- Real payments are unverified against Razorpay (see Going live). The sandbox dialog code ships in the site bundle but is inert unless the server runs the sandbox provider.
- Single-server design: per-order locking and the rate limiter are in-process; SQLite lives on local disk; uploads and packages are local files (the storage layer has an interface ready for object storage).
- Notifications are an outbox that is only **logged** (WhatsApp/email delivery is not wired up); the confirmation page and production package are the source of truth.
- Admin orders are read-only: no fulfilment/shipping status, no refund action. Paid-after-cancel and duplicate-charge cases are flagged in the database for a person to resolve; the business still reads full production packages from disk / `npm run order:package`.
- One role (owner) today; the auth model supports a second later but there is no UI to invite or manage staff accounts, and no audit log for admin logins beyond the structured server log.
- Orphaned uploads (photos uploaded but never ordered) are not yet cleaned up.
- The order link contains its access token; anyone with the link can view that order.
- Sizes shown on the wall are approximate (they rely on the customer's wall-width estimate); the frames are made to the listed sizes. Strong perspective can show faint beading along frame edges.
- Browser testing is Chromium only.
