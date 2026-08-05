export function remapQuizAnswerOptionLetters(answerText, oldToNewLetters) {
  return String(answerText || "").replace(/\b([A-C])\b/g, (match, letter) => oldToNewLetters[letter] || match);
}
