# Aegis Mission Control: three-minute demo

The vulnerable baseline is `demo/vulnerable` (`ab63f24`). The focused source
fix is commit `b4fc170` on `demo/fix-crew-auth`. Both builds use the same app
and expose their full commit through `GET /api/system/version`.

## Evidence already rehearsed

- Muse Code source review: `run_b4295412`, finding `finding_98ba441f`. It found
  that `principal()` trusted an unauthenticated `X-Crew-Id` header.
- Bypass blackbox: `bx-20261102-d3c8975e`, 723 HTTP requests, 48 Muse calls,
  about six minutes. Independent replay confirmed unauthorized reads and writes
  as `f-001` and `f-002`. They share one root cause. The separate SQL injection
  `f-003` also reproduced and remains unfixed.
- The exported `f-001` and `f-002` regression tests fail against the vulnerable
  build and pass against the fixed build. Both original PoCs return
  `not_reproduced` against the fixed build; a valid crew session still works.
- A Muse Code `bypass_feature_context` rehearsal for a new calibration feature
  retrieved the prior crew-header finding. It correctly marked the old source
  quote stale after the fix and advised a session-protected new route with its
  own authorization test. No feature was implemented in that rehearsal.

Local run evidence is in `.bypass/runs/` and is intentionally not committed.
The selected exported regressions and their runtime are committed on the fix
branch. `npm run test:security` runs those two checks against port 3010.

## Record this story in 180 seconds

| Time | Screen | Point to make |
|---|---|---|
| 0:00–0:18 | Aegis dashboard: asteroid trajectory and mission status | A forged crew identity can alter the deflection plan. |
| 0:18–0:38 | Bypass install and Muse Code wizard connected to this repo | One client repo, source plus running app. |
| 0:38–1:02 | Source finding at `src/server.ts` | Muse identifies the trust-boundary error. |
| 1:02–1:30 | Blackbox report and fresh controls for `f-001`/`f-002` | Anonymous requests are denied; the claimed header reads and changes crew controls. Show the red collision state. |
| 1:30–1:52 | Exported regression failing on the vulnerable build | The proof becomes a repeatable test. |
| 1:52–2:18 | One focused source fix and CI/security test passing | Crew identity now comes from a verified session. |
| 2:18–2:42 | Fixed build SHA and original PoC returning `not_reproduced` | The selected flaw is fixed; other findings remain open. |
| 2:42–3:00 | Bypass feature context before a new calibration feature | The coding agent receives the old finding as a stale lead and carries the authorization requirement into new work. |

Use a cut or time lapse for the six-minute audit. Keep the original run ID and
real timestamps visible; do not present the audit as if it finished live within
the three-minute video.

## Local before/after commands

Keep the service on loopback. The deliberately vulnerable diagnostic endpoint
can execute operating-system commands inside its disposable container.

```bash
docker stop aegis-mission-demo
docker run -d --rm --name aegis-mission-demo --read-only --cap-drop=ALL \
  --pids-limit=64 --memory=256m -p 127.0.0.1:3010:3000 \
  aegis-mission-control:vulnerable
npm run test:security  # expected failure: two reproduced findings

docker stop aegis-mission-demo
docker run -d --rm --name aegis-mission-demo --read-only --cap-drop=ALL \
  --pids-limit=64 --memory=256m -p 127.0.0.1:3010:3000 \
  aegis-mission-control:fixed
npm run test:security  # expected pass: both findings no longer reproduce
curl -fsS http://127.0.0.1:3010/api/system/version
```

The original PoCs can also be replayed with `--expect-fixed` from
`.bypass/runs/bx-20261102-d3c8975e/poc/f-001/` and `f-002/`.

The GitHub Actions workflow runs the same checks on pushes and pull requests.
Its actual hosted result, a private GitHub repository, and any Cloudflare
deployment remain to be verified before filming those claims.
