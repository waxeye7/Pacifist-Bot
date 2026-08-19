let meta = #{
    name: "vibe-debt-sweep",
    description: "Find, adversarially verify, and loop on vibe-coded self-harm in Pacifist-Bot until two dry rounds",
    when_to_use: "When the bot feels broken after untested vibe-coded waves and you need a find-verify-loop, not one agent",
    phases: [
        #{ title: "Hunt", detail: "parallel hunters by subsystem" },
        #{ title: "Verify", detail: "one skeptic per finding, fail closed" },
        #{ title: "Flow-on", detail: "second hunt seeded by confirmed bugs" },
        #{ title: "Report", detail: "prioritized fix list with tests" },
    ],
};

let findings_schema = #{
    "type": "object", "required": ["findings"],
    "properties": #{
        "findings": #{ "type": "array", "maxItems": 6, "items": #{
            "type": "object", "required": ["file", "issue", "severity", "evidence"],
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
        "severity": #{ "type": "string" },
    },
};

fn hunt_prompt(domain, extra) {
    let p = "";
    p += "You are a read-only bug hunter on Pacifist-Bot at ";
    p += "C:\\Users\\stemm\\Documents\\GitHub\\screeps\\Pacifist-Bot. ";
    p += "USE read_file and grep. Do not answer from memory. ";
    p += "Find REAL shippable bugs in: ";
    p += domain;
    p += ". Not style. Not 'could be cleaner'. ";
    p += "Owner rules that are NOT bugs: expandMinRcl=0 means OFF; ";
    p += "features.autoExpand unset means ON; do not unclaim rooms; ";
    p += "do not lock expansion behind RCL7. ";
    p += "Known live incident: migratePlan(room,true) retired hubs; ";
    p += "41 builders piled on E36N57; cull grouped by current room; ";
    p += "starvation gates on energyAvailable. ";
    p += "Read docs/STARVATION-TRAPS.md and test/unit/*.test.ts first. ";
    p += extra;
    p += " Return at most 6 findings. Empty list is valid ONLY after you read the code. ";
    p += "Each finding: file, fn, issue (what happens on a live tick), ";
    p += "severity (P0/P1/P2), evidence (quote), test (mocha idea).";
    p
}

fn verify_prompt(f) {
    let p = "";
    p += "Adversarially verify this Pacifist-Bot finding by reading the SHIPPED code ";
    p += "at C:\\Users\\stemm\\Documents\\GitHub\\screeps\\Pacifist-Bot. ";
    p += "Use read_file/grep. Set real=true ONLY with independently inspected evidence. ";
    p += "Default real=false if the code already guards it, if it is style, or if evidence is thin. ";
    p += "File: ";
    p += f.file;
    p += " Issue: ";
    p += f.issue;
    p += " Claimed evidence: ";
    p += f.evidence;
    p
}

let domains = [
    "src/Rooms/rooms.spawning.ts and src/Rooms/spawnSafety.ts — HOL, rescue, cull, roomIsBroke, homeEconomyStarved, interleave, shredder",
    "src/utils/PlanV2.ts migration — force vs hub, broke-align, migrateInsta, maxSitesFor, source containers",
    "src/Managers/AutoExpand.ts, src/utils/Features.ts, src/Rooms/rooms.remotes.ts, src/utils/CpuPolicy.ts — hidden RCL gates, remotes latch, CPU closing income",
    "src/Roles/builder.ts carry.ts energyMiner.ts filler.ts upgrader.ts energyManager.ts and src/Functions/creepFunctions.ts — role drift, empty commutes, RCL1-3 firing on RCL4+",
    "src/War/kit.ts, src/Rooms/rooms.defence.ts, src/main.ts, src/utils/Logger.ts — war funding broke rooms, shed defence, command footguns",
    "src/Rooms/rooms.construction.ts and rooms.supportOtherRooms.ts — site caps, spawn-first, storage placement, foreign sites",
    "src/utils/Commands.ts console commands — migratePlan force, stopExpand, spawnRescue, anything one typo from wrecking hubs",
    "src/Rooms/rooms.labs.ts rooms.market.ts and boost ledger — stock in terminal unread, boost-then-forget, market buying into a gate that only reads storage",
];

