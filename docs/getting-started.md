# Getting started

Use this guide when you want a clean local setup for the browser app and the
LookingGlass REST API server.

## What you need

- Node.js
- npm
- A checkout of this repository

## Install dependencies

```bash
npm install
```

## Build the browser app

```bash
npm run build
```

## Run tests

```bash
npm test
```

## Start the browser development server

```bash
npm run dev
```

Vite prints the local URL after it starts.

## Start the REST API server

First build the server bundle:

```bash
npm run build:server
```

Then start it with the built-in CLI:

```bash
npm run serve
```

The default CLI port is `3000`.

## Start the server for `eatme`

The `eatme` web-platform tests use `http://localhost:3099` unless you set a
different API URL. This command starts LookingGlass on that port:

```bash
npm run serve -- --port 3099 --evidence-dir ./evidence
```

Check that the server is up:

```bash
curl http://127.0.0.1:3099/api/health
```

Expected response shape:

```json
{
  "status": "running",
  "launched": false,
  "runtime": "lookingglass-typescript-web"
}
```

The `runtime` value is the LookingGlass runtime identity.

## Common local commands

| Task | Command |
| --- | --- |
| Install packages | `npm install` |
| Build browser app | `npm run build` |
| Build API server | `npm run build:server` |
| Run tests | `npm test` |
| Start browser dev server | `npm run dev` |
| Start API server | `npm run serve` |
| Start API server on eatme's default port | `npm run serve -- --port 3099 --evidence-dir ./evidence` |
