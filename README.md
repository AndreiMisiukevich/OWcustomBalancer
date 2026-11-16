# Overwatch custom game balancer

Team balancer for Overwatch custom games, rebuilt for Overwatch 2: role lock 5v5 (1-2-2) by default, 6v6 and any custom slot layout, current ranks Bronze through Champion, and BattleTag lookup through the [OverFast API](https://overfast-api.tekrop.fr).

Fork of [adminimusRU/OWcustomBalancer](https://github.com/adminimusRU/OWcustomBalancer) (MIT). The balancing algorithm is the original one, unchanged.

## Features

- Balancing by average SR and roles, with or without role lock, with an automatic fallback when roles can't fill every slot
- Adjustable priority between equal SR and players on their main role
- One-trick separation and optional per-role SR weighting
- OW2 ranks with divisions, mapped to SR for balancing: 500 SR per rank, 100 per division (Bronze 5 = 550, Champion 1 = 4950)
- Add players by BattleTag; ranks, role playtime and top heroes come from OverFast (PC or console ranks)
- Drag and drop, double-click to auto-move, right-click to edit name, roles and ranks
- Pinned players, check-in, fill teams from checked-in players
- Import and export of players (JSON, BattleTag list, CSV) and teams (text, table for spreadsheets, PNG)
- Everything is stored in the browser's local storage; there is no server

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # parity and unit tests
npm run build    # static build in dist/
```

The original app's scripts live in `legacy/` and are used only by tests. `public/balancer/` holds the balancer worker files byte-for-byte as in the original; a test fails if they change. `tests/differential.test.ts` runs randomized action sequences (drag and drop, double-click, fill, role lock, settings, edit, check-in, balance results, stats updates) in both the original app and the new code and compares state and local storage after every step. CI runs 200 scenarios of 20 steps; for a deeper run use `DIFF_SCENARIOS=1000 npm test`. `tests/fixes.test.ts` covers bugs from the original that were fixed on purpose (import edge cases, CSV quoting, the text export separator, corrupted saved data, duplicate players).

Pushes to `master` run the tests, build and deploy to GitHub Pages.

See [CREDITS.md](CREDITS.md) for third-party assets.
