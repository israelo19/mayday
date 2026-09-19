# 11 - Assessing the scene before choosing a protocol

Research note, Sat 08:00. The concern: triage jumps to a protocol on a keyword or a tap, and
the camera's only assessment is the person-down cue. The question: what exists, what the
phone can do tonight, and what stays honest under the five principles.

## What exists

**Video to dispatch works, and it changes decisions.** GoodSAM Instant-On-Scene streams a
bystander's camera to the call-taker. Across 838 real emergencies, video changed the
assessment of the patient in 51.1% of calls (12.9% more critical, 38.2% less), altered the
response in 27.5%, and improved care such as CPR or airway management in 28.4%; in 51 cardiac
arrests, video-guided CPR improved hand position, rate and depth, and 97.3% of callers said
live video should be standard ([BMC Emergency Medicine 2021](https://link.springer.com/article/10.1186/s12873-021-00493-5),
[Resuscitation 2021](https://www.resuscitationjournal.com/article/S0300-9572(21)00351-8/fulltext)).
A later study found pre-arrival CPR in 62% of video calls against 46% without
([PubMed](https://pubmed.ncbi.nlm.nih.gov/41479239/)). The lineage line for the pitch: the
eyes on the call are proven; Mayday puts them on the phone itself, with no human dispatcher
needed to interpret them.

**Compression rate from a phone camera is a solved measurement.** Meinich-Bache et al. did it
in 2018 with a region of interest plus an FFT over sliding windows: rate error 2.7 (±5.0) per
minute, within ±10 per minute 98% of the time, with feedback to caller and dispatcher
([J Healthcare Eng 2018](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6277120/)); Frisch et al.
measured rate from smartphone video in 2016 ([PubMed](https://pubmed.ncbi.nlm.nih.gov/27516194/)).
Our shoulder-y signal is the pose-landmark version of the same idea, so the claim on stage is
"a published measurement, done on-device with a pose model", not a novelty claim.

**Person-down from pose is a mature detector.** Fall and lying-down detection on MediaPipe
Pose is a whole subfield: landmark angles plus a small classifier or an LSTM, real time on
CPUs and phones ([IEEE 2022](https://ieeexplore.ieee.org/document/9929527/),
[arXiv 2503.01436](https://arxiv.org/pdf/2503.01436), [arXiv 2503.19501](https://arxiv.org/pdf/2503.19501),
[ElderFallGuard 2025](https://arxiv.org/pdf/2505.11845), [IJACSA 2025](https://thesai.org/Publications/ViewPaper?Volume=16&Issue=8&Code=ijacsa&SerialNo=11)).
Our `PersonDownDetector` (torso within 25 degrees of horizontal for 2 s, hips visible) is the
handcrafted end of that literature. The published systems add a stillness window and a
"fell, then did not get up" temporal rule; both are cheap on the landmarks we already have.

**VLMs on emergency scenes: promising, unvalidated for bystanders, and they hallucinate when
the picture is bad.** EgoEMS (AAAI 2026) is 20 hours of egocentric video over 233 simulated
EMS scenarios with 62 participants, annotated with keysteps, action quality, boxes and masks,
built for exactly the "AI cognitive assistant beside the responder" idea; it benchmarks
real-time keystep recognition and action quality ([arXiv 2511.09894](https://arxiv.org/abs/2511.09894)).
Open VLMs (Qwen 2.5 VL, Gemma 3, InternVL, Phi-4, Smol) have been benchmarked on emergency
and critical care diagnostics ([npj Digital Medicine 2025](https://www.nature.com/articles/s41746-025-01837-2)).
HorusEye (2026) shows what degraded imagery does: over 15,244 images across clean, fog, smoke
and thermal, grounding falls apart and BLIP-2 hallucinates more, while language feedback
recovers Gemini by 47.3% in thermal ([arXiv 2606.14741](https://arxiv.org/abs/2606.14741)). Text-only
triage by GPT-4 and Gemini reaches high accuracy on urgent cases in emergency departments
([PubMed 2024](https://pubmed.ncbi.nlm.nih.gov/38728938/), [PMC 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12403343/)).
Nothing found validates a VLM classifying a bystander's phone frame into an emergency type.
That is the gap Mayday's design already assumes: closed labels, a question, a human answer.

**What runs where.**
- Cloud: the Gemini API takes an inline base64 JPEG, returns structured JSON against a schema
  with enums, and can return bounding boxes as `box_2d` in `[ymin, xmin, ymax, xmax]` on a
  0 to 1000 scale ([image understanding](https://ai.google.dev/gemini-api/docs/image-understanding),
  [structured output](https://ai.google.dev/gemini-api/docs/structured-output)). Gemini is a
  sponsor opt-in (docs/04 item 7). One frame, one call, a second or two.
- On-device, in the browser: SmolVLM 256M and 500M run on WebGPU through Transformers.js
  ([HF blog](https://huggingface.co/blog/smolvlm), [example](https://github.com/huggingface/transformers.js-examples/tree/main/smolvlm-webgpu));
  MediaPipe's LLM Inference API runs Gemma 3n E2B and E4B with image input, WebGPU required
  ([MediaPipe](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js)).
  Both mean hundreds of megabytes to gigabytes on first load and seconds per frame on a phone,
  and WebGPU on iOS Safari is recent. Not for this weekend; the right shape for the product.
- On-device boxes: MediaPipe Object Detector (EfficientDet-Lite0) returns boxes with class and
  score per video frame ([MediaPipe](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js)),
  but its classes are everyday objects. It finds a person; it cannot tell a collapse from a nap.
  The semantics have to come from pose over time or from a VLM.

## What is honest to build, and in what order

The rule from docs/03 holds for every tier: a cue earns a question, never an instruction. The
engine never moves on the camera alone (principle 1); the assessment runs beside the
coaching loop and never blocks it (principle 3); when the picture is bad the app says so
(principle 4). The 3 s camera-first opening in triage is the slot all of this lives in.

1. **Show the assessment the app already makes (on-device, 2 to 3 hours).** Draw a box
   around each measured pose on the camera with a label: lying or upright, still for N s or
   moving, and the count of people in view. The eyes chip reads it out ("2 people, one lying
   still 3 s"). Add the stillness window and the "did not get up" rule from the fall-detection
   literature to `PersonDownDetector`. Nothing new leaves the device; the judge sees the eyes
   reasoning before any button is offered.
2. **One frame to a VLM for the unclear case (cloud, sponsor, 3 to 4 hours).** docs/04
   item 7 as written: `EmergencyClassifier` in `src/ai`, `captureFrame()` at the end of the
   look phase, Gemini through the key proxy, a JSON schema with the enum
   `collapsed | bleeding | choking | unclear`, one scene sentence, visible cloth for the
   bleeding case, and the patient's `box_2d` to draw. The label picks a pre-written confirm
   line and highlights a button; yes routes by the keyword triage already accepts; 3 s
   timeout; on any miss, nothing happens. Behind a flag, off by default, and the launch line
   says a frame leaves the phone when it is on. Fallback is tier 1.
3. **Hands at throat in triage** once hand tracking has a phone fps number (docs/03 roadmap).
4. **On-device VLM** (SmolVLM or Gemma 3n) as the post-hackathon replacement for tier 2, so
   the cognition is local too.

Never: blood-pixel detection, depth in centimetres from one camera, any label that reads as a
diagnosis (docs/03). The literature above is why: pose is robust, pixels lie, and a VLM under a
bad picture invents.
