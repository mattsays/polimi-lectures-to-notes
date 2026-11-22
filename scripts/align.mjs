#!/usr/bin/env node
// Map slides to the moments in which the lecture talks about them.
//
// This is the cheap half of the alignment problem, and the one worth doing without a
// model: lexical overlap between a slide and a 30-second transcript window, plus
// explicit verbal cues ("next slide", "this figure"), assigned monotonically.
//
//   node scripts/align.mjs --segments work/L01.segments.json \
//                          --slides work/L01-slides.txt \
//                          --out work/L01.alignment.json
//
// The slides file is the pdftotext output, one page per form feed (\f).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const STOPWORDS = new Set([
  // English
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'have', 'has', 'are', 'was', 'were',
  'you', 'your', 'can', 'but', 'not', 'all', 'any', 'how', 'why', 'when', 'what', 'which',
  'will', 'would', 'there', 'their', 'they', 'them', 'then', 'than', 'into', 'out', 'our',
  'one', 'two', 'three', 'also', 'such', 'more', 'most', 'some', 'these', 'those', 'its',
  'see', 'now', 'let', 'get', 'got', 'use', 'used', 'using', 'way', 'may', 'much', 'very',
  // Italian
  'che', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'con', 'per', 'una', 'uno', 'gli',
  'sono', 'come', 'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'anche', 'più',
  'può', 'essere', 'abbiamo', 'avete', 'hanno', 'fare', 'fatto', 'cosa', 'dove', 'quando',
  'allora', 'quindi', 'però', 'cioè', 'solo', 'ogni', 'tutti', 'tutte', 'molto', 'poco',
  'detto', 'vediamo', 'vedete', 'adesso', 'dopo', 'prima', 'bene', 'okay', 'ok', 'sì', 'no',
]);

const CUE_RE = [
  // Explicit numbering: the strongest signal available, and nearly free.
  /(?:slide|diapositiva|pagina|page)\s*(?:number\s*)?(\d{1,3})/i,
  /(?:figura|figure|grafico|plot|chart)\s*(\d{1,3})/i,
];
const CUE_SOFT = [
  /next slide|prossima slide|slides? successiv|move on to/i,
  /this (?:figure|plot|chart|slide)|questa (?:figura|slide)|come (?:potete )?vedere/i,
];

function tokenise(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

function parseSlides(raw) {
  return raw
    .split('\f')
    .map((page, i) => ({ index: i + 1, text: page.replace(/\s+/g, ' ').trim() }))
    .filter((s) => s.text.length > 0)
    .map((s) => ({ ...s, tokens: new Set(tokenise(s.text)) }));
}

// Tokens that appear on most slides carry no signal ("exercise", "solution"): dropping
// them stops every window from looking equally similar to everything.
function commonTokens(slides, ratio = 0.6) {
  const counts = new Map();
  for (const slide of slides) for (const t of slide.tokens) counts.set(t, (counts.get(t) || 0) + 1);
  const limit = Math.max(2, Math.floor(slides.length * ratio));
  const common = new Set();
  for (const [t, n] of counts) if (n >= limit) common.add(t);
  return common;
}

function buildWindows(segments, seconds) {
  const windows = [];
  let current = null;
  for (const seg of segments) {
    if (!current || seg.start - current.t_start >= seconds) {
      if (current) windows.push(current);
      current = { t_start: seg.start, t_end: seg.end, text: seg.text || '' };
    } else {
      current.t_end = seg.end;
      current.text += ` ${seg.text || ''}`;
    }
  }
  if (current) windows.push(current);
  return windows;
}

function cueSlide(text, slidesCount) {
  for (const re of CUE_RE) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= slidesCount) return n;
    }
  }
  return null;
}

function hasSoftCue(text) {
  return CUE_SOFT.some((re) => re.test(text));
}

