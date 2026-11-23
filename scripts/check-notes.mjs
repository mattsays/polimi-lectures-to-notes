#!/usr/bin/env node
// Check that notes and their extraction JSON obey the rules in SKILL.md.
//
// The rules about sources, unresolved doubts and allowed callouts are the reason the
// notes can be trusted; a rule nobody checks is a rule that decays. This is the
// mechanical half of the coverage check in reference/extraction.md §4.
//
//   node scripts/check-notes.mjs <course-dir> [--lesson L01] [--json]
//
// Errors fail the run; warnings are things worth a look, not defects.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ALLOWED_CALLOUTS = new Set(['danger', 'example', 'warning', 'question', 'abstract', 'info', 'note', 'tip']);
const REQUIRED_FRONTMATTER = ['corso', 'lezione', 'tipo'];

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file}: ${err.message}`);
  }
}

function frontmatterOf(markdown) {
  const m = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

function collectMarkdownFiles(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (['work', 'raw', 'assets', 'node_modules'].includes(entry)) continue;
        walk(full);
      } else if (entry.endsWith('.md')) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}

function hasSource(item) {
  const src = item?.source;
  if (!src) return false;
  return Boolean(src.timestamp || src.slide || src.handout);
}

function checkExtraction(lesson, extractionPath) {
  const errors = [];
  const warnings = [];
  if (!existsSync(extractionPath)) {
    return { errors: [`E0 extraction file missing: ${extractionPath}`], warnings };
  }
  const data = readJson(extractionPath);

  (data.concepts || []).forEach((c, i) => {
    if (!hasSource(c)) errors.push(`E1 concepts[${i}]${c.id ? ` (${c.id})` : ''} has no source with timestamp, slide or handout`);
    if (!c.statement && !c.name) errors.push(`E2 concepts[${i}] has neither name nor statement`);
  });

  (data.examples || []).forEach((e, i) => {
    if (!hasSource(e)) errors.push(`E1 examples[${i}]${e.id ? ` (${e.id})` : ''} has no source`);
    if (!e.result) errors.push(`E3 examples[${i}]${e.id ? ` (${e.id})` : ''} has no result`);
    if (!e.why_it_matters) warnings.push(`W3 examples[${i}] does not say why it matters`);
  });

  (data.traps || []).forEach((t, i) => {
    if (!t.text) errors.push(`E4 traps[${i}] has no text`);
    if (!hasSource(t)) errors.push(`E1 traps[${i}]${t.id ? ` (${t.id})` : ''} has no source`);
  });

  (data.to_verify || []).forEach((t, i) => {
    if (!t.reason) errors.push(`E5 to_verify[${i}] does not say what is uncertain`);
  });

  const unexplained = (data.concepts || []).filter((c) => !c.statement && c.name);
  if (unexplained.length > 0 && !(data.gaps || []).length) {
    errors.push(`E6 ${unexplained.length} concept(s) have no statement but gaps[] is empty`);
  }

  return { errors, warnings };
}

function checkMarkdown(file, courseRoot, extraction) {
  const errors = [];
  const warnings = [];
  const text = readFileSync(file, 'utf8');
  const rel = path.relative(courseRoot, file);

  const fm = frontmatterOf(text);
  if (!fm) errors.push(`M1 ${rel}: no frontmatter`);
  else {
    for (const key of REQUIRED_FRONTMATTER) {
      if (!fm[key]) errors.push(`M2 ${rel}: frontmatter lacks '${key}'`);
    }
  }

  for (const line of text.split('\n')) {
    const heading = line.match(/^(#{1,6})\s/);
    if (heading && heading[1].length > 3) {
      errors.push(`M3 ${rel}: heading deeper than ### — "${line.trim().slice(0, 60)}"`);
    }
    const callout = line.match(/^>\s*\[!(\w+)\]/);
    if (callout && !ALLOWED_CALLOUTS.has(callout[1].toLowerCase())) {
      errors.push(`M4 ${rel}: callout [!${callout[1]}] is not in the allowed set`);
    }
  }

  const links = [...text.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)].map((m) => m[1].trim());
  if (links.length > 0) {
    const known = new Set(collectMarkdownFiles(courseRoot).map((f) => path.basename(f, '.md')));
    for (const target of new Set(links)) {
      if (!known.has(target)) errors.push(`M5 ${rel}: wikilink [[${target}]] has no matching file`);
    }
  }

  if (extraction) {
    const pending = (extraction.to_verify || []).length;
    if (pending > 0) {
      const surfaced = (text.match(/\[!warning\]/gi) || []).length;
      if (surfaced < pending) {
        warnings.push(`W1 ${rel}: ${pending} to_verify entries, only ${surfaced} [!warning] callout(s) in the notes`);
      }
    }
  }

  return { errors, warnings };
}

