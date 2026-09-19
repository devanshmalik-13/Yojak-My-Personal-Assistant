# My Personal Assistant

[![CI](https://github.com/devanshmalik-13/Yojak-My-Personal-Assistant/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/devanshmalik-13/Yojak-My-Personal-Assistant/actions/workflows/ci.yml)

A private, offline-first personal assistant for students. The current version uses no cloud backend and sends no personal data to a server.

## Local backend

The application uses SQLite compiled to WebAssembly. In the browser, the SQLite database file is persisted in IndexedDB. In a Capacitor mobile build, it is persisted as `app-data/database.sqlite` in application-private device storage. Repositories isolate the UI from this implementation so native or encrypted SQLite can replace the adapter later.

```text
React screens -> async app store -> services -> repositories -> SQLite
                                             -> private file storage
                                             -> local OS notifications
```

The versioned schema covers the local profile/settings, subjects, timetable versions, attendance, assignments and attachments, competitions/rounds/certificates, reminders, transactions/categories, alerts, and scheduled-notification metadata.

## Development

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

The development app runs at `http://localhost:5173` unless `PORT` is set.

## Mobile packaging

Capacitor configuration and native filesystem/local-notification integrations are included. The Android platform is already generated. Build and sync the latest web bundle into it with:

```bash
pnpm android:sync
pnpm android:build
```

`android:build` creates a debug APK at `android/app/build/outputs/apk/debug/app-debug.apk`. It requires Android Studio or an Android SDK with platform 36 configured through `ANDROID_HOME` or `android/local.properties`. Open the generated native project with `pnpm android:open`.

To add iOS later, run `pnpm add @capacitor/ios && pnpm exec cap add ios` on macOS. iOS builds require Xcode. OS notification delivery remains subject to user permission and platform scheduling rules.

## Privacy and durability

- Normal features do not require internet connectivity.
- Structured data is stored in SQLite; attachments are stored separately in private storage.
- Export Backup creates a validated ZIP containing the SQLite database and local attachments.
- Restore checks the format, schema, database integrity, paths, and file sizes before replacing current data, and rolls back on failure.
- Reset removes user-owned data and files while preserving the schema so onboarding can create a clean profile.

See the automated tests in `tests/` for migration, domain, persistence, backup/restore, and reset coverage.