function main() {
  const argv = process.argv.slice(2);
  const opts = { window: 30, margin: 1.35, out: null, segments: null, slides: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--segments') opts.segments = next();
    else if (a === '--slides') opts.slides = next();
    else if (a === '--out') opts.out = next();
    else if (a === '--window') opts.window = Number(next());
    else if (a === '--margin') opts.margin = Number(next());
    else if (a === '--help' || a === '-h') {
      console.log(`usage: node scripts/align.mjs --segments <segments.json> --slides <slides.txt> --out <alignment.json>
  --window <seconds>   transcript window size, default 30
  --margin <factor>    how much better a new slide must score to take over, default 1.35`);
      return;
    } else throw new Error(`unknown option ${a}`);
  }
  if (!opts.segments || !opts.slides) throw new Error('--segments and --slides are required');
  if (!existsSync(opts.segments)) throw new Error(`not found: ${opts.segments}`);
  if (!existsSync(opts.slides)) throw new Error(`not found: ${opts.slides}`);

  const parsed = JSON.parse(readFileSync(opts.segments, 'utf8'));
  const segments = Array.isArray(parsed.segments) ? parsed.segments : parsed;
  if (segments.length === 0) throw new Error('the segments file has no segments');

  const slides = parseSlides(readFileSync(opts.slides, 'utf8'));
  if (slides.length === 0) throw new Error('the slides file has no pages');

  const common = commonTokens(slides);
  for (const slide of slides) for (const t of common) slide.tokens.delete(t);

  const windows = buildWindows(segments, opts.window).map((w) => ({
    ...w,
    tokens: new Set(tokenise(w.text)),
  }));

  const history = [];
  let current = null;
  let currentScore = 0;

  for (const win of windows) {
    const scores = slides.map((s) => ({ index: s.index, score: jaccard(win.tokens, s.tokens) }));
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];
    const cued = cueSlide(win.text, slides.length);

    let chosen;
    let anchor;
    let confidence;
    if (cued !== null) {
      chosen = cued;
      anchor = 'cue';
      confidence = 'high';
    } else if (current === null) {
      chosen = best.index;
      anchor = 'overlap';
      confidence = best.score > 0.02 ? 'low' : 'none';
    } else {
      const scoreOf = (idx) => scores.find((s) => s.index === idx)?.score ?? 0;
      const here = scoreOf(current);
      // Two ways to move on: a verbal cue plus a better score, or an overlap so much
      // stronger that no cue is needed. Requiring a cue for every change would freeze
      // the mapping on the first slide when the lecturer changes without saying so.
      const better = best.index !== current && best.score > Math.max(here * opts.margin, 0.02);
      const decisive = best.score > Math.max(here * 2.0, 0.08);
      const move = better && (hasSoftCue(win.text) || decisive);
      chosen = move ? best.index : current;
      anchor = move ? (hasSoftCue(win.text) ? 'overlap+cue' : 'overlap') : 'kept';
      confidence = move && decisive ? 'medium' : 'low';
    }

    if (chosen !== current) {
      history.push({
        slide: chosen,
        t_start: Number(win.t_start.toFixed(2)),
        t_end: Number(win.t_end.toFixed(2)),
        confidence,
        anchor,
        rewind: current !== null && chosen < current,
      });
      current = chosen;
      currentScore = best.score;
    } else {
      const last = history[history.length - 1];
      last.t_end = Number(win.t_end.toFixed(2));
      if (confidence === 'high' && last.confidence !== 'high') {
        last.confidence = 'high';
        last.anchor = 'cue';
      }
      currentScore = Math.max(currentScore, best.score);
    }
    if (history.length > 0) history[history.length - 1].windows = (history[history.length - 1].windows || 0) + 1;
  }

  const covered = new Set(history.map((h) => h.slide));
  const never = slides.filter((s) => !covered.has(s.index)).map((s) => s.index);

  const output = {
    generated: new Date().toISOString(),
    window_seconds: opts.window,
    slides_total: slides.length,
    slides_covered: covered.size,
    ignored_common_tokens: common.size,
    alignment: history,
    never_discussed: never,
  };
  if (opts.out) writeFileSync(opts.out, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`slides     ${slides.length} total, ${covered.size} covered`);
  console.log(`windows    ${windows.length} of ${opts.window}s`);
  console.log(`ignored    ${common.size} tokens common to most slides`);
  const high = history.filter((h) => h.confidence === 'high').length;
  console.log(`anchors    ${high} cue-based, ${history.length - high} from overlap only`);
  if (never.length) console.log(`never      slides ${never.join(', ')} were not discussed`);
  if (opts.out) console.log(`written    ${opts.out}`);
}

try {
  main();
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
}
