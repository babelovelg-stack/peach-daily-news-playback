import test from 'node:test';import assert from 'node:assert/strict';
import {readableCourse,mailLesson} from './mail-package.mjs';
import {lessonFor} from './model.mjs';
test('mail retains complete learning instructions when all scripts and external images are blocked',()=>{
 for(const number of [7,8,14]){
  const lesson=lessonFor(number),mail=readableCourse(lesson);
  for(const body of [mail.text,mail.html]){
   for(const w of lesson.words)for(const field of ['word','meaning','hint','example','translation','missing'])assert.ok(body.includes(w[field]),`${number} ${field}`);
   assert.ok(body.includes(lesson.reading.grammar.explanation));
   for(const q of lesson.reading.questions){assert.ok(body.includes(q.prompt));for(const o of q.options)assert.ok(body.includes(o));assert.ok(body.includes(q.explanation));}
  }
  assert.ok(mail.html.includes('cid:peach-word-atlas'));assert.ok(!/<script|<iframe|<button|onclick=|src="https?:/i.test(mail.html));
  assert.ok(mail.html.indexOf('先完成，再核对')>mail.html.indexOf('读后回答'));
 }
});
test('audio packaging refuses incomplete published media instead of sending silent attachments',()=>{
 assert.throws(()=>mailLesson('<html>no payload</html>'),/Missing/);
 assert.throws(()=>mailLesson('<script>const LESSON={"words":[{}],"atlas":"x"};</script>'),/Missing/);
});
