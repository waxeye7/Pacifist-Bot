C: 310.92 GB free / 1862.90 GB (used 1551.98 GB) · 2026-08-16T10:13Z · nothing deleted
C: 313.96 GB free / 1862.90 GB (used 1548.94 GB) · 2026-08-16T07:13Z · nothing deleted
C: 313.59 GB free / 1862.90 GB (used 1549.31 GB) · 2026-08-16T04:14Z · nothing deleted
C: 311.93 GB free / 1862.90 GB (used 1550.97 GB) · 2026-08-16T01:16Z · nothing deleted
# Hygiene — 2026-08-16T01:02Z · Get-PSDrive C · read-only · no delete
C: 311.92 GB free / 1862.90 GB (used 1550.98 GB)
threshold 50 GB · 311.92 >= 50 · no warn
nothing deleted · leftover inventory below unchanged
listed only · never reset / never compose-down / never push-race
C: check only this pass · docker / race / HEAD not re-probed

# Hygiene — 2026-08-16T00:30Z · read-only · no delete · no compose-down · no reset
C: 316.36 GB free / 1862.90 GB (used 1546.55 GB)
docker local-screeps-server-*: screeps-1 / redis-1 / mongo-1 · Up 20h healthy · 127.0.0.1:23456→21025
repo .grok 11 KB. ~/.grok/worktrees: youtube 8 · evokefilms 0 · market-bot 39 (35 nm junctions → market-bot) · pacifist-bot 0 empty. sample ~13 MB. not huge. listed, not deleted.
sibling leftovers: Pacifist-Bot-rcl1 7.1 MB (git wt e36e0a6) + 21 market-bot-wt-* + 5 screeps-loop-agent-* = 127.4 MB. not huge.
race watch: 1 instance · pwsh 13896 → node 35268 · `race.mjs --watch --run run-2026-08-15T23-57-10Z --interval 15` · started 2026-08-16 11:57 +12
HEAD detached e36e0a6 · CONTROL pin e839fc8 · cycle-15-5w-latch · docker ON · never reset / never push-race
no other race-dash / race-hourly / race-mean watchers

---

## Disk leftovers — 2026-08-16 · read-only · **not deleted**

Inventory of leftover dirs that look like old worktrees under `C:\Users\stemm\.grok` and `C:\Users\stemm\Documents\GitHub\screeps`. Sizes: COM `Folder.Size` on GitHub\screeps; `robocopy /L /XJ /BYTES` (unique, no junctions) + file sums on `.grok\worktrees`. COM reports **0** for `.grok\worktrees` (unreliable).

### `C:\Users\stemm\.grok` top-level (COM)

| Path | Size | Note |
| --- | ---: | --- |
| `C:\Users\stemm\.grok\sessions` | **124,291.3 MB (~121.4 GB)** | 160 children. Not worktrees. Largest leftover under `.grok`. |
| `C:\Users\stemm\.grok\bin` | 406.1 MB | live CLI |
| `C:\Users\stemm\.grok\downloads` | 403.3 MB | old grok-1.0.3 / 1.0.4 / current exe |
| `C:\Users\stemm\.grok\bundled` | 12.3 MB | |
| `C:\Users\stemm\.grok\marketplace-cache` | 9.4 MB | |
| `C:\Users\stemm\.grok\memory` | 8.4 MB | |
| `C:\Users\stemm\.grok\logs` | 4.8 MB | |
| `C:\Users\stemm\.grok\memtrace` | 4.6 MB | |
| `C:\Users\stemm\.grok\vendor` | 4.1 MB | |
| `C:\Users\stemm\.grok\worktrees` | COM 0.0 · **real ~226 GB** | see below |

