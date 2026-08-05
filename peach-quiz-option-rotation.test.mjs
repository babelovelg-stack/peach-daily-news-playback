import test from "node:test";
import assert from "node:assert/strict";

import { remapQuizAnswerOptionLetters } from "./peach-quiz-option-rotation.mjs";

test("remaps the answer and every referenced option after rotating choices", () => {
  const answer = "答案：B。A 的会馆记录缺少海外贸易证据；C 能说明生产和海外传播，却缺少本地原料证据。";
  const mapping = { A: "B", B: "C", C: "A" };

  assert.equal(
    remapQuizAnswerOptionLetters(answer, mapping),
    "答案：C。B 的会馆记录缺少海外贸易证据；A 能说明生产和海外传播，却缺少本地原料证据。"
  );
});
