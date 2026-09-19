# Protocol diagrams

Generated from `src/protocol/machines`. Do not edit by hand: change the machine data and run
`npm run diagrams`. Every edge below is a transition the engine can actually take, and every
NEXT edge is a button on screen.

### triage

Source: routing only, no medical instruction

```mermaid
stateDiagram-v2
    [*] --> triage_listening
    triage_listening: listening
    triage_listening --> cardiac_scene_check: "not breathing"
    triage_listening --> cardiac_scene_check: "no pulse"
    triage_listening --> cardiac_scene_check: "collapsed"
    triage_listening --> cardiac_scene_check: "heart attack"
    triage_listening --> cardiac_scene_check: "cardiac arrest"
    triage_listening --> cardiac_scene_check: "unconscious"
    triage_listening --> bleeding_scene_safety: "shot"
    triage_listening --> bleeding_scene_safety: "stabbed"
    triage_listening --> bleeding_scene_safety: "bleeding"
    triage_listening --> bleeding_scene_safety: "blood"
    triage_listening --> choking_confirm: "choking"
    triage_listening --> choking_confirm: "can't breathe"
    triage_listening --> cardiac_scene_check: NEXT
```

### cardiac

Source: https://cpr.heart.org/en/cpr-courses-and-kits/hands-only-cpr

```mermaid
stateDiagram-v2
    [*] --> cardiac_scene_check
    cardiac_scene_check: scene_check
    cardiac_scene_check --> cardiac_check_breathing: "no response"
    cardiac_scene_check --> cardiac_check_breathing: "not responding"
    cardiac_scene_check --> cardiac_check_breathing: NEXT
    cardiac_check_breathing: check_breathing
    cardiac_check_breathing --> cardiac_call_911: "not breathing"
    cardiac_check_breathing --> cardiac_call_911: "gasping"
    cardiac_check_breathing --> cardiac_call_911: "no pulse"
    cardiac_check_breathing --> cardiac_call_911: "no"
    cardiac_check_breathing --> cardiac_recovery_hold: "he's breathing"
    cardiac_check_breathing --> cardiac_recovery_hold: "she's breathing"
    cardiac_check_breathing --> cardiac_recovery_hold: "yes"
    cardiac_check_breathing --> cardiac_call_911: NEXT
    cardiac_call_911: call_911
    cardiac_call_911 --> cardiac_position: after 8s
    cardiac_call_911 --> cardiac_position: NEXT
    cardiac_position: position
    cardiac_position --> cardiac_compressions: Started compressions (measured)
    cardiac_position --> cardiac_compressions: NEXT
    cardiac_compressions: compressions (110 bpm)
    cardiac_compressions --> cardiac_handoff: "ambulance here"
    cardiac_compressions --> cardiac_handoff: "paramedics"
    cardiac_compressions --> cardiac_handoff: NEXT
    cardiac_recovery_hold: recovery_hold
    cardiac_recovery_hold --> cardiac_call_911: "not breathing"
    cardiac_recovery_hold --> cardiac_handoff: "ambulance here"
    cardiac_recovery_hold --> cardiac_handoff: NEXT
    cardiac_handoff: handoff
    cardiac_handoff --> [*]
```

### bleeding

Source: https://www.stopthebleed.org/

```mermaid
stateDiagram-v2
    [*] --> bleeding_scene_safety
    bleeding_scene_safety: scene_safety
    bleeding_scene_safety --> bleeding_call_911: "safe"
    bleeding_scene_safety --> bleeding_call_911: "he's gone"
    bleeding_scene_safety --> bleeding_call_911: NEXT
    bleeding_call_911: call_911
    bleeding_call_911 --> bleeding_find_wound: after 8s
    bleeding_call_911 --> bleeding_find_wound: NEXT
    bleeding_find_wound: find_wound
    bleeding_find_wound --> bleeding_pressure: NEXT
    bleeding_pressure: pressure
    bleeding_pressure --> bleeding_pack: "blood soaking through"
    bleeding_pressure --> bleeding_pack: "still bleeding"
    bleeding_pressure --> bleeding_handoff: "ambulance here"
    bleeding_pressure --> bleeding_pack: NEXT
    bleeding_pack: pack
    bleeding_pack --> bleeding_handoff: "ambulance here"
    bleeding_pack --> bleeding_handoff: NEXT
    bleeding_handoff: handoff
    bleeding_handoff --> [*]
```

### choking

Source: https://www.redcross.org/take-a-class/resources/learn-first-aid/adult-child-choking

```mermaid
stateDiagram-v2
    [*] --> choking_confirm
    choking_confirm: confirm
    choking_confirm --> choking_call_911: "can't breathe"
    choking_confirm --> choking_call_911: "no sound"
    choking_confirm --> choking_encourage_cough: "coughing"
    choking_confirm --> choking_call_911: NEXT
    choking_call_911: call_911
    choking_call_911 --> choking_back_blows: after 8s
    choking_call_911 --> choking_back_blows: NEXT
    choking_encourage_cough: encourage_cough
    choking_encourage_cough --> choking_call_911: "can't breathe"
    choking_encourage_cough --> choking_resolved: "it came out"
    choking_encourage_cough --> choking_call_911: NEXT
    choking_back_blows: back_blows
    choking_back_blows --> choking_abdominal_thrusts: "still choking"
    choking_back_blows --> choking_resolved: "it came out"
    choking_back_blows --> cardiac_position: "he passed out"
    choking_back_blows --> cardiac_position: "unconscious"
    choking_back_blows --> choking_abdominal_thrusts: NEXT
    choking_abdominal_thrusts: abdominal_thrusts
    choking_abdominal_thrusts --> choking_resolved: "it came out"
    choking_abdominal_thrusts --> cardiac_position: "he passed out"
    choking_abdominal_thrusts --> cardiac_position: "unconscious"
    choking_abdominal_thrusts --> choking_back_blows: NEXT
    choking_resolved: resolved
    choking_resolved --> cardiac_position: "not breathing"
    choking_resolved --> choking_handoff: "ambulance here"
    choking_resolved --> choking_handoff: NEXT
    choking_handoff: handoff
    choking_handoff --> [*]
```
