import { readFileSync } from 'node:fs';

export const SCIENCE_TITLE = '儿童科学知识版';
export const SCIENCE_NOTE = '本期没有通过时效、来源和内容质量检查的新闻，改为三条经过核对的科学知识；这些是常青科普，不是新发现。';
export const SCIENCE_WINDOW = 135;
export function decideContentMode({ qualifiedCount, collectionSucceeded } = {}) {
  if (!Number.isSafeInteger(qualifiedCount) || qualifiedCount < 0) throw new Error('Invalid qualified news count');
  if (collectionSucceeded !== true) throw new Error('News collection did not succeed; science fallback forbidden');
  return qualifiedCount === 0 ? 'science' : 'news';
}
export function assertValidState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Malformed Peach state');
  for (const [key, value] of Object.entries(state)) {
    if ((key.startsWith('recent') || key === 'lastEncyclopediaIds' || key === 'lastNewsTitles')
      && (!Array.isArray(value) || value.some(v => typeof v !== 'string'))) throw new Error(`Malformed state history: ${key}`);
  }
  for(const key of ['lastSentDate','lastQuestionId','lastQuestion','lastAnswer','lastContentMode']) {
    if(state[key]!==undefined && typeof state[key]!=='string') throw new Error(`Malformed state field: ${key}`);
  }
  if (state.lastSentDate && (!/^\d{4}-\d{2}-\d{2}$/.test(state.lastSentDate) || new Date(state.lastSentDate).toISOString().slice(0,10)!==state.lastSentDate)) throw new Error('Malformed state date');
  if (state.lastContentMode && !['news','science'].includes(state.lastContentMode)) throw new Error('Malformed state content mode');
  return state;
}
export const factFingerprint = value => String(value || '').replace(/^百科小知识：/, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export function readScienceCatalog() {
  const catalog = JSON.parse(readFileSync(new URL('./peach-science-catalog.json', import.meta.url), 'utf8'));
  const errors = catalogIssues(catalog);
  if (errors.length) throw new Error(`Invalid science catalog: ${errors.join('; ')}`);
  return catalog;
}
export function catalogIssues(catalog) {
  if (!Array.isArray(catalog) || catalog.length < 150) return ['at least 150 reviewed concepts required'];
  const ids = new Set(), concepts = new Set(), texts = new Set(), errors = [];
  for (const item of catalog) {
    if (!item || !item.id || !item.conceptId || ids.has(item.id) || concepts.has(item.conceptId) || texts.has(factFingerprint(item.text))) errors.push('missing or duplicate science identity');
    const body = String(item?.text || '').replace(/^百科小知识：/, '');
    if (!item?.text?.startsWith('百科小知识：') || body.length < 22 || body.length > 90 || !/[，。]/.test(body)) errors.push(`invalid science text: ${item?.id}`);
    if (!Array.isArray(item?.tags) || item.tags.length < 2 || new Set(item.tags).size !== item.tags.length) errors.push('invalid science tags');
    if (!item?.publisher || !/^https:\/\/(?:science\.nasa\.gov|oceanservice\.noaa\.gov|www\.usgs\.gov|volcanoes\.usgs\.gov)\//.test(item.link || '') || !/^\d{4}-\d{2}-\d{2}$/.test(item.verifiedAt || '')) errors.push('missing trusted source provenance');
    if (!Array.isArray(item?.legacyIds) || !Array.isArray(item?.legacyConceptTerms)) errors.push('missing legacy semantic mapping');
    ids.add(item?.id); concepts.add(item?.conceptId); texts.add(factFingerprint(item?.text));
  }
  return errors;
}
export function recentScienceConcepts(state, catalog, legacyPool = []) {
  assertValidState(state);
  const ids = new Set([...(state.recentEncyclopediaIds || []).slice(-SCIENCE_WINDOW), ...(state.lastEncyclopediaIds || [])]);
  const historyTexts = (state.recentEncyclopediaTexts || []).slice(-SCIENCE_WINDOW).map(factFingerprint);
  const legacyTexts = legacyPool.filter(item => ids.has(item.id)).map(item => factFingerprint(item.text));
  const recent = new Set((state.recentScienceConceptIds || []).slice(-SCIENCE_WINDOW));
  for (const item of catalog) {
    if (ids.has(item.id) || item.legacyIds.some(id => ids.has(id)) || [...historyTexts, ...legacyTexts].some(text =>
      text === factFingerprint(item.text) || item.legacyConceptTerms.some(term => text.includes(factFingerprint(term))))) recent.add(item.conceptId);
  }
  return recent;
}
// A legacy museum entry can teach several concepts now represented by separate
// reviewed science entries. Use the same mapping in both selection directions.
export function scienceConceptsForKnowledge(item, catalog = readScienceCatalog()) {
  const exact = catalog.find(entry => entry.id === item.id);
  if (exact) return [exact.conceptId];
  const text = factFingerprint(item.text);
  return catalog.filter(entry => entry.legacyIds.includes(item.id)
    || entry.legacyConceptTerms.some(term => text.includes(factFingerprint(term))))
    .map(entry => entry.conceptId);
}
export function selectScienceKnowledge(dayIndex, state = {}, legacyPool = [], catalog = readScienceCatalog()) {
  const errors = catalogIssues(catalog);
  if (errors.length) throw new Error(errors.join('; '));
  const recent = recentScienceConcepts(state, catalog, legacyPool);
  const rotated = [...catalog.slice(dayIndex % catalog.length), ...catalog.slice(0, dayIndex % catalog.length)];
  // Give large topic inventories their daily slot before smaller groups. A
  // greedy scan can strand all remaining facts in one topic after 40 issues.
  const available = new Map();
  for (const item of rotated) {
    if (recent.has(item.conceptId)) continue;
    const group = available.get(item.tags[0]) || [];
    group.push(item); available.set(item.tags[0],group);
  }
  const selected=[...available.values()].sort((a,b)=>b.length-a.length).slice(0,3).map(group=>({...group[0]}));
  if(selected.length===3) return selected;
  throw new Error('Science pool exhausted within the unchanged 45-issue exclusion window');
}
export function scienceIssueIssues(issue, catalog = readScienceCatalog(), legacyPool = []) {
  const errors = [], entries = issue.knowledgeItems;
  if (issue.contentMode !== 'science' || !Array.isArray(issue.newsItems) || issue.newsItems.length) errors.push('Science issue must have zero news');
  const evidence = issue.selectionEvidence;
  if (!evidence || evidence.qualifiedCount !== 0 || evidence.collectionSucceeded !== true || !Array.isArray(evidence.qualified) || evidence.qualified.length
    || !Array.isArray(evidence.candidates) || !Array.isArray(evidence.rejected) || evidence.candidates.length !== evidence.rejected.length
    || !(evidence.feeds || []).some(feed => feed.status === 'success')) errors.push('Science issue lacks verified zero-news selection evidence');
  if (!Array.isArray(entries) || entries.length !== 3) return [...errors, 'Science issue must contain exactly three facts'];
  const trusted = new Map(catalog.map(item => [item.id, item]));
  const recent = recentScienceConcepts(issue.previousState || {}, catalog, legacyPool);
  const seen = new Set(), topics = new Set();
  for (const item of entries) {
    const original = trusted.get(item.id);
    if (!original || ['id','conceptId','text','publisher','link','verifiedAt','tags','legacyIds','legacyConceptTerms'].some(key => JSON.stringify(item[key]) !== JSON.stringify(original[key]))) errors.push(`Unknown or forged science fact: ${item.id}`);
    if (seen.has(item.conceptId) || recent.has(item.conceptId)) errors.push(`Repeated science concept: ${item.conceptId}`);
    if (topics.has(item.tags?.[0])) errors.push('Science primary topics must differ');
    seen.add(item.conceptId); topics.add(item.tags?.[0]);
  }
  return errors;
}
