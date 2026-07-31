let meta = #{
    name: "base-planner-goal",
    description: "Iterate Pacifist offline base planner until auto-expand gates pass: dense exts, thin corridors, shell access, towers, 60@RCL8",
    when_to_use: "When improving Pacifist base planner / plan-suite toward auto-expansion placement quality",
    phases: [
        #{ title: "Assess", detail: "Run suite, score gates vs BASE-PLANNER-GOAL.md" },
        #{ title: "Implement", detail: "Edit legacy/plan-offline.mjs toward failing gates" },
        #{ title: "Critic", detail: "Harsh review against user rules + gates" },
        #{ title: "Judge", detail: "Accept, list next fixes, or stop if good enough" },
    ],
};

let assess_schema = #{
    "type": "object",
    "required": ["gate_summary", "failing_gates", "worst_rooms", "notes"],
    "properties": #{
        "gate_summary": #{ "type": "string" },
        "failing_gates": #{ "type": "array", "items": #{ "type": "string" } },
        "worst_rooms": #{ "type": "array", "items": #{ "type": "string" } },
        "notes": #{ "type": "string" },
        "ext60_ratio": #{ "type": "string" },
    },
};

let implement_schema = #{
    "type": "object",
    "required": ["changed_files", "what_changed", "suite_result"],
    "properties": #{
        "changed_files": #{ "type": "array", "items": #{ "type": "string" } },
        "what_changed": #{ "type": "string" },
        "suite_result": #{ "type": "string" },
        "ext60_ratio": #{ "type": "string" },
    },
};

let critic_schema = #{
    "type": "object",
    "required": ["violations", "severity", "must_fix"],
    "properties": #{
        "violations": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 12 },
        "severity": #{ "type": "string" },
        "must_fix": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 8 },
        "looks_good": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 6 },
    },
};

let judge_schema = #{
    "type": "object",
    "required": ["verdict", "reason", "next_round_focus"],
    "properties": #{
        "verdict": #{ "type": "string" },
        "reason": #{ "type": "string" },
        "next_round_focus": #{ "type": "string" },
        "good_enough_for_auto_expand": #{ "type": "boolean" },
    },
};

// args.rounds default 10; args.skip_implement for assess-only
// Each round ≈ 4 agents (assess + implement + critic + judge).
// 100 rounds needs agent_budget ≥ ~400. Stop early on judge verdict done|blocked.
let rounds = 10;
if args != () && args.rounds != () {
    rounds = args.rounds;
}
if type_of(rounds) != "i64" && type_of(rounds) != "i32" {
    rounds = 10;
}
if rounds < 1 { rounds = 1; }
if rounds > 100 { rounds = 100; }

let skip_impl = false;
if args != () && args.skip_implement == true {
    skip_impl = true;
}

let repo = "C:\\Users\\stemm\\Documents\\GitHub\\screeps\\Pacifist-Bot";
let goal_doc = repo + "\\docs\\BASE-PLANNER-GOAL.md";
let planner = repo + "\\tools\\plan-suite\\legacy\\plan-offline.mjs";
let out_dir = repo + "\\tools\\plan-suite\\out";

