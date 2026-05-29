const replayUrl = "./data/replay.json?v=learning-1.1.0";

const state = {
  data: null,
  episodes: [],
  selectedIndex: 0,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function asPercent(value) {
  const number = Number(value ?? 0);
  return `${Math.round(number * 100)}%`;
}

function traceEvents(episode) {
  return state.data?.traces?.[episode.id] ?? [];
}

function findTrace(episode, type, phase) {
  const events = traceEvents(episode);
  return events.find((event) => {
    if (event.event_type !== type) return false;
    if (!phase) return true;
    return event.payload?.phase === phase;
  });
}

function findLastTrace(episode, type) {
  return traceEvents(episode)
    .filter((event) => event.event_type === type)
    .at(-1);
}

function observationsForPhase(episode, phase) {
  return traceEvents(episode)
    .filter((event) => event.event_type === "observation")
    .map((event) => event.payload?.data)
    .filter((data) => data?.phase === phase);
}

function buildEpisodeModel(episode) {
  const lessons = observationsForPhase(episode, "lesson");
  const challenge = observationsForPhase(episode, "challenge").at(-1);
  const startObservation = findTrace(episode, "observation", "start");
  const modelCall = findLastTrace(episode, "model_call");
  const action = findLastTrace(episode, "action");
  const stepResult = findLastTrace(episode, "step_result");
  const observation = challenge ?? startObservation?.payload?.data ?? {};
  const info = stepResult?.payload?.info ?? episode.terminal_info ?? {};

  return {
    id: episode.id,
    seed: episode.seed,
    reward: Number(stepResult?.payload?.reward ?? episode.total_reward ?? 0),
    observation,
    lessons,
    question: observation.question ?? "Question unavailable",
    match: observation.match ?? {},
    reasoning: modelCall?.payload?.text ?? action?.payload?.action ?? "No model text exported.",
    action: action?.payload?.action ?? "",
    expected: info.expected_answer ?? "--",
    given: info.given_answer ?? "--",
    taskType: info.task_type ?? "unknown",
    correct: info.correct === "True" || info.correct === true,
  };
}

function renderMetrics() {
  const run = state.data.run ?? {};
  const episodes = state.episodes;
  const totalReward = episodes.reduce((sum, episode) => sum + episode.reward, 0);
  const avgReward = episodes.length ? totalReward / episodes.length : 0;
  const model = run.config?.agent_config?.model ?? "unknown model";

  $("averageReward").textContent = asPercent(run.scores?.average_reward ?? avgReward);
  $("runMeta").textContent = `${model} · ${episodes.length} episodes · vow ${state.data.binding_vow_version}`;

  const metricItems = [
    ["Run Status", run.status ?? "unknown"],
    ["Model", model],
    ["Episodes", episodes.length],
    ["Vow", state.data.binding_vow_version ?? "--"],
  ];

  $("metrics").innerHTML = metricItems
    .map(
      ([label, value]) => `
        <div class="metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join("");
}

function renderTabs() {
  $("episodeTabs").innerHTML = state.episodes
    .map(
      (episode, index) => `
        <button class="tab ${index === state.selectedIndex ? "active" : ""}" data-index="${index}">
          Seed ${escapeHtml(episode.seed)} · ${asPercent(episode.reward)}
        </button>
      `,
    )
    .join("");

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedIndex = Number(button.dataset.index);
      render();
    });
  });
}

function renderTeams(episode) {
  const scorecard = episode.match.scorecard ?? [];
  $("teams").innerHTML = scorecard
    .map(
      (innings) => `
        <div class="team-card">
          <span>${escapeHtml(innings.overs_batted)} overs</span>
          <strong>${escapeHtml(innings.team)}</strong>
          <span>${escapeHtml(innings.total_runs)}/${escapeHtml(innings.wickets_lost)}</span>
        </div>
      `,
    )
    .join("");
}

function renderScorecard(episode) {
  const scorecard = episode.match.scorecard ?? [];
  const lessonHtml = episode.lessons?.length
    ? `
      <div class="lessons">
        ${episode.lessons
          .map(
            (lesson, index) => `
              <div class="lesson">
                <span class="label">Solved Example ${index + 1}</span>
                <strong>${escapeHtml(lesson.question)}</strong>
                <p>${escapeHtml(lesson.solved_example?.worked_solution ?? "")}</p>
                <span class="score">Answer: ${escapeHtml(lesson.solved_example?.answer ?? "--")}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    `
    : "";

  const inningsHtml = scorecard
    .map((innings) => {
      const firstSix = (innings.over_runs ?? []).slice(0, 6).reduce((sum, runs) => sum + Number(runs), 0);
      const lastFive = (innings.over_runs ?? []).slice(15, 20).reduce((sum, runs) => sum + Number(runs), 0);
      const topBatters = (innings.top_batters ?? [])
        .slice(0, 3)
        .map((batter) => `<li><span>${escapeHtml(batter.player)}</span><strong>${escapeHtml(batter.runs)}</strong></li>`)
        .join("");
      const bowling = (innings.best_bowling_figures ?? [])
        .slice(0, 2)
        .map(
          (bowler) =>
            `<li><span>${escapeHtml(bowler.player)}</span><strong>${escapeHtml(bowler.wickets)}/${escapeHtml(bowler.runs_conceded)}</strong></li>`,
        )
        .join("");

      return `
        <div class="innings">
          <div class="innings-header">
            <strong>${escapeHtml(innings.team)}</strong>
            <span class="score">${escapeHtml(innings.total_runs)}/${escapeHtml(innings.wickets_lost)}</span>
          </div>
          <div class="mini-grid">
            <div class="mini-stat"><span>First 6 Overs</span><strong>${escapeHtml(firstSix)}</strong></div>
            <div class="mini-stat"><span>Overs 16-20</span><strong>${escapeHtml(lastFive)}</strong></div>
            <div class="mini-stat"><span>Overs</span><strong>${escapeHtml(innings.overs_batted)}</strong></div>
          </div>
          <div class="panel-title">Top Batters</div>
          <ul class="list">${topBatters}</ul>
          <div class="panel-title" style="margin-top: 12px;">Best Bowling</div>
          <ul class="list">${bowling}</ul>
        </div>
      `;
    })
    .join("");
  $("scorecard").innerHTML = lessonHtml + inningsHtml;
}

function renderEpisode() {
  const episode = state.episodes[state.selectedIndex];
  if (!episode) return;

  const teams = episode.match.teams ?? [];
  const venue = [episode.match.venue, episode.match.city].filter(Boolean).join(" · ");

  $("question").textContent = episode.question;
  $("rewardPill").textContent = `Reward ${episode.reward.toFixed(2)}`;
  $("expectedAnswer").textContent = episode.expected;
  $("givenAnswer").textContent = episode.given;
  $("reasoning").textContent = episode.reasoning;

  document.title = `${teams.join(" vs ") || "IPL"} · Showcase`;
  renderTeams(episode);
  renderScorecard(episode);

  const header = document.querySelector(".match-header .label");
  header.textContent = `${episode.taskType.replaceAll("_", " ")} · ${episode.match.date ?? "date unknown"} · ${venue}`;
}

function render() {
  renderMetrics();
  renderTabs();
  renderEpisode();
}

async function init() {
  const response = await fetch(replayUrl);
  if (!response.ok) {
    throw new Error(`Could not load ${replayUrl}`);
  }

  state.data = await response.json();
  state.episodes = (state.data.episodes ?? []).map(buildEpisodeModel);

  if (!state.episodes.length) {
    throw new Error("Replay contains no episodes.");
  }

  render();
}

init().catch((error) => {
  $("question").textContent = "Could not load replay data";
  $("reasoning").textContent = `${error.message}\n\nRun a local static server from the repository root:\npython3 -m http.server 8080\n\nThen open http://localhost:8080/showcase/`;
});
