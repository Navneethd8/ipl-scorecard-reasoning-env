"""IPL scorecard reasoning benchmark built from public Cricsheet data."""

from __future__ import annotations

import json
import os
import random
import re
from pathlib import Path
from typing import Any

from bench_common.env_sdk.base import BaseEnv, StepResult

DATA_PATH = Path(__file__).with_name("data") / "ipl_matches.json"
DEFAULT_LOCAL_SEED = 4
LOCAL_SEED_ENV = "IPL_SCORECARD_LOCAL_SEED"


def _load_dataset() -> dict[str, Any]:
    with DATA_PATH.open(encoding="utf-8") as data_file:
        return json.load(data_file)


DATASET = _load_dataset()
MATCHES: list[dict[str, Any]] = DATASET["matches"]


def _coerce_seed(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _resolve_seed(seed: int | None, params: dict[str, Any]) -> int:
    """Prefer platform seed, then local overrides, then a curated local seed."""
    for value in (
        seed,
        params.get("local_seed"),
        params.get("showcase_seed"),
        os.environ.get(LOCAL_SEED_ENV),
        DEFAULT_LOCAL_SEED,
    ):
        coerced = _coerce_seed(value)
        if coerced is not None:
            return coerced
    return DEFAULT_LOCAL_SEED


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


def _important_words(text: str) -> list[str]:
    return [
        word
        for word in text.split()
        if word not in {"by", "run", "runs", "wicket", "wickets", "the", "and"}
        and not word.replace(".", "", 1).isdigit()
        and len(word) > 2
    ]


def _answer_score(action: Any, expected_answer: Any) -> tuple[float, str, str]:
    expected = _normalize_answer(expected_answer)
    response = _normalize_answer(action)

    if response == expected:
        return 1.0, response, expected

    expected_numbers = _numbers(expected)
    response_numbers = _numbers(response)
    if expected_numbers and response_numbers:
        # Numeric tasks often come back as prose ("They needed 119 runs").
        expected_words = _important_words(expected)
        number_matches = expected_numbers == response_numbers
        unit_matches = all(unit not in expected or unit in response for unit in ("run", "runs", "wicket", "wickets"))
        word_matches = all(word in response for word in expected_words)
        if number_matches and unit_matches and word_matches:
            return 1.0, response, expected
        if not expected_words and response_numbers[-len(expected_numbers) :] == expected_numbers:
            return (1.0 if unit_matches else 0.6), response, expected
        if number_matches and word_matches:
            return 0.75, response, expected
        if number_matches:
            return 0.6, response, expected
        if response_numbers[-len(expected_numbers) :] == expected_numbers:
            return 0.5, response, expected

    if len(expected) >= 3 and expected in response:
        return 1.0, response, expected

    if any(unit in expected and unit in response for unit in ("run", "runs", "wicket", "wickets")):
        return 0.2, response, expected

    expected_words = _important_words(expected)
    if expected_words:
        matched_words = sum(1 for word in expected_words if word in response)
        if matched_words:
            return round(0.2 + 0.6 * (matched_words / len(expected_words)), 3), response, expected

    return 0.0, response, expected


def _raw_scorecard(match: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "team": innings["team"],
            "total_runs": innings["total_runs"],
            "wickets_lost": innings["wickets_lost"],
            "overs_batted": innings["overs_batted"],
            "over_runs": innings["over_runs"],
            "top_batters": innings["top_batters"],
            "best_bowling_figures": innings["best_bowling_figures"],
        }
        for innings in match["innings"]
    ]


def _match_observation(match: dict[str, Any]) -> dict[str, Any]:
    return {
        "match_id": match["match_id"],
        "date": match["date"],
        "season": match["season"],
        "event": match["event"],
        "match_number": match.get("match_number"),
        "city": match.get("city"),
        "venue": match.get("venue"),
        "teams": match["teams"],
        "toss": match.get("toss", {}),
        "scorecard": _raw_scorecard(match),
    }


def _powerplay_task(match: dict[str, Any], _: random.Random) -> dict[str, Any]:
    first, second = match["innings"][0], match["innings"][1]
    first_runs = sum(first["over_runs"][:6])
    second_runs = sum(second["over_runs"][:6])
    difference = first_runs - second_runs
    if difference == 0:
        answer = "tie"
        solution = f"{first['team']} and {second['team']} both made {first_runs} in overs 1-6."
    else:
        leader = first["team"] if difference > 0 else second["team"]
        answer = f"{leader} by {abs(difference)} runs"
        solution = (
            f"Sum overs 1-6 for each innings. {first['team']}: {first_runs}; "
            f"{second['team']}: {second_runs}. The difference is {abs(difference)}."
        )
    return {
        "question": "Using only the over-by-over runs, which team scored more in overs 1-6, and by how many?",
        "answer": answer,
        "task_type": "powerplay_pattern",
        "worked_solution": solution,
    }