Sessions top children (COM): `C%3A%5CUsers%5Cstemm\` **117,159.5 MB**; youtube-shorts-finder 3,196.4 MB; Pacifist-Bot 1,537.5 MB; market-bot 1,373.7 MB; evokefilms 206.1 MB; `.worktrees/exhaustive-edge-cases` 162.5 MB.

Downloads: `grok-1.0.3-windows-x86_64` 135.1 MB · `grok-1.0.4-windows-x86_64` 135.5 MB · `grok-windows-x86_64.exe` 132.7 MB.

### `C:\Users\stemm\.grok\worktrees` — leftover grok subagent clones

`worktrees.db` 49,152 B · 2026-08-16 02:23.

| Path | Children | Unique size | What |
| --- | ---: | ---: | --- |
| `...\worktrees\desktop-youtube-shorts-finder\` | **8** subagent dirs | **~224–230 GB** | full clones (own `.git` dir, not linked). Each ≈ **28.1 GB** / 410,167 files (`robocopy /XJ` on `…164e…` = 28,785.6 MB). Per tree: `.git` 6.7 GB · `outreach` 13.4 GB (7 files) · `product` 125 MB · top `marly_studio_marketing_video.mp4` 12.6 MB. All 8 same `.git`/`outreach` shape; `…1676…` also 410,167 files. |
| `...\worktrees\screeps-market-bot\` | **40** subagent dirs + `jack.ts.impl.bak` | **975.0 MB** `/XJ` | leftover market-bot clones. 33× `node_modules` **Junction**; 3× real `node_modules` dir (~149 MB each: `…d784…`, `…d789…`, `…d7ab…`); rest ~13–16 MB. |
| `...\worktrees\github-evokefilms\` | **0** | **0** | empty shell. Sessions still have 16+ evokefilms subagent dirs. |
| `...\worktrees\screeps-pacifist-bot\` | **0** | **0** | empty shell. Sessions still have 4 pacifist subagent dirs. |

Youtube 8 (each ~28 GB):

- `C:\Users\stemm\.grok\worktrees\desktop-youtube-shorts-finder\subagent-01a005ba-164e-7662-b45a-5cda3d8d6b14`
- `...\subagent-01a005ba-1653-70a3-8e5a-557a06cfa754`
- `...\subagent-01a005ba-1658-77e2-a427-b8bc007ad625`
- `...\subagent-01a005ba-165b-7692-8013-66d1a5dd385a`
- `...\subagent-01a005ba-165f-7e62-b96f-9b05ba854158`
- `...\subagent-01a005ba-166a-76b3-b8dd-e6774bb17fe0`
- `...\subagent-01a005ba-1670-7d81-ba1a-996b839414c9`
- `...\subagent-01a005ba-1676-7b43-9413-79c2e89fa0bb`

Market-bot fat copies (real `node_modules`, not junction):

- `C:\Users\stemm\.grok\worktrees\screeps-market-bot\subagent-01a007ef-d784-7fd0-9719-262695725adb` — 149.2 MB / 16,161 files
- `...\subagent-01a007ef-d789-72d3-b6b2-447262540345` — 149.2 MB / 16,160 files
- `...\subagent-01a007ef-d7ab-7120-a2c6-5c8fc4cc5420` — 148.9 MB / 16,072 files

### `C:\Users\stemm\Documents\GitHub\screeps` — leftover git worktrees

Parent total COM **5,420.5 MB**. Live mains (not leftovers): Pacifist-Bot 1,231.4 MB · market-bot 188.7 MB · Atlantis-Bot 169.5 MB · screeps-bounty-arena 85.3 MB · screeps-loop 31.5 MB · The-International-Open-Source 16.1 MB · beta-spawn_and_swamp 0.2 MB.

**21 detached `market-bot` worktrees** (`git worktree list` from `market-bot`, all detached). `node_modules` is a **Junction** (COM ~175 MB/tree follows it; unique `/XJ` is source only).

| Path | Unique `/XJ` | Apparent COM |
| --- | ---: | ---: |
| `...\market-bot-wt-core-find` | 5.0 MB | 175.0 MB |
| `...\market-bot-wt-expand-find` | 5.0 MB | 175.0 MB |
| `...\market-bot-wt-expand-res` | 4.9 MB | 174.9 MB |
| `...\market-bot-wt-hq-find` | 4.9 MB | 174.9 MB |
| `...\market-bot-wt-inkabi-find` | 4.9 MB | 174.9 MB |
| `...\market-bot-wt-ql-boost-mem-find` | 2.6 MB | 172.7 MB |
| `...\market-bot-wt-ql-duo-dps-find` | 2.6 MB | 172.6 MB |
| `...\market-bot-wt-ql-duo-heal-find` | 2.6 MB | 172.6 MB |
| `...\market-bot-wt-ql-healer-find` | 2.5 MB | 172.6 MB |
| `...\market-bot-wt-ql-infra-tomb` | 2.5 MB | 172.6 MB |
| `...\market-bot-wt-ql-outpost-struct-find` | 2.6 MB | 172.6 MB |
| `...\market-bot-wt-ql-rdps-find` | 2.6 MB | 172.6 MB |
| `...\market-bot-wt-ql-tank-find` | 2.6 MB | 172.6 MB |
| `...\market-bot-wt-ql-voleuse-find` | 2.6 MB | 172.6 MB |
| `...\market-bot-wt-settle-wipe` | 5.0 MB | 175.0 MB |
| `...\market-bot-wt-settler-src` | 4.9 MB | 174.9 MB |
| `...\market-bot-wt-solidity` | 4.9 MB | 174.9 MB |
| `...\market-bot-wt-spawn-cont-find` | 4.9 MB | 175.0 MB |
| `...\market-bot-wt-tower-cont` | 4.9 MB | 174.9 MB |
| `...\market-bot-wt-tower-owned` | 5.0 MB | 175.0 MB |
| `...\market-bot-wt-ushevu-res` | 4.9 MB | 174.9 MB |
| **21-tree unique / apparent** | **~82 MB** | **~3.67 GB** (same `node_modules`) |

**Pacifist-Bot extra worktree** (same detached `e36e0a6` as main):

| Path | Unique `/XJ` |
| --- | ---: |
| `C:\Users\stemm\Documents\GitHub\screeps\Pacifist-Bot-rcl1` | 7.1 MB |

**screeps-loop agent leftovers** — dirs exist *under* `GitHub\screeps\`. Registered worktrees point at missing `C:\Users\stemm\Documents\GitHub\screeps-loop-agent-N` (prunable). `.git` files point at `C:/Users/stemm/Documents/GitHub/screeps-loop/.git/worktrees/…` (also not the live `screeps\screeps-loop` repo).

| Path | Unique `/XJ` |
| --- | ---: |
| `...\screeps-loop-agent-1` | 5.2 MB |
| `...\screeps-loop-agent-2` | 5.2 MB |
| `...\screeps-loop-agent-3` | 5.2 MB |
| `...\screeps-loop-agent-4` | 17.0 MB |
| `...\screeps-loop-agent-5` | 5.2 MB |
| **5-tree unique** | **37.8 MB** |

GitHub\screeps leftover unique (21 + rcl1 + 5 agents) ≈ **127 MB**. Apparent market-bot-wt if you count junctioned `node_modules` ≈ **3.67 GB**.

### Scale (nothing deleted)

| Bucket | Unique disk | Apparent / notes |
| --- | ---: | --- |
| `.grok\worktrees\desktop-youtube-shorts-finder` **8 full clones** | **~225 GB** | the only huge leftover |
| `.grok\sessions` | **~121 GB** | logs, not checkout trees |
| `.grok\worktrees\screeps-market-bot` 40 clones | **975 MB** | 3 have real `node_modules` |
| `.grok\downloads` + `bin` | ~809 MB | installers / CLI |
| GitHub\screeps `market-bot-wt-*` + rcl1 + loop-agents | **~127 MB** unique | ~3.67 GB if junctions counted |
| `.grok\worktrees\github-evokefilms` + `screeps-pacifist-bot` | **0** | empty dirs; session names remain |
