const assert = require("node:assert/strict");
const test = require("node:test");
const questions = require("../data/questions.json");
const { STORAGE_KEY, createQuestionQueue, POOLS } = require("../lib/questionQueue.cjs");

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function seededRandom() {
  let seed = 0x12345678;
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

test("five 16-question resets do not repeat before all 50 questions are shown", () => {
  const storage = memoryStorage();
  const sessionStorage = memoryStorage();
  const queue = createQuestionQueue({ storage, sessionStorage, random: seededRandom() });
  const poolQuestions = Array.from({ length: 50 }, (_, index) => ({
    id: `test-${index + 1}`,
    pool: "round1",
    question: `Question ${index + 1}`,
    answers: [{ answer: "Answer", points: 1 }],
  }));
  const shown = [];
  const unique = new Set();

  for (let reset = 0; reset < 5; reset++) {
    queue.reshuffleUnseen(poolQuestions);
    for (let pick = 0; pick < 16; pick++) {
      const id = queue.next(poolQuestions, "round1");
      assert.ok(id, `missing question at reset ${reset + 1}, pick ${pick + 1}`);
      if (unique.size < 50) {
        assert.equal(unique.has(id), false, `question ${id} repeated before the first 50 were shown`);
      }
      unique.add(id);
      shown.push(id);
    }
  }

  assert.equal(shown.length, 80);
  assert.equal(unique.size, 50);
  assert.ok(shown[50], "the next cycle should start after all 50 have been shown");
  const state = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(state.cycle, 1);
  assert.ok(state.pools.round1.unseen.slice(-10).every((id) => shown.slice(40, 50).includes(id)));
});

test("the configured question bank has stable IDs and the specified round pool sizes", () => {
  assert.equal(questions.length, 50);
  assert.equal(new Set(questions.map((question) => String(question.id))).size, 50);
  assert.deepEqual(Object.fromEntries(POOLS.map((pool) => [
    pool,
    questions.filter((question) => question.pool === pool).length,
  ])), { round1: 16, round2: 16, round3: 12, bonus: 6 });
});

test("a new cycle keeps the previous cycle's last ten in the global back half", () => {
  const storage = memoryStorage();
  const queue = createQuestionQueue({ storage, sessionStorage: memoryStorage(), random: seededRandom() });
  const shown = [];
  let currentPool = POOLS[0];

  for (let index = 0; index < 50; index++) {
    const id = queue.next(questions, currentPool);
    shown.push(id);
    currentPool = questions.find((question) => String(question.id) === id).pool;
  }
  queue.next(questions, currentPool);

  const state = JSON.parse(storage.getItem(STORAGE_KEY));
  const newCycleOrder = POOLS.flatMap((pool) => [
    ...state.pools[pool].seen.map((item) => item.id),
    ...state.pools[pool].unseen,
  ]);
  for (const id of shown.slice(-10)) {
    assert.ok(newCycleOrder.indexOf(id) >= 25, `recent question ${id} was not deferred to the back half`);
  }
});

test("seen order survives reset while added and removed IDs reconcile by ID", () => {
  const storage = memoryStorage();
  const queue = createQuestionQueue({ storage, sessionStorage: memoryStorage(), random: seededRandom() });
  queue.show(questions, questions[0].id);
  queue.show(questions, questions[1].id);
  const seenBefore = JSON.parse(storage.getItem(STORAGE_KEY)).pools.round1.seen.map((item) => item.id);

  queue.reshuffleUnseen(questions);
  const changedQuestions = [...questions.filter((question) => question.id !== questions[2].id), {
    id: "new-id",
    pool: "round1",
    question: "New question",
    answers: [{ answer: "New answer", points: 1 }],
  }];
  queue.next(changedQuestions, "round1");
  const state = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.deepEqual(state.pools.round1.seen.slice(0, 2).map((item) => item.id), seenBefore);
  assert.ok(state.pools.round1.unseen.includes("new-id"));
  assert.ok(!Object.values(state.pools).some((pool) =>
    [...pool.unseen, ...pool.seen.map((item) => item.id)].includes(String(questions[2].id))));
});

test("corrupt or unavailable browser storage does not stop question selection", () => {
  const brokenStorage = {
    getItem: () => "{corrupt",
    setItem: () => { throw new Error("storage unavailable"); },
    removeItem: () => { throw new Error("storage unavailable"); },
  };
  const queue = createQuestionQueue({
    storage: brokenStorage,
    sessionStorage: { getItem: () => null, setItem: () => {} },
    random: seededRandom(),
  });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.ok(queue.next(questions, "round1"));
    assert.doesNotThrow(() => queue.resetHistory());
    assert.ok(queue.next(questions, "round1"));
  } finally {
    console.warn = originalWarn;
  }
});
