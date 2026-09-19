# 02 - Protocol state machines

## Rules for this file
- One machine per emergency. Every machine is pure data: an array of states with canonical instruction text, entry actions, transitions, and coaching rules. Sources cited per machine. If a step here disagrees with the cited guideline, the guideline wins; fix the data, never patch around it in code.
- Adding an emergency is adding a machine here and in /src/protocol/machines, with its guideline URL, a triage route into its first state, and a green run of the machine linter (docs/07 P2 task 5). The engine does not change. The hackathon ships triage, cardiac and bleeding, with choking as data only.
- Team member B owns verifying every line against the published guideline pages on Saturday and pasting source URLs into the comments. Nothing ships unverified.
- Canonical text is written to be SPOKEN. Short sentences. Imperative. No medical jargon.

## Engine semantics (/src/protocol/engine.ts, ~240 lines, with rule evaluation split into rules.ts; the original budget was ~120)
- A machine = `{ id, states: State[] }`. A State = `{ id, say: string[], metronome?: number, coachingRules?: Rule[], transitions: Transition[] }`.
- Transition triggers: `keyword(k)`, `timerMs(n)`, `fact(predicate)`, `manualAdvance` (big NEXT button, always available as fallback so a demo can never wedge).
- Coaching rules run every facts tick while in the state: `{ when: predicate, event: CoachingEvent, cooldownMs }`. Cooldown prevents nagging (default 6000ms per dedupeKey).
- Entering a state: log EventLogEntry, speak `say` lines in order at 'narration' priority, start/stop metronome per state config.

## MACHINE: triage (entry point for everything)
States:
1. `listening` say: ["Tell me what's happening. Say things like: he's not breathing, she's choking, he got shot."]
   - keywords -> 'not breathing'|'no pulse'|'collapsed'|'heart attack'|... => cardiac.scene_check
   - keywords -> 'shot'|'gunshot'|'stabbed'|'bleeding'|'blood'|... => bleeding.scene_safety
   - keywords -> 'choking'|'can't breathe'|'something stuck'|... => choking.confirm
   - The full vocabulary per route is data in src/protocol/phrases.ts (stemmed, word bounded, one letter of slack on long words; see src/protocol/language.ts). A sentence that matches nothing is scored against cue words and the app asks "It sounds like X. Say yes, or tap."; the route is entered only on yes, by a keyword. Camera gesture detection for choking stays out of scope.
   - manualAdvance buttons on screen for all three (voice must never be the only path).
2. Every downstream machine's FIRST OR SECOND state includes: "Call 911 now. Put it on speaker." + show CALL 911 button + start SITREP.

## MACHINE: cardiac (Hands-Only CPR, adult)
Source: AHA Hands-Only CPR guidance for untrained lay rescuers (verify at heart.org; cite exact page in code comment). Untrained bystanders: compressions only, no rescue breaths. This is deliberate and defensible; say it if asked.
States:
1. `scene_check` say: ["Make sure it's safe to approach.", "Tap his shoulders and shout: are you okay?"]
   - keyword 'no response'|manualAdvance => check_breathing
2. `check_breathing` say: ["Look at his chest. Is he breathing normally? Gasping does not count as breathing."]
   - keyword 'no'|'not breathing'|'gasping'|manualAdvance => call_911
   - keyword 'yes breathing' => recovery_hold (say: stay with him, keep watching his breathing, wait for EMS)
3. `call_911` say: ["Call 911 right now. Put the phone on speaker and lay it on the ground beside him."]
   - manualAdvance|timerMs(8000) => position
4. `position` say: ["Kneel beside his chest.", "Put the heel of one hand on the center of his chest, between the nipples.", "Put your other hand on top. Lace your fingers.", "Lock your elbows. Shoulders directly over your hands."]
   - fact(compressionActive)|manualAdvance => compressions
5. `compressions` metronome: 110. say: ["Push hard and fast, at least two inches deep.", "Follow my beat. Do not stop."]
   coachingRules:
   - when rate<100 && compressionActive => critical "Faster. Push with the beat." (dedupe 'rate-low')
   - when rate>125 => correction "A little slower. Match the beat." ('rate-high')
   - when recoilRatio<0.6 => correction "Let the chest come all the way back up between pushes." ('recoil')
   - when !compressionActive for 3000ms => critical "Don't stop. Keep pushing. Help is coming." ('stopped')
   - when poseConfidence<0.5 => system "I can't see you clearly. I'll keep coaching by voice. Keep pushing to the beat." + facts go null, metronome continues ('blind')
   - every 120000ms narration "You're doing it. Keep going. If someone else is there, switch now and keep the rhythm." ('swap')
   - transitions: keyword 'ambulance here'|'paramedics' => handoff
