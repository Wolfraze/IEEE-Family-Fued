function validQuestions(value) {
  return Array.isArray(value) && value.length > 0 && value.length <= 100
    && value.every((question) =>
      question && typeof question.question === "string" && question.question.trim() && question.question.length <= 500
      && (question.multiplier === undefined || [1, 2, 3].includes(question.multiplier))
      && Array.isArray(question.answers) && question.answers.length > 0 && question.answers.length <= 20
      && question.answers.every((answer) =>
        answer && typeof answer.answer === "string" && answer.answer.trim() && answer.answer.length <= 200
        && Number.isFinite(answer.points) && answer.points >= 0
        && (answer.aliases === undefined || (Array.isArray(answer.aliases) && answer.aliases.length <= 30 && answer.aliases.every((alias) => typeof alias === "string" && alias.length <= 200)))
      )
    );
}

module.exports = { validQuestions };
