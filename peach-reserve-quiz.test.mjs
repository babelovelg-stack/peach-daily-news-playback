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
test('400 consecutive dates with real October 23 state keep the 14-concept and long-text exclusions', () => {
  let state=JSON.parse(fs.readFileSync(new URL('./peach-news-state.json',import.meta.url)));
  const start=Math.floor(Date.parse('2026-10-24T10:00:00Z')/86400000);
  const selected=[];
  for(let day=start;day<start+400;day++){
    const q=selectDailyQuestion([],day,state);
    assert.deepEqual(validateQuestionQuality(q,state),[],q.id);
    const concept=questionConceptId(q);
    assert.ok(!selected.slice(-14).some(entry=>entry.concept===concept));
    state={...state,lastQuestion:q.q,lastQuestionId:q.id,lastAnswer:q.a,
      recentQuestionIds:mergeRecentIds(state.recentQuestionIds,[q.id],36),
      recentQuestionConceptIds:mergeRecentIds(state.recentQuestionConceptIds,[concept],90),
      recentQuestionTexts:mergeRecentIds(state.recentQuestionTexts,[textFingerprint(q.q)],365),
      recentQuestionTags:mergeRecentIds(state.recentQuestionTags,[q.tags[0]],16)};
    selected.push({concept,text:q.q});
  }
  assert.equal(selected.length,400);
  assert.equal(new Set(selected.map(q=>q.text)).size,400);
});
