import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readScienceCatalog } from './peach-science-mode.mjs';
import { checkNewsSourceLinks } from './peach-news-self-check.mjs';

// Read-only inventory diagnostic. Reuse the delivery source check unchanged:
// two attempts per URL, the same GET/redirect rules and 12-second timeout.
export async function checkScienceCatalogSources({ fetchImpl = fetch } = {}) {
  const links = [...new Set(readScienceCatalog().map(item => item.link))];
  const errors = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, links.length) }, async () => {
    while (next < links.length) {
      const link = links[next++];
      const problems = await checkNewsSourceLinks({
        issues: [{ contentMode: 'science', knowledgeItems: [{ link }] }]
      }, { fetchImpl });
      errors.push(...problems);
    }
  }));
  if (errors.length) {
    throw new Error(`Science catalog source check failed: ${errors.length}/${links.length} URLs\n- ${errors.join('\n- ')}`);
  }
  return { checked: links.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await checkScienceCatalogSources();
  console.log(`Science catalog sources verified: ${result.checked}/${result.checked} URLs (read-only, concurrency <= 6).`);
}
