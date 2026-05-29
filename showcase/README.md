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

The current replay is from in-context learning run `cd943f9d-32f4-49ce-9cb0-8ff1e1c9e5ac` using binding vow `1.1.0`. Each episode shows two solved lesson turns followed by a held-out challenge.
