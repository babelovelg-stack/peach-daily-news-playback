import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReserveQuestions } from './peach-reserve-quiz.mjs';
import fs from 'node:fs';
import { validateQuestionQuality, quizQualityPenalty, hasHighQualityReasoning, selectDailyQuestion, questionConceptId, mergeRecentIds, textFingerprint } from './peach-daily-news.mjs';
test('at least 24 distinct reviewed reasoning families', () => {
  const pool = buildReserveQuestions(20750);
  assert.ok(pool.length >= 24);
  assert.equal(new Set(pool.map(q => q.conceptId)).size, pool.length);
  assert.ok(pool.every(q => q.q.includes('模拟数据')));
});
test('every reserve family passes unchanged real quality checks and independent arithmetic', () => {
  const formulas = {
    'arithmetic-mean': (a,b) => [a,a+b,a+2*b].reduce((x,y)=>x+y)/3,
    'median-order': (a,b) => [a+2*b,a,a+b].sort((x,y)=>x-y)[1],
    'range-spread': (a,b) => (a+3*b)-a,
    'weighted-count': (a,b) => (a-2)*b+2*(b+3),
    'unit-price': (a,b) => ((a+2)*(b+1))/(b+1)-(a*b)/b,
    'rectangle-perimeter': (a,b) => (a+b)+b+(a+b)+b,
    'area-removal': (a,b) => (a+b)*b-b,
    'interval-count': (a,b) => Math.floor(a*b/b)+1,
    'set-overlap': (a,b) => (a+b)+(a+2*b)-b,
    'parallel-work': (a,b) => a*b+b*b,
    'ceiling-capacity': (a,b) => Math.ceil((a*b+1)/b),
    'fraction-remaining': (a,b) => 4*a-(4*a)/4-b,
    'difference-in-growth': (a,b) => (a+2*b-a)-(a+2*b+1-(a+b)),
    'budget-constraint': (a,b) => Math.floor((a*b+b-1-(b-1))/b),
    'unit-conversion': (a,b) => a*100+b,
    'reverse-operation': (a,b) => (a+b)*3-b
  };
  for(let day=20750;day<21243;day++) for(const q of buildReserveQuestions(day)) {
    assert.deepEqual(validateQuestionQuality(q),[],q.id);
    assert.ok(quizQualityPenalty(q)>=0,q.id);
    assert.ok(hasHighQualityReasoning(q),q.id);
    const {kind,inputs:{a,b},value}=q.verification;
    if(formulas[kind]) assert.equal(value,formulas[kind](a,b),q.id);
    else assert.equal(q.verification.correctIndex,0);
  }
});
test('question text stays excluded for 365 subsequent selections, then may be reused', () => {
  const day=20755;
  const question=selectDailyQuestion([],day,{});
  const fingerprint=textFingerprint(question.q);
  let recentQuestionTexts=[fingerprint];
  for(let i=0;i<364;i++) {
    recentQuestionTexts=mergeRecentIds(recentQuestionTexts,[textFingerprint(`历史题面 ${i}`)],365);
  }
  assert.equal(recentQuestionTexts.length,365);
  assert.ok(recentQuestionTexts.includes(fingerprint));
  assert.notEqual(textFingerprint(selectDailyQuestion([],day,{recentQuestionTexts}).q),fingerprint);
  assert.ok(validateQuestionQuality(question,{recentQuestionTexts}).some(error=>error.includes('文本重复')));

  recentQuestionTexts=mergeRecentIds(recentQuestionTexts,[textFingerprint('历史题面 364')],365);
  assert.equal(recentQuestionTexts.length,365);
  assert.ok(!recentQuestionTexts.includes(fingerprint));
  assert.equal(textFingerprint(selectDailyQuestion([],day,{recentQuestionTexts}).q),fingerprint);
  assert.deepEqual(validateQuestionQuality(question,{recentQuestionTexts}),[]);
});

for(const scenario of ['empty history','current delivery history']) test(`400 consecutive dates preserve rolling exclusions from ${scenario}`, () => {
  let state=scenario==='empty history' ? {} : JSON.parse(fs.readFileSync(new URL('./peach-news-state.json',import.meta.url)));
  // Production state advances after every email. Never rewind that state to a
  // fixed historical date or require global uniqueness beyond its 365-text window.
  const start=Math.floor(Date.parse(`${state.lastSentDate || '2026-10-23'}T10:00:00Z`)/86400000)+1;
  assert.ok(Number.isSafeInteger(start));
  const selected=[];
  const recentTexts=(state.recentQuestionTexts || []).map(textFingerprint);
  const recentConcepts=[...(state.recentQuestionConceptIds || [])];
  for(let day=start;day<start+400;day++){
    const q=selectDailyQuestion([],day,state);
    assert.deepEqual(validateQuestionQuality(q,state),[],q.id);
    const concept=questionConceptId(q);
    const fingerprint=textFingerprint(q.q);
    // Independent history assertions also catch a regression shared by the
    // selector and validator; neither assertion relies on their internal sets.
    assert.ok(!recentConcepts.slice(-14).includes(concept),q.id);
    assert.ok(!recentTexts.slice(-365).includes(fingerprint),q.id);
    assert.notEqual(fingerprint,textFingerprint(state.lastQuestion || ''),q.id);
    state={...state,lastQuestion:q.q,lastQuestionId:q.id,lastAnswer:q.a,
      recentQuestionIds:mergeRecentIds(state.recentQuestionIds,[q.id],36),
      recentQuestionConceptIds:mergeRecentIds(state.recentQuestionConceptIds,[concept],90),
      recentQuestionTexts:mergeRecentIds(state.recentQuestionTexts,[fingerprint],365),
      recentQuestionTags:mergeRecentIds(state.recentQuestionTags,[q.tags[0]],16)};
    recentTexts.push(fingerprint);
    recentConcepts.push(concept);
    assert.deepEqual(state.recentQuestionTexts,recentTexts.slice(-365));
    selected.push({concept,text:q.q});
  }
  assert.equal(selected.length,400);
});
