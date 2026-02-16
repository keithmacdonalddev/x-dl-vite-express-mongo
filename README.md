# x-dl Vite + Express + Mongo

JavaScript-only scaffold for the x-dl rewrite.

## Stack

- Client: Vite + React (`client/`)
- API: Express + Mongoose (`server/`)
- Database: MongoDB Atlas (via `MONGODB_URI`)

## Quick start

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

3. Put your Atlas connection string in `server/.env`.

4. Start both client and server:

```bash
npm run dev
```

5. Open `http://localhost:5173`.

The client calls `GET /api/health` through a Vite proxy to `http://localhost:4000`.

## Scripts

- `npm run dev` - run API and client together
- `npm run dev:server` - run API only
- `npm run dev:client` - run client only
- `npm run build` - build client
- `npm run start` - start API in non-watch mode