function main() {
  const argv = process.argv.slice(2);
  const opts = { course: null, lesson: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lesson') opts.lesson = argv[++i];
    else if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') {
      console.log(`usage: node scripts/check-notes.mjs <course-dir> [--lesson <id>] [--json]

Checks every lesson that has an extraction or a notes file:
  E1 a concept, example or trap without a source
  E3 an example without a result
  E5 a to_verify entry that does not say what is uncertain
  E6 unexplained concepts with an empty gaps[]
  M1/M2 missing frontmatter or required keys
  M3 headings deeper than ###
  M4 callouts outside the allowed set
  M5 wikilinks that point at nothing
Warnings: to_verify not surfaced in the notes, examples without a rationale.`);
      return;
    } else if (!opts.course) opts.course = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (!opts.course) throw new Error('missing course directory');
  if (!existsSync(opts.course)) throw new Error(`not found: ${opts.course}`);

  const manifestPath = path.join(opts.course, 'manifest.json');
  const lessons = existsSync(manifestPath)
    ? (readJson(manifestPath).lessons || [])
    : [];
  if (lessons.length === 0) throw new Error(`${manifestPath}: no lessons[] to check`);

  const selected = opts.lesson ? lessons.filter((l) => l.id === opts.lesson) : lessons;
  if (selected.length === 0) throw new Error(`no lesson with id ${opts.lesson}`);

  const report = [];
  for (const lesson of selected) {
    const extractionPath = lesson.extraction ? path.join(opts.course, lesson.extraction) : null;
    const notesPath = lesson.notes ? path.join(opts.course, lesson.notes) : null;

    const hasExtraction = extractionPath && existsSync(extractionPath);
    const hasNotes = notesPath && existsSync(notesPath);

    // The manifest claims a state; the files must agree with it, or resuming later
    // will skip work that was never done.
    const claimed = ['written', 'reviewed'].includes(lesson.status);
    if (!hasExtraction && !hasNotes) {
      if (claimed) {
        report.push({
          lesson: lesson.id,
          notes: lesson.notes,
          errors: [`E7 status is '${lesson.status}' but neither the notes nor the extraction exist`],
          warnings: [],
        });
      }
      continue;
    }

    const extraction = hasExtraction ? readJson(extractionPath) : null;
    const result = hasExtraction ? checkExtraction(lesson, extractionPath) : { errors: [], warnings: [] };
    if (claimed && !hasNotes) result.errors.push(`E7 status is '${lesson.status}' but ${lesson.notes} does not exist`);
    if (hasNotes && !hasExtraction) result.errors.push(`E8 notes exist but ${lesson.extraction || 'the extraction JSON'} does not`);
    if (claimed && !hasExtraction) result.errors.push(`E7 status is '${lesson.status}' but there is no extraction JSON`);

    if (hasNotes) {
      const md = checkMarkdown(notesPath, opts.course, extraction);
      result.errors.push(...md.errors);
      result.warnings.push(...md.warnings);
    }
    report.push({ lesson: lesson.id, notes: lesson.notes, ...result });
  }

  if (opts.json) {
    console.log(JSON.stringify({ lessons: report }, null, 2));
    process.exitCode = report.some((r) => r.errors.length) ? 1 : 0;
    return;
  }

  if (report.length === 0) {
    console.log('nothing to check: no lesson has an extraction or a notes file yet');
    return;
  }

  let errorCount = 0;
  let warningCount = 0;
  for (const r of report) {
    console.log(`${r.lesson}  ${r.notes || ''}`);
    for (const e of r.errors) console.log(`  ERROR  ${e}`);
    for (const w of r.warnings) console.log(`  warn   ${w}`);
    if (!r.errors.length && !r.warnings.length) console.log('  ok');
    errorCount += r.errors.length;
    warningCount += r.warnings.length;
  }
  console.log(`\n${report.length} lesson(s): ${errorCount} error(s), ${warningCount} warning(s)`);
  process.exitCode = errorCount > 0 ? 1 : 0;
}

try {
  main();
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
}
