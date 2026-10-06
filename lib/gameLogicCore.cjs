const { match } = require("./answerMatcherCore.cjs");

const initialState = () => ({
  teamA: "TEAM A", teamB: "TEAM B", scoreA: 0, scoreB: 0,
  q: -1, phase: "ready", revealed: [], strikes: 0, turn: "A",
  pot: 0, steal: false, awarded: [], awardHistory: [], event: null, hist: [],
  introId: 0,
});

const ev = (type, data = {}) => ({ id: Date.now() + Math.random(), type, ...data });
const other = (team) => (team === "A" ? "B" : "A");
const settle = (state, team) => ({ ...state, ["score" + team]: state["score" + team] + state.pot, pot: 0, steal: false });

function reveal(state, index, question) {
  const revealed = [...state.revealed];
  revealed[index] = true;
  const answer = question.answers[index];
  const points = answer.points * (question.multiplier || 1);
  const awarded = state.awarded || question.answers.map(() => null);
  return {
    ...state,
    revealed,
    awarded,
    pot: state.pot + points,
    steal: false,
    event: ev("correct", { rank: index + 1, answer: answer.answer, points }),
  };
}

function strike(state) {
  if (state.steal) return { ...state, turn: other(state.turn), steal: false, event: ev("strike", { count: 3 }) };
  const strikes = Math.min(3, state.strikes + 1);
  return { ...state, strikes, event: ev("strike", { count: strikes }) };
}

function awardAnswer(state, index, team, question) {
  if (!question || !["A", "B"].includes(team) || !state.revealed[index] || state.awarded?.[index]) return state;
  const answer = question.answers[index];
  const points = answer.points * (question.multiplier || 1);
  const awarded = [...(state.awarded || question.answers.map(() => null))];
  awarded[index] = team;
  const before = state["score" + team];
  return {
    ...state,
    ["score" + team]: before + points,
    pot: Math.max(0, state.pot - points),
    awarded,
    awardHistory: [...(state.awardHistory || []), { i: index, t: team, points }].slice(-40),
    event: ev("award", { rank: index + 1, answer: answer.answer, points, team, before, score: before + points }),
  };
}

function core(state, action, questions) {
  const question = questions[state.q];
  switch (action.type) {
    case "SELECT": {
      const index = Math.max(0, Math.min(questions.length - 1, action.i));
      return {
        ...state, q: index, phase: "play",
        revealed: questions[index].answers.map(() => false),
        awarded: questions[index].answers.map(() => null),
        awardHistory: [], strikes: 0, pot: 0, steal: false, event: ev("question"),
      };
    }
    case "GUESS": {
      if (!question || state.phase !== "play") return state;
      const index = match(action.text, question.answers);
      if (index < 0) return strike(state);
      return state.revealed[index] ? { ...state, event: ev("dup") } : reveal(state, index, question);
    }
    case "REVEAL": return question && !state.revealed[action.i] ? reveal(state, action.i, question) : state;
    case "AWARD_ANSWER": return awardAnswer(state, action.i, action.t, question);
    case "STRIKE": return strike(state);
    case "UNSTRIKE": return { ...state, strikes: Math.max(0, state.strikes - 1) };
    case "STEAL": return state.strikes >= 3 ? { ...state, steal: true, turn: other(state.turn), event: ev("steal") } : state;
    case "SWITCH": return { ...state, turn: other(state.turn) };
    case "ADJ": return { ...state, ["score" + action.t]: Math.max(0, state["score" + action.t] + action.d) };
    case "AWARD": {
      if (!question || !["A", "B"].includes(action.t)) return state;
      const pending = question.answers.map((_, index) => index).filter((index) => state.revealed[index] && !state.awarded?.[index]);
      if (!pending.length) return settle(state, action.t);
      let next = state;
      for (const index of pending) next = awardAnswer(next, index, action.t, question);
      return { ...next, pot: Math.max(0, next.pot) };
    }
    case "RESET_ROUND": return state.q < 0 ? state : core(state, { type: "SELECT", i: state.q }, questions);
    case "NEXT": return state.q >= questions.length - 1 ? core(state, { type: "END" }, questions) : core(state, { type: "SELECT", i: state.q + 1 }, questions);
    case "PREV": return core(state, { type: "SELECT", i: Math.max(0, state.q - 1) }, questions);
    case "END": return { ...state, phase: "final", event: ev("final") };
    default: return state;
  }
}

function reduce(state, action, questions) {
  if (action.type === "UNDO") {
    const history = [...state.hist];
    const previous = history.pop();
    return previous ? { ...previous, hist: history } : state;
  }
  if (action.type === "UNDO_LAST_AWARD") {
    const history = [...(state.awardHistory || [])];
    const last = history.pop();
    if (!last) return state;
    const awarded = [...(state.awarded || [])];
    awarded[last.i] = null;
    const { hist, ...snapshot } = state;
    return {
      ...state,
      ["score" + last.t]: Math.max(0, state["score" + last.t] - last.points),
      pot: state.pot + last.points,
      awarded,
      awardHistory: history,
      event: ev("awardUndo", { rank: last.i + 1, team: last.t, points: last.points }),
      hist: [...hist, snapshot].slice(-40),
    };
  }
  if (action.type === "RESTART") return { ...initialState(), teamA: state.teamA, teamB: state.teamB, introId: state.introId || 0 };
  const { hist, ...snapshot } = state;
  return { ...core(state, action, questions), hist: [...hist, snapshot].slice(-40) };
}

module.exports = { initialState, reduce };
