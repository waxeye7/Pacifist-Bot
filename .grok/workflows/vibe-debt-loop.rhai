let meta = #{
    name: "vibe-debt-loop",
    description: "Hunt, verify, fix, test. Repeat until two dry rounds. Does not stop after one pass.",
    when_to_use: "When Pacifist-Bot vibe-debt should be found AND fixed in a loop for hours, not just reported",
    phases: [
        #{ title: "Hunt", detail: "parallel hunters by subsystem" },
        #{ title: "Verify", detail: "skeptics, fail closed" },
        #{ title: "Fix", detail: "apply confirmed bugs + tests" },
        #{ title: "Test", detail: "npm test / mocha" },
    ],
};

let findings_schema = #{
    "type": "object", "required": ["findings"],
    "properties": #{
        "findings": #{ "type": "array", "maxItems": 5, "items": #{
            "type": "object", "required": ["file", "issue", "evidence"],
            "properties": #{
                "file": #{ "type": "string" },
                "fn": #{ "type": "string" },
                "issue": #{ "type": "string" },
                "severity": #{ "type": "string" },
                "evidence": #{ "type": "string" },
                "test": #{ "type": "string" },
            },
        }},
    },
};

let verdict_schema = #{
    "type": "object", "required": ["real", "reason", "evidence"],
    "properties": #{
        "real": #{ "type": "boolean" },
        "reason": #{ "type": "string" },
        "evidence": #{ "type": "string" },
    },
};

let fix_schema = #{
    "type": "object", "required": ["fixed", "notes"],
    "properties": #{
        "fixed": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 8 },
        "notes": #{ "type": "string" },
        "pushed": #{ "type": "boolean" },
    },
};

let test_schema = #{
    "type": "object", "required": ["ok", "summary"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "summary": #{ "type": "string" },
    },
};

fn hunt_prompt(domain, extra) {
    let p = "";
    p += "You are a read-only bug hunter on Pacifist-Bot at ";
    p += "C:\\Users\\stemm\\Documents\\GitHub\\screeps\\Pacifist-Bot. ";
    p += "USE read_file and grep. Do not answer from memory. ";
    p += "Find REAL shippable bugs in: ";
    p += domain;
    p += ". Not style. Already-fixed (do NOT re-report): ";
    p += "cull by station room, broke-align placement freeze, ";
    p += "homeEconomyStarved cap>300, harvestEnergy RCL<3 + CB guard, ";
    p += "miner bucket idle, panic valve allowRemotes-only, ";
    p += "claimer no-suicide, emergency filler without storage, ";
    p += "tower bucket gate, rescue keeps defenders, emergency feed donor loop, ";
    p += "CB newborn-only spawn feed, broke RCL4+ clamp. ";
    p += "Owner rules that are NOT bugs: expandMinRcl=0 means OFF; ";
    p += "autoExpand unset means ON; do not unclaim rooms; ";
    p += "do not lock expansion behind RCL7. ";
    p += "Read docs/STARVATION-TRAPS.md and test/unit/*.test.ts first. ";
    p += extra;
    p += " At most 5 findings. Empty list ONLY after reading the code. ";
    p += "Each: file, fn, issue, severity P0/P1/P2, evidence quote, test idea.";
    p
}

fn verify_prompt(f) {
    let p = "";
    p += "Adversarially verify this Pacifist-Bot finding. Read the SHIPPED code ";
    p += "at C:\\Users\\stemm\\Documents\\GitHub\\screeps\\Pacifist-Bot. ";
    p += "Use read_file/grep. real=true ONLY with independently inspected evidence. ";
    p += "Default real=false if already guarded, style, or thin. ";
    p += "File: ";
    p += f.file;
    p += " Issue: ";
    p += f.issue;
    p += " Claimed evidence: ";
    p += f.evidence;
    p
}

fn fix_prompt(seed) {
    let p = "";
    p += "You FIX confirmed Pacifist-Bot bugs in the SHARED workspace ";
    p += "C:\\Users\\stemm\\Documents\\GitHub\\screeps\\Pacifist-Bot. ";
    p += "Do NOT use a worktree. Edit the real files. ";
    p += "USE read_file, grep, search_replace, write, run_terminal_command. ";
    p += "Confirmed bugs to fix this round (top ones first, max 4): ";
    p += seed;
    p += " For each: write or extend a mocha test (test/unit/, this repo's style: ";
    p += "executable if exported, else source-pin like migrateSafety.test.ts), ";
    p += "then apply the smallest correct fix. ";
    p += "Then run: npx mocha test/unit/**/*.test.ts ";
    p += "If green, run npm test. If still green you MAY ";
    p += "npm run push-main and npm run push-vps. ";
    p += "NEVER unclaim rooms. NEVER set expandMinRcl to anything but 0. ";
    p += "NEVER lock autoExpand off. NEVER echo screeps.json tokens. ";
    p += "Do not commit unless asked. Return {fixed: [short names], notes, pushed}.";
    p
}

