# Pacifist Screeps Bot

Welcome to the [Pacifist Screeps Bot](https://github.com/waxeye7/Pacifist-Bot) repository! Don't be fooled by its name—this bot is a wolf in sheep's clothing, designed for players of [Screeps](https://screeps.com/), an MMO strategy game for programmers, who want to dominate the game world with a cunning strategy. By appearing peaceful, our bot will lure other players into a false sense of security before striking them when they least expect it.

## Table of Contents
- [Features](#features)
- [Getting Started](#getting-started)
- [Contributions](#contributions)
- [License](#license)

## Features

* Deceptive resource management and allocation
* Covert offensive capabilities for rooms with RCL 7 or lower
* Espionage and reconnaissance tools
* Sabotage of enemy colonies
* Efficient energy harvesting and transportation
* Hidden expansion and resource control

## Getting Started

To use the Pacifist Screeps Bot, follow these simple steps:

1. Clone this repository to your local machine.
git clone https://github.com/waxeye7/Pacifist-Bot.git

2. Install the required dependencies.
npm install

3. Copy the screeps.example.json file and rename it to screeps.json and change the details to include your Screeps account credentials (email and password) or token.

4. Push the code to your Screeps account.
npm run push-main

Now, the Pacifist Screeps Bot will run and manage your in-game colony with a focus on cunning and deceptive strategies.

## Contributions

Feel free to submit pull requests or create issues for bugs and feature requests. Let's make the Pacifist Screeps Bot the most cunning and formidable bot in the game, and help improve its strategies for high RCL combat!

## License

This project is released into the public domain using the Unlicense. This means you are free to copy, modify, publish, use, compile, sell, or distribute this software, either in source code form or as a compiled binary, for any purpose, commercial or non-commercial, and by any means. For more information, please refer to <http://unlicense.org>.


## Deploy targets

Three servers. Each is a named destination in `screeps.json`; every `npm run push-*`
script is just `rollup -c --environment DEST:<destination>`.

| Target | Destination(s) | Server | Command |
|---|---|---|---|
| **local** | `pacifist` (also `pserver`, `pacifist2`, `waxeye`, `race`) | local Docker private server, `http://127.0.0.1:23025` | `npm run push-pacifist` |
| **vps** | `vps` (fallback `vps-ip`) | tailnet test server, `http://screeps.marlyman123.com` (fallback `http://100.67.41.31:21025`) | `npm run push-vps` (fallback `npm run push-vps-ip`) |
| **live** | `main` | official MMO, `https://screeps.com` | `npm run push-main` |

Local extras: `npm run push-pacifist2` and `npm run push-waxeye` push the same code to the
second/third accounts on the local server (used for A/B runs — see `tools/server/README.md`).
Watch mode exists for each: `npm run watch-pserver`, `npm run watch-vps`, `npm run watch-main`.

`npm run push-race` (dest `race`, user `pacifist-race`) is **special**: it carries the frozen
**control build** for the early-game speedrun campaign. Do not push to it as part of normal
work — it only changes when the campaign deliberately re-baselines. See
`docs/speedrun-ledger/CONTROL.md`.

### VPS test server notes (`vps`)

- Screeps **v4.3.0**, tick duration **300 ms** — deliberately fast for testing.
- Reachable **ONLY over the Tailscale tailnet**: `http://screeps.marlyman123.com`, fallback
  `http://100.67.41.31:21025`. There is no public access; off the tailnet both URLs fail.
- The server is owned and managed by a **separate Claude instance via the `big_vps` repo**
  (`C:/Users/stemm/Documents/GitHub/big_vps`). From this repo: **do not SSH to it, do not
  change server config, mods, or world state** — code uploads only.
- Status caveat (from `big_vps/logs/2026-08-01-screeps.md`): the `screeps.marlyman123.com`
  A record still points at the public IP and the nginx proxy is not up yet, so **`vps-ip`
  (`npm run push-vps-ip`) is the destination that works today**; switch back to
  `npm run push-vps` once that DNS/proxy work lands.

### Where the tokens go

`screeps.json` is **gitignored**, so it is not in the repo — the entries below are added by
hand on this machine (this repo has no checked-in sample file; copy the snippet below).

- **VPS token (pending).** On the VPS, in the Screeps CLI, run `auth.createAuthToken('<user>')`
  and paste the result over `PASTE-VPS-TOKEN-HERE` in the `token` field of **both** the `vps`
  and `vps-ip` entries of `screeps.json`.
- **Live screeps.com token.** `main.token` in `screeps.json` (paste over
  `PASTE-LIVE-TOKEN-HERE` if the entry is fresh). Never upload to screeps.com unattended.

The local dests need no secrets — their tokens are fixed strings this repo's tooling also
writes into the server's redis/mongo (`auth_<token>`), so they can be pasted verbatim:

```jsonc
// screeps.json (gitignored) — local destinations
"pacifist":   { "token": "local-pacifist-user-token-001",  "protocol": "http", "hostname": "127.0.0.1", "port": 23025, "path": "/", "branch": "main" },
"pserver":    { "token": "local-pacifist-user-token-001",  "protocol": "http", "hostname": "127.0.0.1", "port": 23025, "path": "/", "branch": "main" },
"pacifist2":  { "token": "local-pacifist2-user-token-001", "protocol": "http", "hostname": "127.0.0.1", "port": 23025, "path": "/", "branch": "main" },
"waxeye":     { "token": "local-waxeye-token-001",         "protocol": "http", "hostname": "127.0.0.1", "port": 23025, "path": "/", "branch": "main" },
"race":       { "token": "local-pacifist-race-token-001",  "protocol": "http", "hostname": "127.0.0.1", "port": 23025, "path": "/", "branch": "main" }
```

```jsonc
// screeps.json (gitignored — add these two entries alongside "main" and the local dests)
"vps": {
  "token": "PASTE-VPS-TOKEN-HERE",
  "protocol": "http",
  "hostname": "screeps.marlyman123.com",
  "port": 80,
  "path": "/",
  "branch": "main"
},
"vps-ip": {
  "token": "PASTE-VPS-TOKEN-HERE",
  "protocol": "http",
  "hostname": "100.67.41.31",
  "port": 21025,
  "path": "/",
  "branch": "main"
}
```
