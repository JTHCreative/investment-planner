# Investment Planner

A practice account for your money. Create pretend portfolios (for example "$100k, three-fund mix"), invest them at
**real, live market prices**, then see how each mix:

- **would have done** in the past (backtest),
- **might do** in the future (Monte Carlo projection), and
- **compares** against your other mixes side by side.

When you change your mind, edit the plan and rebalance. Every version of the plan is kept, so you can look back at
what you changed and why.

It runs as a website and, from the same code, as an iPhone and Android app.

> Simulated money only. Nothing here is financial advice.

## How it fits together

Everything runs on free tiers: Firebase's **Spark** plan, GitHub Pages, and free market data keys. There is no server
of our own.

| Piece | What it does |
| --- | --- |
| **React web app** (`src/`) | All screens, all the math, and the market data calls. Built with Vite and TypeScript. |
| **Capacitor** | Wraps the web app into native iOS/Android apps. |
| **Firebase Auth** | Sign-in (email/password; Google on web). |
| **Firestore** | Each user's portfolios, trades, plan history and API keys (private to them), plus a shared price-history cache. |
| **Finnhub** (free key) | Live quotes, symbol search, basic stats. 60 calls a minute. |
| **Alpha Vantage** (free key) | 20+ years of monthly prices, adjusted for dividends and splits. 25 downloads a day, about one a second (the app queues them). |

The app calls Finnhub and Alpha Vantage straight from the browser. Alpha Vantage's daily limit is small, so history works
like a shared library shelf: the first person to look up VTI downloads it and puts a copy in Firestore, and everyone
after reads that copy (refreshed every two days). Quotes are cached in memory for a minute.

