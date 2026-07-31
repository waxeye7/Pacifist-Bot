#!/usr/bin/env python3
"""
Fun detailed walkthrough video of the Pacifist offline base planner.

Reads tools/plan-suite/out/plans-full.json, renders step-by-step frames
for many rooms, stitches with ffmpeg.

  python tools/plan-suite/make-walkthrough-video.py
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
FULL = OUT / "plans-full.json"
FRAMES = OUT / "video-frames"
VIDEO = OUT / "planner-walkthrough.mp4"

W, H = 1280, 720
CELL = 12  # 50*12 = 600px map
MAP = 50 * CELL
MX = (W - MAP) // 2
MY = 70

# Screeps-ish palette
C_WALL = (18, 18, 22)
C_PLAIN = (42, 48, 40)
C_SWAMP = (28, 55, 36)
C_BG = (8, 10, 14)
C_PANEL = (14, 18, 24)
C_TEXT = (230, 236, 245)
C_MUTED = (140, 155, 170)
C_ACCENT = (90, 200, 250)
C_HUB = (0, 230, 118)
C_SOURCE = (255, 214, 10)
C_CTRL = (220, 220, 255)
C_MIN = (180, 100, 220)
C_ROAD = (90, 90, 95)
C_EXT = (80, 160, 255)
C_SPAWN = (255, 255, 255)
C_STORAGE = (255, 180, 50)
C_TERM = (100, 200, 200)
C_TOWER = (255, 80, 80)
C_LAB = (160, 100, 255)
C_LINK = (100, 255, 200)
C_OTHER = (180, 180, 180)
C_PERIM = (255, 60, 60)
C_RAMP = (60, 220, 255)
C_SPAWN_PICK = (255, 50, 180)


def font(size: int, bold: bool = False):
    candidates = [
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\consola.ttf",
    ]
    if bold:
        candidates = [
            r"C:\Windows\Fonts\segoeuib.ttf",
            r"C:\Windows\Fonts\arialbd.ttf",
        ] + candidates
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


F_TITLE = font(36, True)
F_SUB = font(20)
F_STEP = font(22, True)
F_BODY = font(16)
F_TINY = font(13)


def tile(terrain: str, x: int, y: int) -> int:
    return int(terrain[y * 50 + x])


def draw_base(draw: ImageDraw.ImageDraw, terrain: str):
    for y in range(50):
        for x in range(50):
            t = tile(terrain, x, y)
            col = C_WALL if t == 1 else (C_SWAMP if t == 2 else C_PLAIN)
            draw.rectangle(
                [MX + x * CELL, MY + y * CELL, MX + (x + 1) * CELL - 1, MY + (y + 1) * CELL - 1],
                fill=col,
            )


def px(p):
    return MX + p["x"] * CELL + CELL // 2, MY + p["y"] * CELL + CELL // 2


def draw_dots(draw, pts, color, r=3):
    for p in pts or []:
        cx, cy = px(p)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def draw_cells(draw, pts, color, outline=None):
    for p in pts or []:
        x0 = MX + p["x"] * CELL
        y0 = MY + p["y"] * CELL
        draw.rectangle([x0 + 1, y0 + 1, x0 + CELL - 2, y0 + CELL - 2], fill=color, outline=outline)


def banner(draw, title: str, subtitle: str = "", step: str = ""):
    draw.rectangle([0, 0, W, 64], fill=C_PANEL)
    draw.text((24, 12), title, font=F_TITLE, fill=C_TEXT)
    if subtitle:
        draw.text((24, 48), subtitle, font=F_TINY, fill=C_MUTED)
    if step:
        # right side step chip
        tw = draw.textlength(step, font=F_STEP)
        draw.rounded_rectangle([W - tw - 40, 14, W - 16, 50], radius=8, fill=(30, 60, 90))
        draw.text((W - tw - 28, 20), step, font=F_STEP, fill=C_ACCENT)


def footer(draw, text: str):
    draw.rectangle([0, H - 48, W, H], fill=C_PANEL)
    draw.text((24, H - 34), text, font=F_BODY, fill=C_MUTED)


def new_frame(title, subtitle="", step=""):
    im = Image.new("RGB", (W, H), C_BG)
    draw = ImageDraw.Draw(im)
    banner(draw, title, subtitle, step)
    return im, draw


def title_card(lines: list[str], hold_name: str, frames_list: list, duration_frames: int = 45):
    im = Image.new("RGB", (W, H), C_BG)
    draw = ImageDraw.Draw(im)
    # fun gradient-ish bars
    for i in range(8):
        draw.rectangle([0, 80 + i * 70, W, 90 + i * 70], fill=(12 + i * 2, 16 + i, 28 + i * 3))
    y = 180
    for i, line in enumerate(lines):
        f = F_TITLE if i == 0 else F_SUB
        col = C_ACCENT if i == 0 else C_TEXT
        tw = draw.textlength(line, font=f)
        draw.text(((W - tw) / 2, y), line, font=f, fill=col)
        y += 48 if i == 0 else 32
    for _ in range(duration_frames):
        frames_list.append(im.copy())


def layer_frame(
    plan: dict,
    show: dict,
    title: str,
    step: str,
    note: str,
    frames_list: list,
    n: int = 28,
):
    im, draw = new_frame(title, plan["room"], step)
    terrain = plan["terrain"]
    draw_base(draw, terrain)

    # map border
    draw.rectangle([MX - 2, MY - 2, MX + MAP + 1, MY + MAP + 1], outline=(60, 70, 80), width=2)

    if show.get("anchors"):
        draw_cells(draw, plan.get("sources"), C_SOURCE)
        if plan.get("controller"):
            draw_cells(draw, [plan["controller"]], C_CTRL)
        if plan.get("mineral"):
            draw_cells(draw, [plan["mineral"]], C_MIN)

    st = plan.get("structures") or {}
    if show.get("roads"):
        draw_cells(draw, st.get("road"), C_ROAD)
    if show.get("extensions"):
        draw_cells(draw, st.get("extension"), C_EXT)
    if show.get("core"):
        draw_cells(draw, st.get("storage"), C_STORAGE)
        draw_cells(draw, st.get("spawn"), C_SPAWN)
        draw_cells(draw, st.get("terminal"), C_TERM)
        draw_cells(draw, st.get("lab"), C_LAB)
        draw_cells(draw, st.get("link"), C_LINK)
        draw_cells(draw, st.get("factory"), C_OTHER)
        draw_cells(draw, st.get("observer"), C_OTHER)
        draw_cells(draw, st.get("nuker"), C_OTHER)
        draw_cells(draw, st.get("container"), (120, 100, 80))
    if show.get("towers"):
        draw_cells(draw, st.get("tower"), C_TOWER)
    if show.get("walls"):
        draw_cells(draw, plan.get("perimeterFull"), C_PERIM)
    if show.get("ramps"):
        draw_cells(draw, plan.get("rampsFull"), C_RAMP)
    if show.get("hub") and plan.get("hub"):
        cx, cy = px(plan["hub"])
        draw.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], outline=C_HUB, width=3)
        draw.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=C_HUB)
    if show.get("spawn_pick") and plan.get("hub"):
        # recommended first spawn near hub (hub itself or first spawn slot)
        spawns = (st.get("spawn") or [plan["hub"]])[:1]
        for p in spawns:
            x0 = MX + p["x"] * CELL - 2
            y0 = MY + p["y"] * CELL - 2
            draw.rectangle(
                [x0, y0, x0 + CELL + 3, y0 + CELL + 3],
                outline=C_SPAWN_PICK,
                width=3,
            )
        draw.text((MX, MY + MAP + 8), "★ Recommended first SPAWN (respawn pick)", font=F_TINY, fill=C_SPAWN_PICK)

    # side legend
    lx, ly = 24, 90
    draw.rounded_rectangle([12, 80, MX - 16, H - 60], radius=12, fill=C_PANEL)
    draw.text((lx, ly), "LAYERS", font=F_STEP, fill=C_ACCENT)
    ly += 36
    legend = [
        ("Terrain", C_PLAIN),
        ("Source", C_SOURCE),
        ("Controller", C_CTRL),
        ("Hub", C_HUB),
        ("Core", C_STORAGE),
        ("Roads", C_ROAD),
        ("Extensions", C_EXT),
        ("Walls", C_PERIM),
        ("Ramps", C_RAMP),
        ("Towers", C_TOWER),
    ]
    for name, col in legend:
        draw.rectangle([lx, ly, lx + 14, ly + 14], fill=col)
        draw.text((lx + 22, ly - 1), name, font=F_TINY, fill=C_TEXT)
        ly += 22

    rf = plan.get("ratingFull") or {}
    ly += 12
    draw.text((lx, ly), f"ext {rf.get('extensions', '?')}/60", font=F_TINY, fill=C_TEXT)
    ly += 18
    draw.text((lx, ly), f"walls {rf.get('wallTiles', '?')}", font=F_TINY, fill=C_TEXT)
    ly += 18
    draw.text((lx, ly), f"towers {rf.get('towers', '?')}", font=F_TINY, fill=C_TEXT)
    ly += 18
    draw.text((lx, ly), f"tCover {rf.get('towerCoverPct', '?')}%", font=F_TINY, fill=C_TEXT)

    footer(draw, note)
    for _ in range(n):
        frames_list.append(im.copy())


def room_sequence(plan: dict, frames_list: list):
    room = plan["room"]
    rf = plan.get("ratingFull") or {}
    steps = [
        ({}, f"{room} — bare terrain", "01 TERRAIN", "Walls dark · plains · swamp. No buildings yet."),
        ({"anchors": True}, f"{room} — anchors", "02 ANCHORS", "Sources (gold) · controller (white) · mineral (purple). Planner must reach these."),
        ({"anchors": True, "hub": True}, f"{room} — hub score", "03 HUB", "Green ring = scored hub (open space + paths to anchors, off the edge)."),
        ({"anchors": True, "hub": True, "core": True}, f"{room} — core stamp", "04 CORE", "Storage · spawns · terminal · labs strip · links · factory… (no powerSpawn)."),
        ({"anchors": True, "hub": True, "core": True, "roads": True}, f"{room} — roads", "05 ROADS", "Hub ring · spokes · corridors · paths to sources/controller. Useful roads stay."),
        (
            {"anchors": True, "hub": True, "core": True, "roads": True, "extensions": True},
            f"{room} — extensions",
            "06 EXTENSIONS",
            f"Dense pack to 60 @ RCL8 (this room: {rf.get('extensions', '?')}). Full eco = all inside the seal.",
        ),
        (
            {
                "anchors": True,
                "hub": True,
                "core": True,
                "roads": True,
                "extensions": True,
                "walls": True,
            },
            f"{room} — min-cut walls",
            "07 MIN-CUT",
            "Dilate protect set by 3 (RA3-safe) → fewest tiles sealing exits from eco.",
        ),
        (
            {
                "anchors": True,
                "hub": True,
                "core": True,
                "roads": True,
                "extensions": True,
                "walls": True,
                "ramps": True,
                "towers": True,
            },
            f"{room} — ramps + towers",
            "08 DEFENSE",
            "Cyan = ramp openings · red towers cover the shell (range ≤5) but refillable from storage.",
        ),
        (
            {
                "anchors": True,
                "hub": True,
                "core": True,
                "roads": True,
                "extensions": True,
                "walls": True,
                "ramps": True,
                "towers": True,
                "spawn_pick": True,
            },
            f"{room} — first spawn pick",
            "09 RESPAWN",
            "When you respawn you CHOOSE the spawn tile. Aim for the planned spawn / hub — planner anchors the base there.",
        ),
    ]
    for show, title, step, note in steps:
        layer_frame(plan, show, title, step, note, frames_list, n=32)


def main():
    if not FULL.exists():
        print("Missing plans-full.json — run: node tools/plan-suite/legacy/plan-offline.mjs --all-claimable")
        sys.exit(1)

    plans = json.loads(FULL.read_text(encoding="utf-8"))
    plans = [p for p in plans if p.get("terrain") and not p.get("error")]
    plans.sort(key=lambda p: -(p.get("ratingFull") or {}).get("overall", 0))

    # many rooms: top 12 + a few famous ones forced in
    want = {"E2S7", "E5S1", "E5S7", "E1S4", "E7S8", "E9S8", "E8S4"}
    by_room = {p["room"]: p for p in plans}
    ordered = []
    for r in sorted(want):
        if r in by_room:
            ordered.append(by_room[r])
    for p in plans:
        if p["room"] not in {x["room"] for x in ordered}:
            ordered.append(p)
        if len(ordered) >= 14:
            break

    frames: list[Image.Image] = []
    title_card(
        [
            "PACIFIST BASE PLANNER",
            "Offline walkthrough · how a room becomes a base",
            f"{len(ordered)} rooms · step-by-step · full eco · RA3-safe shell",
        ],
        "intro",
        frames,
        55,
    )
    title_card(
        [
            "THE PIPELINE",
            "1 Terrain → 2 Anchors → 3 Hub → 4 Core",
            "5 Roads → 6 Extensions → 7 Min-cut → 8 Towers/Ramps",
            "9 First spawn pick (respawn moment)",
        ],
        "pipeline",
        frames,
        60,
    )

    for i, plan in enumerate(ordered):
        title_card(
            [f"ROOM {i + 1}/{len(ordered)}", plan["room"], f"score {(plan.get('ratingFull') or {}).get('overall', '?')}"],
            plan["room"],
            frames,
            28,
        )
        room_sequence(plan, frames)

    title_card(
        [
            "FIRST SPAWN = YOUR CHOICE",
            "On respawn, YOU place the spawn.",
            "Best play: put it on the planned spawn/hub tile.",
            "Planner then grows roads, exts, walls around that seed.",
        ],
        "spawn",
        frames,
        70,
    )
    title_card(
        [
            "ROADS",
            "Keep roads that are useful:",
            "hub ring · source/controller paths · corridors · wall access",
            "Trim only dead spurs — not functional network.",
        ],
        "roads",
        frames,
        55,
    )
    title_card(
        [
            "THAT'S THE OFFLINE PLANNER",
            "Gallery: tools/plan-suite/out/index.html",
            "Goal: auto-expand placement, not museum art",
        ],
        "outro",
        frames,
        50,
    )

    FRAMES.mkdir(parents=True, exist_ok=True)
    # write as image sequence for ffmpeg
    print(f"Writing {len(frames)} frames…")
    for i, im in enumerate(frames):
        im.save(FRAMES / f"f{i:05d}.png")

    # 12 fps
    cmd = [
        "ffmpeg",
        "-y",
        "-framerate",
        "12",
        "-i",
        str(FRAMES / "f%05d.png"),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "20",
        str(VIDEO),
    ]
    print("ffmpeg…", " ".join(cmd))
    subprocess.check_call(cmd)
    print("Wrote", VIDEO)
    print("Duration ~", round(len(frames) / 12, 1), "s")


if __name__ == "__main__":
    main()
