# Aegis Mission Control

A fictional asteroid-deflection console for the Bypass security demo. The
application is intentionally vulnerable; all mission controls and data are
simulated. Its public UI, TypeScript server, and JSON API give source review and
live testing the same application to investigate.

## Run locally

Node.js 24 is required. The app listens on loopback by default.

```bash
npm ci
npm run check
npm test
npm start
```

Open <http://127.0.0.1:3000>. For the demo container, build from a committed
revision and expose only a loopback port:

```bash
docker build --build-arg SOURCE_REVISION="$(git rev-parse HEAD)" -t aegis-mission-control .
docker run --rm --read-only --cap-drop=ALL --pids-limit=64 --memory=256m \
  -p 127.0.0.1:3010:3000 aegis-mission-control
```

The UI reports the build revision from `/api/system/version`. Restarting the
server resets the in-memory mission state.

## Demo CI and deployment

GitHub Actions checks TypeScript, app tests, and any exported Bypass regression
tests on each PR. A passing push to `main` deploys that exact commit through the
`aegis-demo` runner to the loopback container served by
`https://demo-app.bypasslabs.ai`. `deploy.sh` checks the deployed revision and
restores the previous image if startup fails.

The repository starts from a deliberately vulnerable baseline. Exported
regressions arrive with the proposed fix during the live Bypass demo.

## Demo identities

These accounts are disposable fixture data:

| Callsign | Email | Password | Six-digit code |
|---|---|---|---|
| Cmdr. Vega | `vega@aegis.test` | `orbital-42` | `739216` |
| Lt. Sol | `sol@aegis.test` | `relay-31` | `284605` |

The intended three-minute story is: source review names one issue, blackbox
proves it against this running revision, the same regression fails before a
source fix and passes after it, and the deployed revision no longer reproduces
that issue. The other seeded issues remain separate investigation leads; a fix
for one issue is not a claim that the whole simulator is secure.

Do not expose the vulnerable build as an unrestricted public service. Its
diagnostic route intentionally runs an operating-system command. Use the
disposable container above for live testing.
