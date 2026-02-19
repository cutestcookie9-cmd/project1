# Roblox Launcher Companion

A real working companion web app that fetches live Roblox game and catalog data via a local Node server.

## Run

```bash
npm start
```

Open `http://localhost:4173`.

## Features

- Live game search + paging.
- Live catalog search + cursor paging.
- Upstream fallback providers (`roblox.com` + `roproxy.com`) with timeout handling.
- Diagnostics panel for clear upstream error visibility.
- Official links for Roblox login/download/game/item pages.

## Notes

- This is **not** an official Roblox launcher.
- Roblox authentication, purchases, and actual joining are handled by Roblox-owned systems.
