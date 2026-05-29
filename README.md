# IPL Scorecard Reasoning

Mesocosm / BenchAnything environment that evaluates whether an agent can answer deterministic cricket scorecard questions from real Indian Premier League data.

The environment uses compact scorecard summaries derived from Cricsheet's public IPL JSON download:

https://cricsheet.org/downloads/ipl_json.zip

## Local Run

```bash
python adapter.py
mesocosm run local --episodes 5
```

Each episode provides one IPL match scorecard and asks a factual or arithmetic question, such as winner, margin, chase target, powerplay comparison, death-overs runs, or remaining chase runs after 10 overs.
