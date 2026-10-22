#!/usr/bin/env node
/*
 * Verifies that a content branch changes ONLY pin content.
 *   node scripts/content-diff-check.js <base-ref> <head-ref>
 * Checks (exit 1 on any failure):
 *  1. the only changed file is index.html;
 *  2. outside `const LOCATIONS = [ ... ];` index.html is byte-identical (no code/CSS/markup change);
 *  3. same pins, same ids, same order, slugs unchanged;
 *  4. only whitelisted content fields change;
 *  5. no source reference is removed: every base source is either still present unchanged, or
 *     is listed in CORRECTED_CITATIONS (same work, corrected title/URL) and its replacement
 *     is present; no pin has fewer sources than before.
 * It also lists pins whose timeline/sources changed (rendered only by the technical branch's
 * detail Timeline/Sources sections). No dependencies, no network.
 */
'use strict';
const cp = require('child_process'), vm = require('vm');
const [base, head] = process.argv.slice(2);
if (!base || !head) { console.error('usage: content-diff-check.js <base-ref> <head-ref>'); process.exit(2); }

const ALLOWED_FIELDS = new Set(['name', 'nameEn', 'country', 'countryCode', 'city', 'coordinates',
  'category', 'categoryColor', 'shortPreview', 'hook', 'theStory', 'whatWeKnow', 'theMystery',
  'fullStory', 'safetyNote', 'contentFlags', 'timeline', 'sources', 'tags', 'era', 'connections']);

// Citations corrected in place (same cited work; wrong title or a link that did not reach the
// document). Justification and sources: docs/content-corrections.md §6.1.
const CORRECTED_CITATIONS = [
  { id: '001', oldTitle: 'CIA Declassified History of the U-2 Programme',
    newTitle: 'The Central Intelligence Agency and Overhead Reconnaissance: The U-2 and OXCART Programs, 1954–1974 (CIA history, declassified 2013; National Security Archive)',
    why: 'old cia.gov link opened the generic Reading Room page, not the document' },
  { id: '001', oldTitle: 'The Road to Area 51 — Annie Jacobsen (2011)',
    newTitle: "Area 51: An Uncensored History of America's Top Secret Military Base — Annie Jacobsen (2011)",
    why: 'wrong book title for the same book' },
  { id: '005', oldTitle: 'Nazca: Eighth Wonder of the World — Silverman & Proulx (2002)',
    newTitle: 'The Nasca — Helaine Silverman & Donald A. Proulx (Blackwell, 2002)',
    why: 'wrong title for the same book; DOI added' },
];

const git = (...a) => cp.execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 << 20 });
const START = 'const LOCATIONS = [', END = '\n];';
function split(html) {
  const a = html.indexOf(START), b = html.indexOf(END, a);
  if (a < 0 || b < 0) throw new Error('LOCATIONS block not found');
  const block = html.slice(a, b + END.length);
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(block.replace('const LOCATIONS', 'var LOCATIONS'), ctx);
  return { outside: html.slice(0, a) + html.slice(b + END.length), locs: ctx.LOCATIONS };
}
const fails = [];
const fail = m => fails.push(m);
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

const files = git('diff', '--name-only', base, head).split('\n').filter(Boolean);
if (!same(files, ['index.html'])) fail('changed files must be exactly [index.html], got ' + JSON.stringify(files));

const A = split(git('show', base + ':index.html')), B = split(git('show', head + ':index.html'));
if (A.outside !== B.outside) fail('index.html changed outside the LOCATIONS block');
if (A.locs.length !== B.locs.length) fail(`pin count ${A.locs.length} -> ${B.locs.length}`);

const changedPins = [], renderDep = [];
let kept = 0, corrected = 0, added = 0;
A.locs.forEach((a, i) => {
  const b = B.locs[i];
  if (!b || a.id !== b.id) { fail(`pin order/id changed at index ${i}`); return; }
  if (a.slug !== b.slug) fail(`${a.id}: slug changed ${a.slug} -> ${b.slug}`);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changed = [...keys].filter(k => !same(a[k], b[k]));
  if (!changed.length) return;
  changedPins.push(`${a.id} ${changed.join(',')}`);
  changed.filter(k => !ALLOWED_FIELDS.has(k)).forEach(k => fail(`${a.id}: non-content field changed: ${k}`));
  if (changed.includes('timeline') || changed.includes('sources')) renderDep.push(a.id);
  const sa = a.sources || [], sb = b.sources || [];
  if (sb.length < sa.length) fail(`${a.id}: sources ${sa.length} -> ${sb.length}`);
  const used = new Set();
  sa.forEach(s => {
    let j = sb.findIndex((t, k) => !used.has(k) && same(s, t));
    if (j >= 0) { used.add(j); kept++; return; }
    const c = CORRECTED_CITATIONS.find(c => c.id === a.id && c.oldTitle === s.title);
    j = c ? sb.findIndex((t, k) => !used.has(k) && t.title === c.newTitle) : -1;
    if (j >= 0) { used.add(j); corrected++; return; }
    fail(`${a.id}: source removed: ${JSON.stringify(s)}`);
  });
  added += sb.length - used.size;
});

console.log(`pins changed: ${changedPins.length}`);
changedPins.forEach(l => console.log('  ' + l));
console.log(`sources: ${kept} unchanged, ${corrected} corrected in place (same work), ${added} added, 0 allowed removals`);
console.log(`timeline/sources edits (need the technical branch's detail sections to be visible): ${renderDep.join(', ') || 'none'}`);
if (fails.length) { console.error('CONTENT DIFF CHECK FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('content diff check passed: only pin content changed in index.html; no source removed');