Keys come from the in-app **Settings** page (saved to the user's account) or, optionally, from GitHub secrets at build
time so nobody has to enter them. Either way they end up in the browser, which is fine for free keys but not for paid
ones.

### Data model

```
users/{uid}                          apiKeys {finnhub, alphaVantage}, folders{id: {name, color, icon}}, folderOf{portfolioId: folderId}
users/{uid}/portfolios/{id}          name, startingCash, cash, holdings{SYM: {shares, costBasis}}, targets[{symbol, weight}],
                                     members{uid: 'view' | 'edit'}, memberIds[]   (who it's shared with)
users/{uid}/portfolios/{id}/transactions/{id}   buy / sell / deposit / withdrawal log
users/{uid}/portfolios/{id}/revisions/{id}      every saved version of the target plan, with an optional note
users/{uid}/portfolios/{id}/private/link        share link {token, role}; only the owner can read it
users/{uid}/portfolios/{id}/joins/{uid}         written by someone opening the share link, as proof they had the token
usernames/{name}                     {uid}: who holds a username
profiles/{uid}                       {username}: shown to people a portfolio is shared with
marketHistory/{symbol}               shared monthly price cache: dates[], closes[], fetchedAt
```

**Sharing.** The owner can add people by username (each set to *view* or *edit*), or turn on a link that gives anyone
who opens it view or edit access. Viewers see everything but change nothing; editors can also trade, move cash, rename
and change the plan; only the owner can share or delete. `firestore.rules` enforces all of this, and
`rules-tests/` checks it against the emulator (`npm run test:rules`).

**Folders** are personal: everyone files portfolios, including ones shared with them, their own way. Every account
has *My Portfolios* and *Shared Portfolios*; portfolios not filed anywhere else land in one of those two, depending on
whether they're shared.

### The math (`src/lib/sim/`, unit-tested)

- **Rebalance** (`rebalance.ts`): turns "60% VTI / 40% BND" into the buys and sells needed at current prices. Fractional
  shares, no fees.
- **Backtest** (`simulate.ts`): replays month-by-month history using prices adjusted for dividends and splits, so
  dividends count. Weights drift with the market and get reset on your rebalance schedule, the way a real account
  would. It's compared against SPY.
- **Projection** (`simulate.ts`): Monte Carlo with a *block bootstrap*. Think of history as a deck of cards where each
  card is one real year of returns for all your investments together. Each simulated future shuffles and deals a hand
  of those cards. Because each card holds the same year for every investment, a year when stocks fell and bonds rose
  stays that way. The spread of 2,000 hands gives the 10th/25th/50th/75th/90th percentile "fan". You can make it more
  conservative with a return adjustment, add monthly contributions, and view results in today's dollars.
- **Value history** (`valuation.ts`): rebuilds an account's day-by-day value from its trade log.

One caution: the shared history window is limited by the **youngest** investment in a plan. Add SGOV (launched 2020)
and the whole plan only has about 6 years to learn from. The app says when that happens.

## Running it locally (no Firebase account needed)

You need Node 22+, Java 11+ (for the Firestore emulator) and the Firebase CLI (`npm i -g firebase-tools`).

```bash
npm ci

# Terminal 1: Auth and Firestore emulators
npm run emulators

# Terminal 2: the web app, pointed at the emulators, with made-up prices (no keys or internet needed)
VITE_USE_EMULATORS=true VITE_MARKET_PROVIDER=mock npm run dev
```

Open http://localhost:5173 and create an account (emulator accounts are throwaway). The emulator UI at
http://localhost:4000 shows the stored data. Drop `VITE_MARKET_PROVIDER=mock` to use real prices with your keys.

```bash
npm test              # simulation unit tests
npm run test:rules    # security rules tests (starts the Firestore emulator itself; needs Java and the Firebase CLI)
npm run typecheck
```

## Setting up Firebase (free Spark plan)

The app is wired to the Firebase project **investment-planner-40f1d** (web config in `src/firebase.ts`, CLI project in
`.firebaserc`). The web config is public by design: it ships to every browser. What protects your data is
`firestore.rules`. One-time setup in the [Firebase console](https://console.firebase.google.com/project/investment-planner-40f1d):

1. **Authentication** → Get started → enable **Email/Password** (and **Google** if you want it on the web).
2. **Authentication → Settings → Authorized domains** → add `<owner>.github.io` (for GitHub Pages).
3. **Firestore Database** → Create database (production mode; pick a location near you).
4. **Deploy the rules and indexes** from your computer: `npm i -g firebase-tools && firebase login && firebase deploy --only firestore`.
   This publishes `firestore.rules` and `firestore.indexes.json` (sharing needs an index on `memberIds` to find
   portfolios shared with someone). Re-do this whenever either file changes. The GitHub Pages workflow only publishes
   the website, not these.

No billing upgrade is needed.

## Market data keys

1. Sign up at [finnhub.io/register](https://finnhub.io/register) and copy the API key from the dashboard.
2. Get a key at [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key).
3. Either paste both into the app's **Settings** page, or add them as repository **secrets**
   (`VITE_FINNHUB_API_KEY`, `VITE_ALPHA_VANTAGE_API_KEY`) so the GitHub Pages build includes them for everyone.

## Hosting the web app on GitHub Pages

`.github/workflows/deploy-pages.yml` tests, builds and publishes the web app to
`https://<owner>.github.io/<repo>/` on every push to `main` (or on demand from the Actions tab).
`.github/workflows/ci.yml` runs the tests and the build on pull requests and other branches.

GitHub Pages only hosts the website itself. Sign-in and storage come from Firebase, so do the Firebase steps above
too. One-time setup:

1. **Turn on Pages:** repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Allow sign-in from Pages:** Firebase console → **Authentication → Settings → Authorized domains → Add domain** →
   `<owner>.github.io`.
3. Push to `main`. The workflow run shows the live URL when it finishes.

## Phone apps

```bash
npx cap add ios        # once (needs a Mac with Xcode)
npx cap add android    # once (needs Android Studio)
npm run cap:ios        # build, copy into the native project, open Xcode
npm run cap:android
```

Change `appId` in `capacitor.config.ts` to your own reverse-domain ID before publishing. Email/password sign-in works in
the native apps. Google sign-in in a native app needs the `@capacitor-firebase/authentication` plugin, which isn't set
up yet.

## Swapping the market data source

Providers live in `src/lib/providers/` and are wired together in `src/lib/market.ts`. To use a different service, add a
provider file with the same shape (search, quote, monthly or daily adjusted history) and switch to it in `market.ts`.
Anything called from the browser must allow cross-origin requests (CORS) and use a key you don't mind being public.
That rules out Yahoo Finance, which blocks browser requests.

**Bonds:** individual bonds aren't available. Use bond funds and ETFs (BND, AGG, TLT, IEF, TIP), or SGOV/BIL for
T-bills. Any slice you don't allocate stays as cash, earning the "cash yield" you set in the backtest and projection.

## Known limitations

- Trades fill instantly at the latest price: no fees, taxes, spreads or market hours.
- On the Overview tab, gains are price-only. Backtests, projections and the "value since opened" chart include dividends.
- US-listed stocks and ETFs only (Finnhub's free quotes). Crypto and foreign listings aren't supported.
- Price history is monthly, so the "value since opened" chart has a point per month plus today.
- Each new symbol's history uses one of Alpha Vantage's 25 free daily downloads (then it's cached for everyone).
- The shared history cache is written by users' browsers. Rules check its shape, but a signed-in user could in principle
  write wrong numbers. Fine for you and people you trust; add an allowlist of user IDs before opening sign-up widely.
- Past performance and resampled history are not predictions.