def _death_overs_task(match: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    innings = rng.choice(match["innings"])
    runs = sum(innings["over_runs"][15:20])
    return {
        "question": f"Using only over-by-over runs, how many runs did {innings['team']} score in overs 16-20?",
        "answer": str(runs),
        "task_type": "death_overs_pattern",
        "worked_solution": (
            f"Overs 16-20 are entries 16 through 20 in over_runs. "
            f"For {innings['team']}, these sum to {runs}."
        ),
    }


def _chase_after_10_task(match: dict[str, Any], _: random.Random) -> dict[str, Any]:
    first, second = match["innings"][0], match["innings"][1]
    target = first["total_runs"] + 1
    chase_after_10 = sum(second["over_runs"][:10])
    answer = str(max(target - chase_after_10, 0))
    return {
        "question": f"After 10 overs of the chase, how many runs did {second['team']} still need to win?",
        "answer": answer,
        "task_type": "chase_requirement_pattern",
        "worked_solution": (
            f"The target is first-innings total plus one: {first['total_runs']} + 1 = {target}. "
            f"{second['team']} made {chase_after_10} in overs 1-10, so they needed {answer} more."
        ),
    }


def _winner_margin_task(match: dict[str, Any], _: random.Random) -> dict[str, Any]:
    first, second = match["innings"][0], match["innings"][1]
    if second["total_runs"] > first["total_runs"]:
        wickets = 10 - second["wickets_lost"]
        answer = f"{second['team']} by {wickets} wickets"
        solution = (
            f"{second['team']} chased {first['total_runs'] + 1} and finished on "
            f"{second['total_runs']}/{second['wickets_lost']}. Wickets remaining: 10 - "
            f"{second['wickets_lost']} = {wickets}."
        )
    else:
        runs = first["total_runs"] - second["total_runs"]
        answer = f"{first['team']} by {runs} runs"
        solution = (
            f"{first['team']} made {first['total_runs']} and {second['team']} made "
            f"{second['total_runs']}. The margin is {runs} runs."
        )
    return {
        "question": "Infer the winner and victory margin from the two innings scorecards.",
        "answer": answer,
        "task_type": "winner_margin_pattern",
        "worked_solution": solution,
    }


TASK_BUILDERS = {
    "powerplay_pattern": _powerplay_task,
    "death_overs_pattern": _death_overs_task,
    "chase_requirement_pattern": _chase_after_10_task,
    "winner_margin_pattern": _winner_margin_task,
}


class MyEnv(BaseEnv):
    def __init__(self) -> None:
        self._items: list[dict[str, Any]] = []
        self._step_index = 0
        self._seed: int | None = None
        self._rng = random.Random()

    def reset(self, seed: int | None = None, **params: Any) -> dict[str, Any]:
        effective_seed = _resolve_seed(seed, params)
        self._seed = effective_seed
        self._rng.seed(effective_seed)
        task_type = self._rng.choice(list(TASK_BUILDERS))
        matches = self._rng.sample(MATCHES, 3)
        builder = TASK_BUILDERS[task_type]
        self._items = []
        self._step_index = 0

        for index, match in enumerate(matches):
            task = builder(match, self._rng)
            phase = "challenge" if index == 2 else "lesson"
            self._items.append(
                {
                    **task,
                    "phase": phase,
                    "match": match,
                    "match_id": match["match_id"],
                    "lesson_number": index + 1 if phase == "lesson" else None,
                }
            )

        return self._observation(self._items[0])

    def _observation(self, item: dict[str, Any]) -> dict[str, Any]:
        observation = {
            "source": DATASET["source"],
            "seed": self._seed,
            "phase": item["phase"],
            "episode_step": self._step_index + 1,
            "max_steps": 3,
            "task_type": item["task_type"],
            "instructions": (
                "Learn the calculation pattern from the solved examples. "
                "For lesson turns, reply with a short acknowledgement. On the challenge turn, "
                "apply the same pattern and answer with the requested value or JSON like "
                "{\"answer\": \"...\"}."
            ),
            "question": item["question"],
            "match": _match_observation(item["match"]),
        }
        if item["phase"] == "lesson":
            observation["solved_example"] = {
                "lesson_number": item["lesson_number"],
                "answer": item["answer"],
                "worked_solution": item["worked_solution"],
            }
        return observation

    def step(self, action: Any) -> StepResult:
        if not self._items:
            raise RuntimeError("Call reset() before step()")
        item = self._items[self._step_index]

        if item["phase"] == "lesson":
            self._step_index += 1
            return StepResult(
                observation=self._observation(self._items[self._step_index]),
                reward=0.0,
                terminated=False,
                truncated=False,
                info={
                    "phase": "lesson",
                    "expected_answer": str(item["answer"]),
                    "message": "Solved example acknowledged; continue learning the pattern.",
                    "match_id": item["match_id"],
                    "task_type": item["task_type"],
                },
            )

        reward, response, expected = _answer_score(action, item["answer"])
        correct = reward >= 1.0
        return StepResult(
            observation={"result": "done"},
            reward=reward,
            terminated=True,
            truncated=False,
            info={
                "correct": str(correct),
                "partial_credit": str(reward),
                "expected_answer": str(item["answer"]),
                "normalized_expected": expected,
                "given_answer": response,
                "match_id": item["match_id"],
                "task_type": item["task_type"],
            },
        )
