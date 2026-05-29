"""IPL scorecard reasoning benchmark built from public Cricsheet data."""

from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any

from bench_common.env_sdk.base import BaseEnv, StepResult

DATA_PATH = Path(__file__).with_name("data") / "ipl_matches.json"


def _load_dataset() -> dict[str, Any]:
    with DATA_PATH.open(encoding="utf-8") as data_file:
        return json.load(data_file)


DATASET = _load_dataset()
MATCHES: list[dict[str, Any]] = DATASET["matches"]


def _normalize_answer(value: Any) -> str:
    """Normalize concise text answers while preserving numeric meaning."""
    if isinstance(value, dict) and "answer" in value:
        value = value["answer"]

    text = str(value).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        parsed = None
    if isinstance(parsed, dict) and "answer" in parsed:
        text = str(parsed["answer"]).strip()

    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[^a-z0-9. ]", "", text)
    return text.strip()


def _numbers(text: str) -> list[str]:
    return re.findall(r"\d+(?:\.\d+)?", text)


def _answer_is_correct(action: Any, expected_answer: Any) -> tuple[bool, str, str]:
    expected = _normalize_answer(expected_answer)
    response = _normalize_answer(action)

    if response == expected:
        return True, response, expected

    expected_numbers = _numbers(expected)
    response_numbers = _numbers(response)
    if expected_numbers and response_numbers:
        # Numeric tasks often come back as prose ("They needed 119 runs").
        expected_words = [
            word
            for word in expected.split()
            if word not in {"by", "run", "runs", "wicket", "wickets"}
            and not word.replace(".", "", 1).isdigit()
            and len(word) > 2
        ]
        number_matches = expected_numbers == response_numbers
        unit_matches = all(unit not in expected or unit in response for unit in ("run", "runs", "wicket", "wickets"))
        word_matches = all(word in response for word in expected_words)
        if number_matches and unit_matches and word_matches:
            return True, response, expected
        if not expected_words and response_numbers[-len(expected_numbers) :] == expected_numbers:
            return True, response, expected

    if len(expected) >= 3 and expected in response:
        return True, response, expected

    return False, response, expected


def _victory_margin(match: dict[str, Any]) -> str:
    result_by = match.get("result_by", {})
    if not result_by:
        return "no margin"
    kind, amount = next(iter(result_by.items()))
    return f"{amount} {kind}"


def _match_high_scorer(match: dict[str, Any]) -> dict[str, Any]:
    batters = [
        batter
        for innings in match["innings"]
        for batter in innings.get("top_batters", [])
    ]
    return sorted(batters, key=lambda item: (-item["runs"], item["player"]))[0]


def _scorecard(match: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "team": innings["team"],
            "total_runs": innings["total_runs"],
            "wickets_lost": innings["wickets_lost"],
            "overs_batted": innings["overs_batted"],
            "over_runs": innings["over_runs"],
            "powerplay_runs": innings["powerplay_runs"],
            "death_overs_runs": innings["death_overs_runs"],
            "top_batters": innings["top_batters"],
            "best_bowling_figures": innings["best_bowling_figures"],
        }
        for innings in match["innings"]
    ]


def _build_task(match: dict[str, Any], task_type: str, rng: random.Random) -> dict[str, Any]:
    first, second = match["innings"][0], match["innings"][1]
    target = first["total_runs"] + 1
    innings = rng.choice(match["innings"])

    if task_type == "winner":
        question = "Which team won this IPL match?"
        answer = match["winner"]
    elif task_type == "margin":
        question = "What was the victory margin? Answer like '35 runs' or '7 wickets'."
        answer = _victory_margin(match)
    elif task_type == "player_of_match":
        question = "Who was named player of the match?"
        answer = ", ".join(match.get("player_of_match", []))
    elif task_type == "target":
        question = f"What target did {second['team']} need at the start of the chase?"
        answer = str(target)
    elif task_type == "powerplay":
        difference = first["powerplay_runs"] - second["powerplay_runs"]
        if difference == 0:
            answer = "tie"
        else:
            leader = first["team"] if difference > 0 else second["team"]
            answer = f"{leader} by {abs(difference)} runs"
        question = "Which team scored more runs in the first six overs, and by how many?"
    elif task_type == "death_overs":
        question = f"How many runs did {innings['team']} score from overs 16 through 20?"
        answer = str(innings["death_overs_runs"])
    elif task_type == "chase_after_10":
        chase_runs_after_10 = sum(second["over_runs"][:10])
        question = f"After 10 overs of the chase, how many runs did {second['team']} still need to win?"
        answer = str(max(target - chase_runs_after_10, 0))
    elif task_type == "highest_scorer":
        top = _match_high_scorer(match)
        question = "Which batter made the highest individual score in this match?"
        answer = top["player"]
    else:
        question = f"How many total runs did {innings['team']} score?"
        answer = str(innings["total_runs"])

    return {
        "question": question,
        "answer": answer,
        "task_type": task_type,
    }


class MyEnv(BaseEnv):
    def __init__(self) -> None:
        self._item: dict[str, Any] | None = None
        self._rng = random.Random()

    def reset(self, seed: int | None = None, **params: Any) -> dict[str, Any]:
        self._rng.seed(seed)
        match = self._rng.choice(MATCHES)
        task_type = self._rng.choice(
            [
                "winner",
                "margin",
                "player_of_match",
                "target",
                "powerplay",
                "death_overs",
                "chase_after_10",
                "highest_scorer",
                "innings_total",
            ]
        )
        task = _build_task(match, task_type, self._rng)
        self._item = {**task, "match_id": match["match_id"]}

        return {
            "source": DATASET["source"],
            "instructions": "Answer the question using the supplied IPL scorecard. Reply with only the requested value, or JSON like {\"answer\": \"...\"}.",
            "question": task["question"],
            "match": {
                "match_id": match["match_id"],
                "date": match["date"],
                "season": match["season"],
                "event": match["event"],
                "match_number": match.get("match_number"),
                "city": match.get("city"),
                "venue": match.get("venue"),
                "teams": match["teams"],
                "toss": match.get("toss", {}),
                "result": {
                    "winner": match["winner"],
                    "by": match.get("result_by", {}),
                    "player_of_match": match.get("player_of_match", []),
                },
                "scorecard": _scorecard(match),
            },
        }

    def step(self, action: Any) -> StepResult:
        if self._item is None:
            raise RuntimeError("Call reset() before step()")
        correct, response, expected = _answer_is_correct(action, self._item["answer"])
        return StepResult(
            observation={"result": "done"},
            reward=1.0 if correct else 0.0,
            terminated=True,
            truncated=False,
            info={
                "correct": str(correct),
                "expected_answer": str(self._item["answer"]),
                "normalized_expected": expected,
                "given_answer": response,
                "match_id": self._item["match_id"],
                "task_type": self._item["task_type"],
            },
        )
