# IPL Scorecard Reasoning Showcase

This folder contains a static showcase UI for the IPL Scorecard Reasoning environment. It replays an exported Mesocosm run from `data/replay.json`, including the scorecard context, model reasoning, parsed answer, expected answer, and scalar reward.

## Preview Locally

From the repository root:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/showcase/
```

## GitHub Pages

Once the Pages workflow has deployed, the public showcase is available at:

```text
https://navneethd8.github.io/ipl-scorecard-reasoning-env/
```

## Refresh Replay Data

```bash
mesocosm run export RUN_ID -o showcase/data/replay.json
```

The current replay is from 15-episode run `3266aeb0-947f-40bd-a200-44cf2029493e` using binding vow `1.0.1`. It includes 11 full-credit and 4 partial-credit episodes so the showcase demonstrates the scalar reward behavior.
