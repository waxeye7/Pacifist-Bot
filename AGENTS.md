# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single product: a **Screeps** AI bot (`screeps-typescript-starter` based).
There is no long-running local service. The "application" is the TypeScript in `src/`
bundled by Rollup into `dist/main.js`, which is uploaded to (and executed by) a Screeps
game server. Standard commands live in `package.json` `scripts` — use those.

### Environment
- Node: `package.json` `engines` pins `10.x || 12.x` and `.devcontainer` uses `node:12-alpine`,
  but everything below (build, unit-test tooling, lint) runs fine on the VM's default **Node 22**.
  Do not switch to Node 12 with `nvm`; the exec-daemon `node` shim stays on 22 and mixing them
  leaves `npm` pointing at Node 12's `npm@6` and breaks `npm run <script>`.
- `npm install` installs all committed dev tooling (Rollup, ts-node/mocha, ESLint/Prettier).
  There is no committed lockfile (`package-lock.json` is gitignored).

### Build / run the bot
- `npm run build` → compiles `src/main.ts` to `dist/main.js` (+ `dist/main.js.map.js`).
- Non-obvious: `rollup.config.js` passes an explicit `include` to `rollup-plugin-typescript2`.
  Without it, the plugin's default extglob patterns (`**/*.ts+(|x)`) do not match under the
  modern `@rollup/pluginutils` (picomatch) that gets installed, so every `.ts` file is passed
  through untransformed and the build fails with "Unexpected token". Keep that `include`.
- Uploading to a live server (`npm run push-*` / `watch-*`) needs a gitignored `screeps.json`
  (copy `screeps.example.json`) with a token or email/password. Not needed to build or test.

### Lint
- `npm run lint` runs ESLint over `src/**/*.ts` using `.eslintrc.js`.
- It currently reports thousands of PRE-EXISTING findings (mostly `prettier/prettier`
  formatting — the code was never linted), so it exits non-zero. That is code state, not a
  tooling problem. `npx eslint --fix "src/**/*.ts"` would auto-fix most, but only do that if asked.

### Unit tests
- `npm test` (= `test-unit`) runs `mocha test/unit/**/*.ts` via `ts-node` + `tsconfig-paths`.
- The runner is wired through `test/mocha.opts` + `test/setup-mocha.js`, which sets
  `TS_NODE_PROJECT=tsconfig.test.json` (a small CommonJS override of `tsconfig.json`).
- Non-obvious: the current single unit test transitively imports `src/utils/ErrorExporter.ts`,
  which calls the Screeps global `RawMemory` at import time. `test/unit/mock.ts` only stubs
  `Game`/`Memory`, so the suite throws `ReferenceError: RawMemory is not defined`. This is a
  code/test-fixture gap in the repo, not an environment issue — running the actual bot logic
  end-to-end is better done via the integration path below.

### Integration test (optional, best end-to-end proof)
- `test/integration/**/*.ts` boots an in-process mock Screeps server via `screeps-server-mockup`,
  loads the built `dist/main.js` as a bot, and runs game ticks. This is the closest thing to
  "running the app" locally.
- `screeps-server-mockup` is intentionally NOT in `package.json` (it pulls the full `screeps`
  server incl. native `isolated-vm` built from git — a slow, heavy install of ~500 packages).
  It is therefore not part of the update script. To run integration tests, install it on demand:
  `npm install --no-save screeps-server-mockup@1.5.1` (takes several minutes), then
  `npm run build && npx mocha "test/integration/**/*.ts"`.
- Expect the "runs a server and matches the game tick" test to pass (bot boots + ticks). The
  "writes and reads to memory" test fails by design: the bot's `MemHack` (`src/utils/MemHack.ts`)
  replaces `global.Memory` with a cached reference each tick, dropping externally-injected
  `Memory.foo`. Not an environment issue.
