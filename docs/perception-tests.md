# Perception failure-mode matrix (P1)

Historical: this matrix was never filled in during the weekend. The conditions and thresholds
are still the ones to walk; the cells are empty because no run was recorded, not because the
runs passed.

Fill this in on the demo phone, propped where it will be on stage. One row per condition.
"Rate" is the eyes-screen number against a metronome at 110 on a pillow; "Blind" is whether
covering the lens produced the banner within 2 s; "Hands" is whether the wound region locked
and the lift-to-peek turned it red within 1.5 s. Write what you saw, not what you hoped.

| Condition | Rate at 110 | Blind < 2 s | Hands lock / peek | fps | Notes |
|---|---|---|---|---|---|
| Bright room, front, 1.5 m | | | | | |
| Bright room, side, 1.5 m | | | | | |
| Bright room, 45 degrees from the floor (phone propped) | | | | | |
| Dim room (lamp off) | | | | | |
| Backlit (window behind the rescuer) | | | | | |
| 1 m | | | | | |
| 2.5 m | | | | | |
| Dark clothing on a dark floor | | | | | |
| Light clothing | | | | | |
| Second person (the "patient") lying in frame | | | | | |
| Rescuer wearing a cap | | | | | |

Thresholds live in `src/perception/signal.ts` (prominence, refractory, spans, luminance) and
`src/perception/roi.ts` (stability, radius, grace). Record any change in DECISIONS.md.
