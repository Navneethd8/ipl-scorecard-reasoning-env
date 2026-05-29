# IPL Scorecard Reasoning

Mesocosm / BenchAnything environment that evaluates whether an agent can learn IPL scorecard calculation patterns from solved examples and apply them to a held-out match.

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

Each episode now has three turns: two solved lesson examples, then one challenge scorecard with answer-leaking result fields removed. The task families cover winner/margin inference, chase requirements, powerplay comparisons, and death-over totals.