let last_judge = #{};
let round = 1;
while round <= rounds {
    log("=== base-planner-goal round " + round.to_string() + "/" + rounds.to_string() + " ===");

    phase("Assess");
    let assess_prompt = "";
    assess_prompt += "You are assessing the Pacifist-Bot OFFLINE base planner for auto-expansion quality.\n";
    assess_prompt += "Repo: " + repo + "\n";
    assess_prompt += "READ " + goal_doc + " for hard rules and gates A–G.\n";
    assess_prompt += "READ " + planner + " (focus buildRoadsAndExtensions, planRoom, towers, labs).\n";
    assess_prompt += "RUN (execute capability): cd to repo, then:\n";
    assess_prompt += "  fnm exec --using 22 node tools/plan-suite/legacy/plan-offline.mjs --all-claimable\n";
    assess_prompt += "Parse console output: count rooms with ext 60 vs total, towerCover, wall counts.\n";
    assess_prompt += "Read " + out_dir + "\\plans.json if present.\n";
    assess_prompt += "User HATES: sparse every-other-tile extensions, road spam city grids, solid extension bricks with no walk-out, towers all on hub.\n";
    assess_prompt += "Return gate_summary, failing_gates (letters), worst_rooms, notes, ext60_ratio like '35/37'.\n";
    assess_prompt += "Use tools — do not invent suite numbers without running or reading plans.json.\n";

    let assess = agent(assess_prompt, #{
        label: "assess-r" + round.to_string(),
        capability_mode: "execute",
        output_schema: assess_schema,
    });

    let failing = [];
    let assess_text = "";
    if assess != () && assess.success && assess.output != () {
        assess_text = json_encode(assess.output);
        if assess.output.failing_gates != () {
            for g in assess.output.failing_gates { failing.push(g); }
        }
        log("Assess: " + assess.output.gate_summary);
    } else {
        log("Assess failed or empty — still continuing");
        assess_text = "assess failed";
    }

    if !skip_impl {
        phase("Implement");
        let impl_prompt = "";
        impl_prompt += "You IMPLEMENT one focused improvement to the Pacifist offline base planner.\n";
        impl_prompt += "Repo: " + repo + "\n";
        impl_prompt += "Primary file: " + planner + "\n";
        impl_prompt += "Goal doc: " + goal_doc + "\n";
        impl_prompt += "Assess JSON (this round):\n" + assess_text + "\n";
        impl_prompt += "RULES:\n";
        impl_prompt += "- Dense extensions (adjacent packing), thin corridors every ~3 tiles — NOT city grid every 2 tiles, NOT solid brick.\n";
        impl_prompt += "- Full eco protect, no powerSpawn, no double shell, keep lab strip layout.\n";
        impl_prompt += "- Towers: shell coverage range<=5, refill dist from hub ~<=10.\n";
        impl_prompt += "- Roads on perimeter + hub to ramps; labs need D4 road access.\n";
        impl_prompt += "- Fix the WORST failing gate first. Small coherent diff, not a rewrite of the whole file unless needed.\n";
        impl_prompt += "- After edits, RUN: fnm exec --using 22 node tools/plan-suite/legacy/plan-offline.mjs --all-claimable\n";
        impl_prompt += "- Report changed_files, what_changed, suite_result summary, ext60_ratio.\n";
        impl_prompt += "Use search_replace/write and shell. Do real edits.\n";

        let impl = agent(impl_prompt, #{
            label: "implement-r" + round.to_string(),
            capability_mode: "all",
            output_schema: implement_schema,
        });

        let impl_text = "implement failed";
        if impl != () && impl.success && impl.output != () {
            impl_text = json_encode(impl.output);
            log("Implement: " + impl.output.what_changed);
        }

        phase("Critic");
        let critic_prompt = "";
        critic_prompt += "You are a HARSH critic of the Pacifist base planner changes. Fail closed.\n";
        critic_prompt += "Read " + goal_doc + " and " + planner + ".\n";
        critic_prompt += "Read implement result: " + impl_text + "\n";
        critic_prompt += "Optionally re-run suite or read " + out_dir + "\\plans.json.\n";
        critic_prompt += "Flag violations of: dense exts, thin corridors, no road spam, lab access, tower cover+refill, full eco, auto-expand readiness.\n";
        critic_prompt += "Be concrete (file/function). must_fix = ordered next fixes. severity = critical|major|minor.\n";

        let critic = agent(critic_prompt, #{
            label: "critic-r" + round.to_string(),
            capability_mode: "execute",
            output_schema: critic_schema,
        });

        let critic_text = "critic failed";
        if critic != () && critic.success && critic.output != () {
            critic_text = json_encode(critic.output);
            log("Critic severity: " + critic.output.severity);
        }

        phase("Judge");
        let judge_prompt = "";
        judge_prompt += "Judge whether the offline base planner is good enough for AUTO-EXPAND placement (not perfection).\n";
        judge_prompt += "Goal: " + goal_doc + "\n";
        judge_prompt += "Assess: " + assess_text + "\n";
        judge_prompt += "Implement: " + impl_text + "\n";
        judge_prompt += "Critic: " + critic_text + "\n";
        judge_prompt += "verdict must be one of: continue | done | blocked\n";
        judge_prompt += "done only if gates roughly pass AND critic has no critical must_fix AND dense+corridor policy holds.\n";
        judge_prompt += "good_enough_for_auto_expand true only on done.\n";
        judge_prompt += "next_round_focus = single paragraph for next implementer.\n";

        let judge = agent(judge_prompt, #{
            label: "judge-r" + round.to_string(),
            capability_mode: "read-only",
            output_schema: judge_schema,
        });

        if judge != () && judge.success && judge.output != () {
            last_judge = judge.output;
            log("Judge: " + judge.output.verdict + " — " + judge.output.reason);
            if judge.output.verdict == "done" || judge.output.good_enough_for_auto_expand == true {
                let report = "# Base planner goal\n\n";
                report += "Stopped at round " + round.to_string() + "\n\n";
                report += "Verdict: done\n\n";
                report += judge.output.reason + "\n";
                let p = write_scratch_file("base-planner-goal-report.md", report);
                complete(#{
                    path: p,
                    verdict: "done",
                    round: round,
                    reason: judge.output.reason,
                });
            }
            if judge.output.verdict == "blocked" {
                let report = "# Base planner goal BLOCKED\n\n" + judge.output.reason + "\n\nFocus: " + judge.output.next_round_focus;
                let p = write_scratch_file("base-planner-goal-report.md", report);
                complete(#{
                    path: p,
                    verdict: "blocked",
                    round: round,
                    reason: judge.output.reason,
                });
            }
        }
    } else {
        // assess-only mode
        let report = "# Assess only\n\n" + assess_text;
        let p = write_scratch_file("base-planner-goal-report.md", report);
        complete(#{ path: p, verdict: "assess_only", assess: assess.output });
    }

    round += 1;
}

let final_reason = "Finished all rounds without done.";
if last_judge != () && last_judge.reason != () {
    final_reason = last_judge.reason;
}
let next_focus = "";
if last_judge != () && last_judge.next_round_focus != () {
    next_focus = last_judge.next_round_focus;
}
let report2 = "# Base planner goal — rounds exhausted\n\n";
report2 += final_reason + "\n\nNext focus:\n" + next_focus + "\n";
report2 += "\nRe-run: workflow base-planner-goal with args { rounds: 3 }\n";
let p2 = write_scratch_file("base-planner-goal-report.md", report2);
complete(#{
    path: p2,
    verdict: "continue",
    reason: final_reason,
    next_round_focus: next_focus,
});
