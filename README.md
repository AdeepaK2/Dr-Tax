# Dr. Tax

An Android app that reads your bank SMS (Sampath, Commercial Bank, People's Bank), records every payment, and sorts it for Sri Lankan tax (year of assessment 1 April – 31 March).

- **Imports bank SMS automatically** when you open the app and about every hour in the background. OTP and approval-code messages are skipped and never stored.
- **Handles card holds and cancellations.** Card purchases start as *pending*. A ComBank "YOUR TRANSACTION AT UBER … HAS BEEN CANCELLED" message cancels the matching charge. Two charges at the same place within 30 minutes are flagged as a possible hold. Pending charges are confirmed automatically after 3 days (you can change this).
- **Asks when it can't tell.** Payments that match no rule go to *Not sorted yet*, and you get a notification ("Rs 2,850 paid — what was it for?") with quick buttons. Taxable income, money that's usually not taxable (gifts, scholarships, family support, loans, refunds), possible reliefs, work expenses and tax already paid are all kept separate.
- **Learns.** When you re-categorise a payment you can choose "Always" to create a rule for that merchant or person.
- **Month by month.** Home, Payments and Overview open on the current month (‹ › to move), showing money in, money out, savings and a comparison with last month.
- **Whole-year planner.** Overview → *Whole year* shows all 12 months (April–March): income, spending and savings per month, averages, savings rate and biggest spending. Tap a month to open it. Includes the tax summary and CSV export (opens in Excel).
- **Accounts for anyone.** Create an account or sign in, set your name and the other names on your SMS, and add your banks. Banks found in your inbox are switched on automatically with the right SMS template, and account/card numbers seen in their SMS are suggested. Each person's data is private to their account.
- **Nightly backup** to the NestJS + MongoDB server ([server/](server/README.md)), plus *Back up now* and *Restore…* (also offered when you sign in on a new phone).

Data lives on the phone (SQLite) and, if you set it up, on your own backup server. iPhones don't allow apps to read SMS, so this is Android-only.

## Install on your phone

The app reads SMS through its own native module, so it **won't run in Expo Go**. Build an APK in Expo's cloud (free account, no Android Studio needed):

```bash
npm install
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

When the build finishes, open the link on your phone, install the APK, and allow SMS and notification access when asked.

For development with live reload, build once with `--profile development`, then run `npx expo start`.

> The READ_SMS permission is fine for sideloaded apps. Google Play only allows it for default SMS apps, so this app can't be published there as-is.

## Project layout

| Path | What it does |
| --- | --- |
| `modules/sms-reader/` | Kotlin module that reads the SMS inbox (`content://sms/inbox`) |
| `src/lib/parsers.ts` | Turns each bank's SMS format into a transaction |
| `src/lib/reconcile.ts` | Matches cancellations to charges and finds likely holds |
| `src/lib/banks.ts` | Sri Lankan bank catalog: sender IDs and SMS template per bank |
| `src/lib/categories.ts` | Categories, tax groups and keyword rules |
| `src/lib/sync.ts` | Import pipeline: read → parse → store → reconcile → notify |
| `src/lib/notify.ts` | "What was this for?" notifications and their buttons |
| `src/lib/backup.ts` | Nightly backup, manual backup and restore |
| `server/` | NestJS + MongoDB backup server ([README](server/README.md)) |
| `simulator/` | Runs the app's real logic in Node with a fake inbox (`npm run simulate`, `npm run simulate:backup`) |
| `src/app/` | Screens (Home, Payments, Review, Overview, Settings) |
| `tests/parsers.test.ts` | Tests built from real SMS samples |

## Adding a new SMS format

If a bank message shows up under **Settings → View bank messages → Not understood**, copy its text into a new test in `tests/parsers.test.ts`, add or adjust a pattern in `src/lib/parsers.ts`, and run:

```bash
npm test
npm run typecheck
npx eslint src modules tests
```

## Disclaimer

Dr. Tax organises your records. It doesn't calculate your tax or give tax advice. Check reliefs and limits for the year with the Inland Revenue Department (ird.gov.lk) or a tax advisor before you file.
