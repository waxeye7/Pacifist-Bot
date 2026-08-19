# Cycle-18 roads — L2 0/0 · L3 sites 8, ext=5

`run-2026-08-16T06-22-16Z` · `cycle-18-rcl3-haul` · seed0 **4850955**.
mongo `rooms.objects` + redis `memory:pacifist1` · gameTime **4866216**.
No `push-race`.

Gate **L3 and slam-5** (`rcl===3 && cap>=550`). 17 SEND-BACK was RCL2 pave (E16S9 L3 **31858** after **62** roads).

## L2 cand — **0 / 0** (pass)

All slam-5 (`ext=5 / cap=550`). **0 standing roads / 0 road sites.** No 17 leak.

| room | L / p | ext / cap | roads / sites |
| --- | --- | --- | ---: |
| E5S3 | 2 / 32050 | 5 / 550 | **0 / 0** |
| E12S3 | 2 / 25427 | 5 / 550 | **0 / 0** |
| E18S9 | 2 / 11259 | 5 / 550 | **0 / 0** |
| E11S6 | 2 / 5079 | 5 / 550 | **0 / 0** |
| E18S5 | 2 / 5972 | 5 / 550 | **0 / 0** |
| E12S1 | 2 / 21708 | 5 / 550 | **0 / 0** |

## L3 cand — arterial **0 / 8** · leftover-5 **hold**

| room | L / p | ext / cap | roads / sites | B |
| --- | --- | --- | ---: | ---: |
| **E16S9** | 3 / 14551 | **5 / 550** | **0 / 8** | 0 |
| **E13S7** | 3 / 17790 | **5 / 550** | **0 / 8** | 2×`[W,2C,2M]` |

No ext sites. No wall/rampart. No hub-ring.

- **E16S9** hub **37,31** `arterialN=11`. Sites `37,30 37,29 38,28 39,27 40,26 40,25 40,24 41,23` (hub→ctrl 42,22). 3 swamp 1500. Tower site 39,31 1800/5000. B **0** (was 2 @4865770).
- **E13S7** hub **17,16** `arterialN=9`. Sites `18,16 20,16 21,16 22,16 23,16 24,15 16,16 15,16` (hub→ctrl 25,14 + spawn; 19,16 is tower 3945/5000). Roads still 0/300.

Sites **≤8**. Standing climb / 300e spend **not yet**.

## Ctrl contrast — E21S4

L3 p=18819 · **ext 10 / 800** (leak) · roads **27 / 15** · **6** builders. `e839fc8` dump.

Did: mongo + redis. Did **not**: push-race, seed, reset, SSH VPS.