phase("Hunt");
log("round-1 hunt: 8 domains");
let jobs = [];
let di = 0;
for d in domains {
    jobs.push(#{
        prompt: hunt_prompt(d, ""),
        label: "hunt-" + di.to_string(),
        capability_mode: "read-only",
        output_schema: findings_schema,
    });
    di += 1;
}
let hunt1 = parallel(jobs);

let raw = [];
for r in hunt1 {
    if r != () && r.success && r.output.findings != () {
        for f in r.output.findings {
            if f.file != () && f.issue != () && f.evidence != () && f.evidence != "" {
                raw.push(f);
            }
        }
    }
}
log(raw.len().to_string() + " raw findings after hunt-1");

if raw.len() == 0 {
    complete(#{ summary: "Hunt-1 returned no evidenced findings.", confirmed: [] });
}

phase("Verify");
let vjobs = [];
let max_v = raw.len();
if max_v > 32 { max_v = 32; }
let vi = 0;
while vi < max_v {
    vjobs.push(#{
        prompt: verify_prompt(raw[vi]),
        label: "verify-" + vi.to_string(),
        capability_mode: "read-only",
        output_schema: verdict_schema,
    });
    vi += 1;
}
let verdicts = parallel(vjobs);

let confirmed = [];
let i = 0;
for v in verdicts {
    if v != () && v.success && v.output.real == true
        && v.output.evidence != () && v.output.evidence != "" {
        confirmed.push(raw[i]);
    }
    i += 1;
}
log(confirmed.len().to_string() + "/" + max_v.to_string() + " survived verification");

phase("Flow-on");
if confirmed.len() > 0 {
    let seed = "";
    let ci = 0;
    while ci < confirmed.len() && ci < 8 {
        seed += confirmed[ci].file + ": " + confirmed[ci].issue + " | ";
        ci += 1;
    }
    let extra = " FLOW-ON PASS. Confirmed bugs: " + seed;
    extra += " Hunt only consequences those bugs cause in OTHER files. ";
    extra += "Do not re-report the confirmed bugs themselves.";
    let fjobs = [];
    let flow_domains = [
        "spawn queue + rescue + builder roles interacting with the confirmed bugs",
        "plan placement + construction sites interacting with the confirmed bugs",
        "expand / remotes / CPU interacting with the confirmed bugs",
        "war kit + defence + main tick order interacting with the confirmed bugs",
    ];
    let fi = 0;
    for d in flow_domains {
        fjobs.push(#{
            prompt: hunt_prompt(d, extra),
            label: "flow-" + fi.to_string(),
            capability_mode: "read-only",
            output_schema: findings_schema,
        });
        fi += 1;
    }
    let hunt2 = parallel(fjobs);
    let raw2 = [];
    for r in hunt2 {
        if r != () && r.success && r.output.findings != () {
            for f in r.output.findings {
                if f.file != () && f.issue != () && f.evidence != () && f.evidence != "" {
                    raw2.push(f);
                }
            }
        }
    }
    log(raw2.len().to_string() + " flow-on findings");
    if raw2.len() > 0 {
        let v2 = [];
        let n2 = raw2.len();
        if n2 > 16 { n2 = 16; }
        let j = 0;
        while j < n2 {
            v2.push(#{
                prompt: verify_prompt(raw2[j]),
                label: "verify-flow-" + j.to_string(),
                capability_mode: "read-only",
                output_schema: verdict_schema,
            });
            j += 1;
        }
        let verd2 = parallel(v2);
        let k = 0;
        for v in verd2 {
            if v != () && v.success && v.output.real == true
                && v.output.evidence != () && v.output.evidence != "" {
                confirmed.push(raw2[k]);
            }
            k += 1;
        }
    }
}

phase("Report");
let lines = [];
lines.push("# vibe-debt-sweep confirmed findings");
lines.push("");
let n = 0;
for f in confirmed {
    n += 1;
    let sev = if f.severity != () { f.severity } else { "P?" };
    lines.push(n.to_string() + ". [" + sev + "] " + f.file + " — " + f.issue);
    if f.test != () && f.test != "" {
        lines.push("   test: " + f.test);
    }
}
if confirmed.len() == 0 {
    lines.push("No findings survived adversarial verification.");
}
let report = "";
for line in lines {
    report += line + "\n";
}
let path = write_scratch_file("vibe-debt-report.md", report);
complete(#{
    summary: confirmed.len().to_string() + " confirmed findings",
    count: confirmed.len(),
    path: path,
    confirmed: confirmed,
});