6. `handoff` say: ["Tell the paramedics: I'll show you the timeline on my screen."] -> SITREP report screen. End of machine.

## MACHINE: bleeding (severe bleeding / gunshot / stab)
Source: Stop the Bleed (stopthebleed.org) + ACS bleeding control basics. Verify and cite.
States:
1. `scene_safety` say: ["First: are YOU safe? If the danger is still there, do not approach. Move to safety and tell me when it's safe."]
   - keyword 'safe'|'he's gone'|manualAdvance => call_911   // NEVER skippable by timer. Scene safety has no timeout.
2. `call_911` say: ["Call 911 now. Speaker on, phone on the ground."]
   - manualAdvance|timerMs(8000) => find_wound
3. `find_wound` say: ["Find where the blood is coming from. Open or cut clothing so you can see the wound."]
   - manualAdvance => pressure   // episodic AI hook: on entry, ONE camera frame may go to vision API to list visible cloth/materials; result speaks as narration: "I can see a shirt on the ground. Grab it." Feature-flagged, off by default until API added.
4. `pressure` say: ["Take cloth if you have it. Press it hard onto the wound with both hands.", "Push down with your full body weight. It should be hard enough to hurt.", "Do not lift your hands to look. Do not stop."]
   coachingRules (THE closed loop for this machine):
   - when handsOffMs>1500 => critical "Don't let go! Hands back on the wound. Press harder." ('hands-off')
   - when handsOnRegion for 30000ms => narration "Good. Keep that pressure. You're slowing the bleeding." ('encourage', cooldown 45000)
   - when poseConfidence<0.5 => system blind-mode line, keep verbal coaching ('blind')
   - transitions: keyword 'blood soaking through'|'still bleeding' => pack ; keyword 'ambulance here' => handoff
5. `pack` say: ["Do not remove the soaked cloth. Add more cloth on top and keep pressing.", "If the wound is deep, push the cloth INTO the wound and keep pressure on it."]
   - keyword 'ambulance here' => handoff
6. `handoff` -> SITREP report screen with continuous-pressure time as the headline metric.
Note: tourniquets are mentioned ONLY if user says 'tourniquet': respond "If you have a real tourniquet kit, place it two to three inches above the wound, not on a joint, and tighten until the bleeding stops. Otherwise keep pressing." We do not coach improvised belt tourniquets.

## MACHINE: choking (ships as data, camera detection disabled)
Source: Red Cross conscious choking adult (the live adult/child choking page; the original URL is gone, DECISIONS Sat 02:00). Reached from triage by voice or button; no gesture detection this weekend.
States:
1. `confirm` say: ["Can he cough or speak? If he can cough, let him cough.", "If he cannot make a sound, tell me: he can't breathe."]
   - keyword 'can't breathe'|'no sound'|manualAdvance => call_911 ; keyword 'coughing' => encourage_cough
2. `call_911` say: ["Call 911 now. Put the phone on speaker and set it down where you can hear me."] + CALL 911 button
   - manualAdvance|timerMs(8000) => back_blows
3. `encourage_cough` say: ["Good. Keep him coughing. Do not hit his back while he can cough.", "Stay with him. If he stops making sound, tell me."]
   - keyword 'can't breathe'|manualAdvance => call_911 ; keyword 'it came out' => resolved
4. `back_blows` say: ["Stand behind him and lean him forward.", "Hit him five times between the shoulder blades with the heel of your hand."]
   - keyword 'still choking'|manualAdvance => abdominal_thrusts ; 'it came out' => resolved ; 'he passed out'|'unconscious' => cardiac.position
5. `abdominal_thrusts` say: ["Stand behind him. Make a fist just above his belly button.", "Grab your fist with your other hand. Pull hard, inward and upward, five times.", "If it does not come out, we go back to back blows."]
   - keyword 'it came out' => resolved ; 'he passed out'|'unconscious' => cardiac.position ; manualAdvance => back_blows
6. `resolved` say: ["Good. Stay with him until the ambulance arrives. Keep watching his breathing."]
   - keyword 'not breathing' => cardiac.position ; keyword 'ambulance here'|manualAdvance => handoff
7. `handoff` say: ["Tell the paramedics what happened and how long it took. It is on my screen."] End of machine.

## SITREP (built continuously from EventLog)
Fields: location (geolocation lat/lon + reverse-geocode later, raw coords fine for demo), emergency type, time of collapse/first interaction, CPR started at, average rate, pauses>10s count, continuous pressure time, current state. Render as read-aloud lines at top ("Say this to the dispatcher:") + timeline below. Handoff screen adds QR of the report JSON.
