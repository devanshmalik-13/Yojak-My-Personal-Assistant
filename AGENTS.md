# My Personal Assistant App

Offline-first React, TypeScript, Vite, Tailwind CSS, SQLite, and Capacitor application.

## Development

- Install dependencies with `pnpm install`.
- Start the development server with `pnpm dev` (port 5173 by default).
- Create a production bundle with `pnpm build`.
- Preview a production bundle with `pnpm preview` (port 4173 by default).
- Set `PORT` to override either server's default port.
- Run `pnpm test` and `pnpm typecheck` after data-layer changes.
- Run `pnpm mobile:sync` after adding a Capacitor Android or iOS platform.

## Project structure

- `src/main.tsx` mounts the application and imports global styles.
- `src/App.tsx` is the primary application component.
- `src/store.tsx` is an asynchronous UI cache and mutation dispatcher; it is not persistent storage.
- `src/database/` owns SQLite, IndexedDB/native-file persistence, schema, and migrations.
- `src/repositories/` owns SQL data access.
- `src/services/` owns validation, calculations, files, notifications, backup/restore, and orchestration.
- `src/api/` contains compatibility wrappers around local services; it must not make network requests.
- `src/types.ts` contains shared frontend domain types.
- `src/index.css` contains Tailwind CSS v4 and global styles.
- `vite.config.ts` contains the standalone Vite configuration and `@` alias.

## Code quality

- Preserve the current UI and domain terminology when wiring backend data.
- Keep SQL in repositories and business rules in services; screens must not use either storage API directly.
- Do not store the full application state in `localStorage` or add a required cloud dependency.
- Store calendar dates as local `YYYY-MM-DD` strings and money as integer cents.
- Ensure JSX tags are closed and TypeScript builds without errors.
