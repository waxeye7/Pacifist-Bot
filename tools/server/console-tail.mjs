#!/usr/bin/env node
/**
 * Tail the live console (log lines + runtime errors) over the Screeps websocket.
 *
 *   fnm exec --using 22 node tools/server/console-tail.mjs --dest main --shard shard3 --seconds 60
 *   fnm exec --using 22 node tools/server/console-tail.mjs --dest vps --seconds 40
 *
 * Read-only: subscribes to `user:<id>/console`, prints what the bot prints.
 * `--errors` filters to stack traces / "Error" lines only.
 * `--grep <re>` filters log lines.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function arg(n, d) {
  const i = process.argv.indexOf("--" + n);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
}
const has = (n) => process.argv.includes("--" + n);

const DEST = arg("dest", "main");
const SECONDS = Number(arg("seconds", 45));
const ONLY_ERRORS = has("errors");
const GREP = arg("grep", null);
const GREP_RE = GREP ? new RegExp(GREP, "i") : null;

const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "screeps.json"), "utf8"))[DEST];
if (!cfg) {
  console.error("no dest " + DEST);
  process.exit(2);
}
const isTLS = (cfg.protocol || "https") === "https";
const hostPort = `${cfg.hostname}${cfg.port && cfg.port !== 80 && cfg.port !== 443 ? ":" + cfg.port : ""}`;
const HTTP = `${cfg.protocol || "https"}://${hostPort}`;
const WS = `${isTLS ? "wss" : "ws"}://${hostPort}/socket/websocket`;

const me = await (await fetch(HTTP + "/api/auth/me", { headers: { "X-Token": cfg.token, "X-Username": cfg.token } })).json();
const UID = me._id;
console.log(`# tail ${DEST} user=${me.username} id=${UID} for ${SECONDS}s`);

const ws = new WebSocket(WS);
let authed = false;
const seen = new Set();

ws.addEventListener("open", () => ws.send("auth " + cfg.token));

ws.addEventListener("message", (ev) => {
  const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
  if (raw.startsWith("auth ok")) {
    authed = true;
    ws.send(`subscribe user:${UID}/console`);
    ws.send(`subscribe user:${UID}/cpu`);
    console.log("# subscribed");
    return;
  }
  if (raw.startsWith("auth failed")) {
    console.error("AUTH FAILED");
    process.exit(1);
  }
  if (raw.startsWith("time ") || raw.startsWith("gz:") === false && (raw === "ok" || raw.startsWith("protocol"))) {
    /* noise */
  }
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(msg)) return;
  const [chan, body] = msg;
  if (typeof chan !== "string") return;

  if (chan.endsWith("/cpu")) {
    if (!has("cpu")) return;
    console.log(`[cpu] ${JSON.stringify(body)}`);
    return;
  }
  if (!chan.endsWith("/console")) return;
  const shard = body.shard ? `${body.shard} ` : "";
  const emit = (tag, line) => {
    const s = String(line);
    if (ONLY_ERRORS && !/error|exception|undefined is not|cannot read|is not a function|TypeError/i.test(s) && tag !== "ERR") return;
    if (GREP_RE && !GREP_RE.test(s)) return;
    const key = tag + s;
    if (tag === "ERR") {
      if (seen.has(key)) return;
      seen.add(key);
    }
    console.log(`[${shard}${tag}] ${s}`);
  };
  if (body.error) emit("ERR", body.error);
  const m = body.messages || {};
  for (const l of m.log || []) emit("log", l);
  for (const l of m.results || []) emit("res", l);
});

ws.addEventListener("error", (e) => console.error("WS ERROR", e.message || e));
ws.addEventListener("close", () => {
  if (!authed) console.error("closed before auth");
});

setTimeout(() => {
  console.log("# done");
  try {
    ws.close();
  } catch {}
  process.exit(0);
}, SECONDS * 1000);