let domains = [
    "src/Rooms/rooms.spawning.ts src/Rooms/spawnSafety.ts — HOL, rescue, clamp, shredder",
    "src/utils/PlanV2.ts — migrateInsta exterior roads, last tower, source boxes, maxSitesFor",
    "src/Managers/AutoExpand.ts src/utils/Features.ts src/Rooms/rooms.remotes.ts src/utils/CpuPolicy.ts src/utils/Segments.ts",
    "src/Roles/*.ts src/Functions/creepFunctions.ts — leftover role traps",
    "src/War/kit.ts src/War/reinforce.ts src/Rooms/rooms.defence.ts src/main.ts src/utils/Commands.ts",
    "src/Rooms/rooms.construction.ts rooms.labs.ts rooms.market.ts — site caps, boost stock",
];

let max_rounds = 16;
if args != () && args.rounds != () {
    max_rounds = args.rounds;
}
if type_of(max_rounds) != "i64" && type_of(max_rounds) != "i32" {
    max_rounds = 16;
}
if max_rounds < 2 { max_rounds = 2; }
if max_rounds > 24 { max_rounds = 24; }

let dry = 0;
let rnd = 0;
let last_fp = "";
let fixed_all = [];

while rnd < max_rounds {
    rnd += 1;
    let left = budget().remaining;
    if left < 20 {
        log("budget remaining " + left.to_string() + " — stopping loop");
        break;
    }

    phase("Hunt");
    log("round " + rnd.to_string() + " hunt");
    let jobs = [];
    let di = 0;
    for d in domains {
        jobs.push(#{
            prompt: hunt_prompt(d, " Round " + rnd.to_string() + "."),
            label: "hunt-r" + rnd.to_string() + "-" + di.to_string(),
            capability_mode: "read-only",
            output_schema: findings_schema,
        });
        di += 1;
    }
    let hunt = parallel(jobs);

    let raw = [];
    for r in hunt {
        if r != () && r.success && r.output.findings != () {
            for f in r.output.findings {
                if f.file != () && f.issue != () && f.evidence != () && f.evidence != "" {
                    raw.push(f);
                }
            }
        }
    }
    log("round " + rnd.to_string() + " raw " + raw.len().to_string());

    let confirmed = [];
    if raw.len() > 0 {
        phase("Verify");
        let vjobs = [];
        let max_v = raw.len();
        if max_v > 16 { max_v = 16; }
        let vi = 0;
        while vi < max_v {
            vjobs.push(#{
                prompt: verify_prompt(raw[vi]),
                label: "verify-r" + rnd.to_string() + "-" + vi.to_string(),
                capability_mode: "read-only",
                output_schema: verdict_schema,
            });
            vi += 1;
        }
        let verdicts = parallel(vjobs);
        let i = 0;
        for v in verdicts {
            if v != () && v.success && v.output.real == true
                && v.output.evidence != () && v.output.evidence != "" {
                confirmed.push(raw[i]);
            }
            i += 1;
        }
    }
    log("round " + rnd.to_string() + " confirmed " + confirmed.len().to_string());

    if confirmed.len() == 0 {
        dry += 1;
        log("dry streak " + dry.to_string());
        if dry >= 2 { break; }
    } else {
        let fp = fingerprint(json_encode(confirmed));
        if fp == last_fp {
            dry += 1;
            log("same findings fingerprint — stall " + dry.to_string());
            if dry >= 2 { break; }
        } else {
            dry = 0;
            last_fp = fp;
        }

        phase("Fix");
        let seed = "";
        let ci = 0;
        while ci < confirmed.len() && ci < 4 {
            seed += confirmed[ci].file + ": " + confirmed[ci].issue + " | ";
            ci += 1;
        }
        let fx = agent(fix_prompt(seed), #{
            label: "fix-r" + rnd.to_string(),
            capability_mode: "all",
            output_schema: fix_schema,
        });
        if fx != () && fx.success && fx.output.fixed != () {
            for name in fx.output.fixed { fixed_all.push(name); }
        }

        phase("Test");
        let tp = "";
        tp += "In C:\\Users\\stemm\\Documents\\GitHub\\screeps\\Pacifist-Bot run ";
        tp += "`npx mocha test/unit/**/*.test.ts` then if that passes `npm test`. ";
        tp += "Do not edit unless a test you just ran is a trivial assertion typo. ";
        tp += "Return {ok: bool, summary: what ran and the count}.";
        let tr = agent(tp, #{
            label: "test-r" + rnd.to_string(),
            capability_mode: "execute",
            output_schema: test_schema,
        });
        if tr != () && tr.success && tr.output.ok == false {
            log("tests failed round " + rnd.to_string() + " — next hunt will see the fallout");
        }
    }
}

let summary = "vibe-debt-loop done after " + rnd.to_string() + " rounds, ";
summary += "dry=" + dry.to_string() + ", fixed=" + fixed_all.len().to_string();
let report = summary + "\n";
for name in fixed_all {
    report += "- " + name + "\n";
}
let path = write_scratch_file("vibe-debt-loop.md", report);
complete(#{
    summary: summary,
    rounds: rnd,
    dry: dry,
    fixed: fixed_all,
    path: path,
});
