# x-dl Vite + Express + Mongo

Localhost rewrite of x-dl with a browser-based jobs dashboard and an Express worker pipeline.

## Architecture

- `client/`: Vite + React dashboard for creating and monitoring jobs
- `server/`: Express + Mongoose API and background queue processor
- `docs/`: implementation plans and testing matrix
- `scripts/`: PowerShell helpers for dev and release checks

## Prerequisites

- Node.js 20+
- MongoDB Atlas connection string
- `ffmpeg` installed and available on `PATH` (for HLS workflow)

## Setup

1. Install dependencies:

```bash
npm install
npm install --prefix client
npm install --prefix server
```

2. Create server env file:

```bash
copy server\\.env.example server\\.env
```

3. Set `MONGODB_URI` inside `server/.env`.

## Run Locally

- Start both apps:

```bash
npm run dev
```

- Or with PowerShell helper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1
```

- Open `http://localhost:5173`.

## Script Reference

- `npm run dev`: run server and client together
- `npm run dev:server`: run API only
- `npm run dev:client`: run client only
- `npm run test`: run server + client automated tests
- `npm run build`: build client
- `npm run lint`: lint client
- `npm run check`: validate release checklist files and required scripts
- `npm run verify`: test + build + lint + release checklist

## Verification Matrix

See `docs/testing-matrix.md` for automated and manual verification steps.
