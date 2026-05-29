const replayUrl = "./data/replay.json?v=learning-1.1.0";

const state = {
  data: null,
  episodes: [],
  selectedIndex: 0,
  chatScrollTimers: [],
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

function eventForStep(episode, type, step) {
  return traceEvents(episode).find((event) => event.event_type === type && event.step === step);
}

function buildChatMessages(episode) {
  const beforeAgent = traceEvents(episode).filter(
    (event) => event.event_type === "observation" && event.payload?.phase === "before_agent",
  );
  const messages = [];

  beforeAgent.forEach((event) => {
    const step = event.step;
    const data = event.payload?.data ?? {};
    const modelCall = eventForStep(episode, "model_call", step);
    const result = eventForStep(episode, "step_result", step);
    const resultPayload = result?.payload ?? {};
    const phase = data.phase ?? "step";
    const stepLabel = phase === "challenge" ? "Challenge" : `Lesson ${data.episode_step ?? step}`;

    messages.push({
      role: "env",
      label: `${stepLabel} · Environment`,
      text: data.question ?? "Question unavailable",
      meta: `${(data.task_type ?? "pattern").replaceAll("_", " ")} · seed ${data.seed ?? episode.seed}`,
    });

    if (data.solved_example) {
      messages.push({
        role: "coach",
        label: "Solved Example",
        text: `${data.solved_example.worked_solution}\n\nAnswer: ${data.solved_example.answer}`,
        meta: "Training signal",
      });
    }

    messages.push({
      role: "thinking",
      label: "Model Thinking",
      text: "",
      meta: "Reading scorecard and applying the learned rule",
    });

    messages.push({
      role: "model",
      label: "Gemini Output",
      text: modelCall?.payload?.text ?? "No model output exported.",
      meta: modelCall?.payload?.model ?? "model",
    });

    messages.push({
      role: resultPayload.terminated ? "reward" : "continue",
      label: resultPayload.terminated ? "Final Reward" : "Environment Feedback",
      text: resultPayload.terminated
        ? `Reward ${Number(resultPayload.reward ?? 0).toFixed(2)} · Expected: ${resultPayload.info?.expected_answer ?? "--"}`
        : "Lesson acknowledged. Continue to the next example.",
      meta: resultPayload.terminated ? "Challenge graded" : "No reward on lesson turns",
    });
  });

  return messages;
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
    chatMessages: buildChatMessages(episode),
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

function clearChatScrollTimers() {
  state.chatScrollTimers.forEach((timer) => window.clearTimeout(timer));
  state.chatScrollTimers = [];
}

function scrollChatToBottom(behavior = "smooth") {
  const chatWindow = $("chatWindow");
  chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior });
}

function renderMetrics() {
  const run = state.data.run ?? {};
  const episodes = state.episodes;
  const totalReward = episodes.reduce((sum, episode) => sum + episode.reward, 0);
  const avgReward = episodes.length ? totalReward / episodes.length : 0;
  const model = run.config?.agent_config?.model ?? "unknown model";
  const fullCredit = episodes.filter((episode) => episode.reward >= 1).length;
  const partialCredit = episodes.filter((episode) => episode.reward > 0 && episode.reward < 1).length;

  $("averageReward").textContent = asPercent(run.scores?.average_reward ?? avgReward);
  $("runMeta").textContent = `${model} · ${episodes.length} episodes · vow ${state.data.binding_vow_version}`;

  if ($("runIdPill")) $("runIdPill").textContent = run.id ?? "--";
  if ($("fullCreditCount")) $("fullCreditCount").textContent = `${fullCredit}/${episodes.length}`;
  if ($("partialCreditCount")) $("partialCreditCount").textContent = `${partialCredit}/${episodes.length}`;

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

function renderChat(episode) {
  clearChatScrollTimers();
  const messages = episode.chatMessages?.length
    ? episode.chatMessages
    : [{ role: "env", label: "Replay", text: episode.reasoning, meta: "Fallback transcript" }];

  const chatWindow = $("chatWindow");
  chatWindow.innerHTML = messages
    .map((message, index) => {
      const delay = `${(index * 0.55).toFixed(2)}s`;
      const content =
        message.role === "thinking"
          ? `<span class="typing-dots"><i></i><i></i><i></i></span>`
          : escapeHtml(message.text);
      return `
        <div class="chat-message ${escapeHtml(message.role)}-message" style="--delay: ${delay}">
          <div class="chat-meta">
            <span>${escapeHtml(message.label)}</span>
            <small>${escapeHtml(message.meta ?? "")}</small>
          </div>
          <div class="chat-bubble">${content}</div>
        </div>
      `;
    })
    .join("");

  chatWindow.scrollTo({ top: 0, behavior: "instant" });
  messages.forEach((_, index) => {
    const timer = window.setTimeout(() => scrollChatToBottom(), index * 550 + 520);
    state.chatScrollTimers.push(timer);
  });
}

function renderChatIntro(episode) {
  clearChatScrollTimers();
  const steps = episode.chatMessages?.filter((message) => message.role === "env").length || 3;
  $("chatWindow").innerHTML = `
    <div class="chat-start-card">
      <div class="play-icon">▶</div>
      <div>
        <span class="label">Ready to replay</span>
        <strong>Play the full ${steps}-step agent conversation</strong>
        <p>Questions, solved examples, model thinking, model output, and reward feedback will appear in sequence.</p>
      </div>
    </div>
  `;
  $("replayChatButton").textContent = "Play Animation";
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

  document.title = `${teams.join(" vs ") || "IPL"} · Showcase`;
  renderTeams(episode);
  renderScorecard(episode);
  renderChatIntro(episode);

  const header = document.querySelector(".match-header .label");
  header.textContent = `${episode.taskType.replaceAll("_", " ")} · ${episode.match.date ?? "date unknown"} · ${venue}`;
}

function render() {
  renderMetrics();
  renderTabs();
  renderEpisode();
}

function replayChat() {
  const episode = state.episodes[state.selectedIndex];
  if (!episode) return;
  $("replayChatButton").textContent = "Replay Animation";
  renderChat(episode);
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
  $("replayChatButton")?.addEventListener("click", replayChat);
}

init().catch((error) => {
  $("question").textContent = "Could not load replay data";
  $("chatWindow").innerHTML = `<div class="chat-message env-message">${escapeHtml(
    `${error.message}\n\nRun a local static server from the repository root:\npython3 -m http.server 8080\n\nThen open http://localhost:8080/showcase/`,
  )}</div>`;
});
