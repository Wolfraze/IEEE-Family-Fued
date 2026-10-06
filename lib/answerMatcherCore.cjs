const singularize = (word) => {
  if (word.length <= 3) return word;
  if (/(?:sses|xes|zes|ches|shes|ses)$/.test(word)) return word.slice(0, -2);
  if (/ies$/i.test(word) && word.length > 4) return word.slice(0, -3) + "y";
  if (/s$/i.test(word) && !/ss$/i.test(word) && !/^(?:this|gas|bus|us|yes|plus|news|boss)$/.test(word)) return word.slice(0, -1);
  return word;
};

const key = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(singularize)
    .join(" ");

function match(text, answers) {
  const normalized = key(text);
  if (!normalized) return -1;
  return answers.findIndex((answer) =>
    [answer.answer, ...(answer.aliases || [])].some((alias) => key(alias) === normalized)
  );
}

module.exports = { key, match };
