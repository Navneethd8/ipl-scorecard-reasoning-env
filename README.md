# IPL Scorecard Reasoning

Mesocosm / BenchAnything environment that evaluates whether an agent can answer deterministic cricket scorecard questions from real Indian Premier League data.

The environment uses compact scorecard summaries derived from Cricsheet's public IPL JSON download:

https://cricsheet.org/downloads/ipl_json.zip

## Showcase

The GitHub Pages showcase replays a 15-episode Mesocosm run:

https://navneethd8.github.io/ipl-scorecard-reasoning-env/

## Local Run

```bash
python adapter.py
mesocosm run local --episodes 5
```

Local resets use seed `4` when no seed is supplied, so manual adapter tests are reproducible. Override it with a scenario parameter (`local_seed` or `showcase_seed`) or:

```bash
IPL_SCORECARD_LOCAL_SEED=13 python adapter.py
```

Each episode provides one IPL match scorecard and asks a factual or arithmetic question, such as winner, margin, chase target, powerplay comparison, death-overs runs, or remaining chase runs after 10 overs.
