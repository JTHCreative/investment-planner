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

| Piece | What it does |
| --- | --- |
| **React web app** (`src/`) | All screens and all the math. Built with Vite and TypeScript. |
| **Capacitor** | Wraps the web app into native iOS/Android apps. |
| **Firebase Auth** | Sign-in (email/password; Google on web). |
| **Firestore** | Stores each user's portfolios, trades and plan history. Private to that user (see `firestore.rules`). |
| **Cloud Functions** (`functions/`) | Fetches quotes, price history and symbol search from Yahoo Finance, and caches them in Firestore so repeat lookups are fast and cheap. |

The app never talks to Yahoo directly. Functions sit in the middle, like a librarian: the app asks the librarian, who
checks the shelf (the Firestore cache) first and only goes out to Yahoo when the copy on the shelf is stale (5 minutes
for quotes, 12 hours for history). That also keeps browsers from being blocked by CORS.

### Data model

```
users/{uid}/portfolios/{id}         name, startingCash, cash, holdings{SYM: {shares, costBasis}}, targets[{symbol, weight}]
users/{uid}/portfolios/{id}/transactions/{id}   buy / sell / deposit / withdrawal log
users/{uid}/portfolios/{id}/revisions/{id}      every saved version of the target plan, with an optional note
marketQuotes/{symbol}, marketHistory/{symbol}   cache written only by Cloud Functions
```

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
npm --prefix functions ci

# Optional: use made-up market data instead of Yahoo (offline, deterministic)
echo "MARKET_PROVIDER=mock" > functions/.env.local

# Terminal 1: Auth, Firestore and Functions emulators
npm run emulators

# Terminal 2: the web app, pointed at the emulators
VITE_USE_EMULATORS=true npm run dev
```

Open http://localhost:5173 and create an account (emulator accounts are throwaway). The emulator UI at
http://localhost:4000 shows the stored data.

```bash
npm test              # simulation unit tests
npm run typecheck
```

## Deploying the Firebase backend

The app is wired to the Firebase project **investment-planner-40f1d** (web config in `src/firebase.ts`, CLI project in
`.firebaserc`). The web config is public by design: it ships to every browser. What protects your data is
`firestore.rules`. One-time setup in the [Firebase console](https://console.firebase.google.com/project/investment-planner-40f1d):

1. **Authentication** → Get started → enable **Email/Password** (and **Google** if you want it on the web).
2. **Firestore Database** → Create database (production mode; pick a location near you).
3. Upgrade to the **Blaze (pay-as-you-go)** plan. Cloud Functions need it to make outbound calls to Yahoo. Personal use
   normally stays within the free allowance; setting a budget alert is a good idea.
4. From your computer, deploy the functions and security rules:

```bash
npm i -g firebase-tools
firebase login
npm ci && npm --prefix functions ci
firebase deploy --only functions,firestore
```

`npm run deploy` also publishes the site to Firebase Hosting at `https://investment-planner-40f1d.web.app`, as an
alternative or in addition to GitHub Pages.

To use a different Firebase project, set the `VITE_FIREBASE_*` values in `.env.local` (see `.env.example`) and run
`firebase use --add`.

## Hosting the web app on GitHub Pages

`.github/workflows/deploy-pages.yml` tests, builds and publishes the web app to
`https://<owner>.github.io/<repo>/` on every push to `main` (or on demand from the Actions tab).
`.github/workflows/ci.yml` runs the tests and both builds on pull requests and other branches.

GitHub Pages only hosts the website itself. Sign-in, the database and market data come from Firebase, so do the
backend steps above too. One-time setup:

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

`yahoo-finance2` is free and needs no key, but it's unofficial and Yahoo can change or rate-limit it. Every provider
implements the small `MarketProvider` interface in `functions/src/types.ts` (`search`, `quotes`, `history`). To move to
a paid, official feed (Polygon, Tiingo, Alpha Vantage, Twelve Data…), add a file next to `functions/src/providers/yahoo.ts`
and select it in `functions/src/index.ts`. Keep the API key in Firebase secrets (`firebase functions:secrets:set`), not
in the code.

**Bonds:** individual bonds aren't in Yahoo's feed. Use bond funds and ETFs (BND, AGG, TLT, IEF, TIP), or SGOV/BIL for
T-bills. Any slice you don't allocate stays as cash, earning the "cash yield" you set in the backtest and projection.

## Known limitations

- Trades fill instantly at the latest price: no fees, taxes, spreads or market hours.
- On the Overview tab, gains are price-only. Backtests, projections and the "value since opened" chart include dividends.
- Prices are in each asset's own currency; there's no FX conversion.
- Past performance and resampled history are not predictions.
