const STORAGE_KEY = "feud_queue_v1";
const POOLS = ["round1", "round2", "round3", "bonus"];

let fallbackSessionId;

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function questionId(question) {
  return String(question.id);
}

function questionPool(question) {
  return POOLS.includes(question.pool) ? question.pool : "round1";
}

function questionGroups(questions) {
  const groups = Object.fromEntries(POOLS.map((pool) => [pool, []]));
  const ids = new Set();
  for (const question of questions) {
    if (question.id === undefined || question.id === null || String(question.id).trim() === "") {
      throw new Error("Every question in the question queue needs a stable id.");
    }
    const id = questionId(question);
    if (ids.has(id)) throw new Error(`Duplicate question id in question queue: ${id}`);
    ids.add(id);
    groups[questionPool(question)].push(id);
  }
  return groups;
}

function createQuestionQueue(options = {}) {
  const random = options.random || Math.random;
  const now = options.now || Date.now;
  const providedStorage = options.storage;
  const providedSessionStorage = options.sessionStorage;
  let memory = null;
  let storageWarningShown = false;

  function browserStorage(name) {
    if (name === "localStorage" && providedStorage !== undefined) return providedStorage;
    if (name === "sessionStorage" && providedSessionStorage !== undefined) return providedSessionStorage;
    try {
      return typeof window === "undefined" ? null : window[name];
    } catch (error) {
      warnStorage(error);
      return null;
    }
  }

  function warnStorage(error) {
    if (storageWarningShown) return;
    storageWarningShown = true;
    console.warn("Question history could not access browser storage; using an in-memory queue for this page.", error);
  }

  function sessionId() {
    const sessionStorage = browserStorage("sessionStorage");
    if (!sessionStorage) {
      fallbackSessionId ||= `session-${now()}-${Math.floor(random() * 1e9)}`;
      return fallbackSessionId;
    }
    try {
      let value = sessionStorage.getItem(`${STORAGE_KEY}:session`);
      if (!value) {
        value = `session-${now()}-${Math.floor(random() * 1e9)}`;
        sessionStorage.setItem(`${STORAGE_KEY}:session`, value);
      }
      return value;
    } catch (error) {
      warnStorage(error);
      fallbackSessionId ||= `session-${now()}-${Math.floor(random() * 1e9)}`;
      return fallbackSessionId;
    }
  }

  function emptyState(groups) {
    return {
      version: 1,
      pools: Object.fromEntries(POOLS.map((pool) => [
        pool,
        { unseen: shuffle(groups[pool], random), seen: [], protected: [] },
      ])),
      recentlyShown: [],
      cycle: 0,
    };
  }

  function validState(value) {
    if (!value || value.version !== 1 || !value.pools || typeof value.pools !== "object") return false;
    return POOLS.every((pool) => {
      const entry = value.pools[pool];
      return entry && Array.isArray(entry.unseen) && Array.isArray(entry.seen)
        && entry.seen.every((item) => item && typeof item.id === "string");
    });
  }

  function load(questions) {
    const groups = questionGroups(questions);
    let saved = memory;
    const storage = browserStorage("localStorage");
    if (storage) {
      try {
        const serialized = storage.getItem(STORAGE_KEY);
        saved = serialized ? JSON.parse(serialized) : null;
      } catch (error) {
        warnStorage(error);
        saved = memory;
      }
    }

    let state;
    if (!validState(saved)) {
      state = emptyState(groups);
    } else {
      const validIds = new Set(Object.values(groups).flat());
      const idPools = new Map(POOLS.flatMap((pool) => groups[pool].map((id) => [id, pool])));
      const pools = {};
      for (const pool of POOLS) {
        const source = saved.pools[pool];
        const seenIds = new Set();
        const seen = source.seen.filter((item) => idPools.get(item.id) === pool && !seenIds.has(item.id)
          && seenIds.add(item.id)).map((item) => ({ id: item.id, sessionId: item.sessionId || "" }));
        const seenSet = new Set(seen.map((item) => item.id));
        const unseenIds = new Set();
        const unseen = source.unseen.filter((id) => typeof id === "string" && idPools.get(id) === pool
          && !seenSet.has(id) && !unseenIds.has(id) && unseenIds.add(id));
        for (const id of groups[pool]) {
          if (!seenSet.has(id) && !unseenIds.has(id)) {
            unseen.push(id);
            unseenIds.add(id);
          }
        }
        const protectedIds = new Set(Array.isArray(source.protected) ? source.protected : []);
        pools[pool] = {
          unseen,
          seen,
          protected: unseen.filter((id) => protectedIds.has(id)),
        };
      }
      state = {
        version: 1,
        pools,
        recentlyShown: Array.isArray(saved.recentlyShown)
          ? saved.recentlyShown.filter((id) => validIds.has(id)).slice(-10)
          : [],
        cycle: Number.isInteger(saved.cycle) && saved.cycle >= 0 ? saved.cycle : 0,
      };
    }
    save(state);
    return { state, groups };
  }

  function save(state) {
    memory = state;
    const storage = browserStorage("localStorage");
    if (!storage) {
      warnStorage(new Error("localStorage is unavailable."));
      return;
    }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      warnStorage(error);
    }
  }

  function startNextCycle(state, groups) {
    const recent = new Set(state.recentlyShown);
    for (const pool of POOLS) {
      const shuffled = shuffle(groups[pool], random);
      const protectedIds = shuffled.filter((id) => recent.has(id));
      const regularIds = shuffled.filter((id) => !recent.has(id));
      state.pools[pool] = { unseen: [...regularIds, ...protectedIds], seen: [], protected: protectedIds };
    }
    state.recentlyShown = [];
    state.cycle += 1;
  }

  function moveToSeen(state, id, pool) {
    const entry = state.pools[pool];
    entry.unseen = entry.unseen.filter((candidate) => candidate !== id);
    entry.protected = entry.protected.filter((candidate) => candidate !== id);
    entry.seen = entry.seen.filter((item) => item.id !== id);
    entry.seen.push({ id, sessionId: sessionId(), shownAt: now() });
    state.recentlyShown = [...state.recentlyShown.filter((candidate) => candidate !== id), id].slice(-10);
  }

  function showSpecific(questions, id) {
    const { state, groups } = load(questions);
    const question = questions.find((item) => questionId(item) === String(id));
    if (!question || !groups[questionPool(question)].includes(String(id))) return false;
    moveToSeen(state, String(id), questionPool(question));
    save(state);
    return true;
  }

  return {
    next(questions, currentPool = POOLS[0]) {
      const { state, groups } = load(questions);
      const cycleComplete = POOLS.every((pool) => state.pools[pool].unseen.length === 0);
      if (cycleComplete) startNextCycle(state, groups);
      const start = cycleComplete ? 0 : Math.max(0, POOLS.indexOf(currentPool));
      const order = [...POOLS.slice(start), ...POOLS.slice(0, start)];
      const pool = order.find((candidate) => state.pools[candidate].unseen.length > 0);
      if (!pool) return null;
      const id = state.pools[pool].unseen[0];
      moveToSeen(state, id, pool);
      save(state);
      return id;
    },
    show: showSpecific,
    showIfUnseen(questions, id) {
      const { state } = load(questions);
      const normalizedId = String(id);
      if (POOLS.some((pool) => state.pools[pool].seen.some((item) => item.id === normalizedId))) return false;
      return showSpecific(questions, normalizedId);
    },
    reshuffleUnseen(questions) {
      const { state } = load(questions);
      for (const pool of POOLS) {
        const entry = state.pools[pool];
        const protectedIds = new Set(entry.protected);
        const shuffled = shuffle(entry.unseen, random);
        entry.unseen = [
          ...shuffled.filter((id) => !protectedIds.has(id)),
          ...shuffled.filter((id) => protectedIds.has(id)),
        ];
      }
      save(state);
    },
    resetHistory() {
      memory = null;
      const storage = browserStorage("localStorage");
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch (error) {
        warnStorage(error);
      }
    },
  };
}

module.exports = { STORAGE_KEY, POOLS, createQuestionQueue, shuffle };
