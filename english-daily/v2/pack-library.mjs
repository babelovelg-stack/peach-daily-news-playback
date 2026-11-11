// Input is a private, source-verified collection prepared from the user's book files.
import fs from 'node:fs';import path from 'node:path';import {ROOT,validateReading} from './model.mjs';import {PACKS} from './vocabulary.mjs';import {seal,requireKey} from './crypto.mjs';
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(!Array.isArray(input.books)||!Array.isArray(input.lessons)||!input.books.length)throw Error('Provide verified original book content');
input.books.forEach(b=>validateReading(b));
if(new Set(input.books.map(b=>b.id)).size!==input.books.length||new Set(input.lessons.map(l=>l.number)).size!==input.lessons.length)throw Error('Duplicate content IDs');
for(const l of input.lessons)if(!Number.isInteger(l.number)||l.number<2||!PACKS[l.packId]||!input.books.some(b=>b.id===l.readingId))throw Error('Invalid lesson binding');
const key=requireKey(process.env.ENGLISH_CONTENT_KEY),catalog=JSON.parse(fs.readFileSync(path.join(ROOT,'catalog.json'),'utf8'));
fs.writeFileSync(path.join(ROOT,'library.enc.json'),JSON.stringify(seal(JSON.stringify({books:input.books}),key))+'\n');
fs.writeFileSync(path.join(ROOT,'catalog.json'),JSON.stringify({...catalog,lessons:input.lessons},null,2)+'\n');console.log(`Packed ${input.books.length} source-verified reading selections; no plaintext book content written to tracked files`);
