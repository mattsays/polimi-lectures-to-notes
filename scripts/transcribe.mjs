#!/usr/bin/env node
// Transcribe a lecture with the Groq speech-to-text API.
//
// Pipeline: normalise to 16 kHz mono FLAC (Groq's documented preprocessing),
// cut into deterministic chunks below the upload limit, transcribe each chunk,
// offset the segment timestamps and merge everything into one transcript.
//
//   node scripts/transcribe.mjs raw/L01.mp4 --out work/L01 --prompt-file work/glossary.txt
//
// Requires: ffmpeg + ffprobe on PATH, and a Groq API key (see resolveApiKey).

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

const DEFAULTS = {
  model: 'whisper-large-v3-turbo',
  language: 'it',
  chunk: 600,               // seconds per chunk; 10 min of speech FLAC is ~12 MB
  maxUploadMb: 100,         // dev tier limit; free tier is 25
  baseUrl: 'https://api.groq.com/openai/v1',
  concurrency: 1,
  retries: 4,
  prompt: '',
  keyFile: null,
  snapToSilence: true,
};

const SAMPLE_RATE = 16000;
const DEFAULT_KEY_FILE = path.join(homedir(), '.config', 'polimi-lectures', 'groq.key');

function usage(code = 0) {
  const text = `
usage: node scripts/transcribe.mjs <input media> --out <basename> [options]

  --out <path>         output basename, e.g. work/L01 (writes .transcript.md, .srt, .segments.json)
  --model <id>         default whisper-large-v3-turbo
  --language <code>    default it
  --prompt <text>      glossary prompt passed to the model
  --prompt-file <f>    read the prompt from a file (takes precedence over --prompt)
  --chunk <seconds>    chunk length, default 600
  --max-upload-mb <n>  hard ceiling per chunk, default 100 (dev tier); use 25 on the free tier
  --no-snap            cut at the nominal boundary instead of inside the nearest silence
  --key-file <f>       Groq API key file, default ${DEFAULT_KEY_FILE}
  --base-url <url>     API base, default https://api.groq.com/openai/v1
  --dry-run            run ffmpeg and chunking, print the requests, call nothing
  --check              preflight only: ffmpeg, ffprobe, node, API key, and whether the API accepts it
  --help               this text

api key resolution, first match wins:
  --key-file  >  $GROQ_API_KEY  >  $GROQ_API_KEY_FILE  >  ${DEFAULT_KEY_FILE}
`.trim();
  console.log(text);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { ...DEFAULTS, input: null, out: null, promptFile: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    switch (a) {
      case '--out': opts.out = next(); break;
      case '--model': opts.model = next(); break;
      case '--language': opts.language = next(); break;
      case '--prompt': opts.prompt = next(); break;
      case '--prompt-file': opts.promptFile = next(); break;
      case '--chunk': opts.chunk = Number(next()); break;
      case '--max-upload-mb': opts.maxUploadMb = Number(next()); break;
      case '--key-file': opts.keyFile = next(); break;
      case '--concurrency': opts.concurrency = Number(next()); break;
      case '--base-url': opts.baseUrl = next(); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--check': opts.check = true; break;
      case '--no-snap': opts.snapToSilence = false; break;
      case '--help': case '-h': usage(0); break;
      default:
        if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
        if (opts.input) throw new Error(`unexpected argument ${a}`);
        opts.input = a;
    }
  }
  if (!opts.input && !opts.check) throw new Error('missing input file');
  if (opts.input && !opts.out) {
    opts.out = path.join('work', path.basename(opts.input, path.extname(opts.input)));
  }
  if (!(opts.chunk > 0)) throw new Error('--chunk must be positive');
  if (!(opts.maxUploadMb > 0)) throw new Error('--max-upload-mb must be positive');
  return opts;
}

function readKeyFile(file) {
  if (!existsSync(file)) return '';
  return readFileSync(file, 'utf8').trim().split('\n')[0].trim();
}

// Returns where the key came from, so preflight can tell the user which location
// is actually in use rather than guessing.
function locateApiKey(opts) {
  if (opts.keyFile) {
    const key = readKeyFile(opts.keyFile);
    return { key, source: opts.keyFile, explicit: true };
  }
  if (process.env.GROQ_API_KEY) return { key: process.env.GROQ_API_KEY.trim(), source: '$GROQ_API_KEY' };
  if (process.env.GROQ_API_KEY_FILE) {
    const key = readKeyFile(process.env.GROQ_API_KEY_FILE);
    if (key) return { key, source: process.env.GROQ_API_KEY_FILE };
  }
  return { key: readKeyFile(DEFAULT_KEY_FILE), source: DEFAULT_KEY_FILE };
}

function resolveApiKey(opts) {
  const { key, source, explicit } = locateApiKey(opts);
  if (!key) {
    if (explicit) throw new Error(`--key-file ${source} is missing or empty`);
    throw new Error(`no Groq API key. Run the preflight for instructions: --check`);
  }
  return key;
}

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { encoding: 'buffer' });
  if (r.error) throw new Error(`${label}: ${cmd} not runnable (${r.error.message})`);
  if (r.status !== 0) {
    throw new Error(`${label}: ${cmd} exited ${r.status}\n${(r.stderr || '').toString().slice(-2000)}`);
  }
  return (r.stdout || '').toString();
}

function durationOf(file) {
  const out = run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ], `ffprobe ${file}`).trim();
  const d = Number(out);
  if (!Number.isFinite(d) || d <= 0) throw new Error(`ffprobe returned no duration for ${file}`);
  return d;
}

// Silence detection is used to choose *where* to cut, never to remove audio:
// deleting silence would desynchronise every timestamp from the video and the
// slides, which is the one thing the whole pipeline depends on.
function detectSilences(input) {
  const r = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats',
    '-i', input,
    '-af', 'silencedetect=noise=-35dB:d=0.6',
    '-f', 'null', '-',
  ], { encoding: 'buffer' });
  const log = (r.stderr || '').toString();
  const gaps = [];
  let current = null;
  for (const line of log.split('\n')) {
    const start = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (start) { current = Math.max(0, Number(start[1])); continue; }
    const end = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (end && current !== null) {
      gaps.push({ start: current, end: Number(end[1]) });
      current = null;
    }
  }
  if (current !== null) gaps.push({ start: current, end: Number.POSITIVE_INFINITY });
  return gaps.filter((g) => g.end - g.start >= 0.6);
}

// Move each nominal boundary into the middle of the nearest silence, so a chunk
// never starts or ends mid-word. Offsets stay exact because they come from the
// segment list, not from the requested times.
function snapBoundaries(boundaries, silences, windowSeconds) {
  const midpoint = (g) => (g.end === Number.POSITIVE_INFINITY ? g.start : (g.start + g.end) / 2);
  return boundaries.map((b) => {
    const near = silences.filter((g) => g.start - windowSeconds <= b && b <= g.end + windowSeconds);
    if (near.length === 0) return { time: b, snapped: false };
    const best = near.reduce((a, c) => (Math.abs(midpoint(c) - b) < Math.abs(midpoint(a) - b) ? c : a));
    return { time: midpoint(best), snapped: true };
  });
}

// Same intent as Groq's documented preprocessing command, pinned to the first
// audio stream because the API only transcribes the first track anyway, and
// segmented so every upload stays under the limit.
//
// A 90-minute lecture is ~108 MB of speech FLAC, so segmentation is not
// optional even on the 100 MB dev tier: it is also what makes retries cheap.
function normaliseAndChunk(input, chunkDir, chunkSeconds, totalDuration, snapToSilence) {
  rmSync(chunkDir, { recursive: true, force: true });
  mkdirSync(chunkDir, { recursive: true });
  const listPath = path.join(chunkDir, 'list.csv');

  const nominal = [];
  for (let t = chunkSeconds; t < totalDuration - 1; t += chunkSeconds) nominal.push(t);

  let cuts = nominal;
  if (snapToSilence && nominal.length > 0) {
    const silences = detectSilences(input);
    const snapped = snapBoundaries(nominal, silences, 30);
    cuts = [];
    const report = [];
    for (const candidate of snapped) {
      const prev = cuts.length ? cuts[cuts.length - 1] : 0;
      if (candidate.time > prev + 30 && candidate.time < totalDuration - 1) {
        cuts.push(candidate.time);
        report.push(`${formatTimestamp(candidate.time)}${candidate.snapped ? ' (silence)' : ' (in speech)'}`);
      }
    }
    if (report.length) console.log(`cuts      ${report.join(', ')}`);
    if (silences.length === 0) console.log('cuts      no silence found, using nominal boundaries');
  }

  const segmentArgs = cuts.length
    ? ['-segment_times', cuts.map((t) => t.toFixed(3)).join(',')]
    : ['-segment_time', String(chunkSeconds)];

  run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', input,
    '-ar', String(SAMPLE_RATE),
    '-ac', '1',
    '-map', '0:a:0',
    '-c:a', 'flac',
    '-f', 'segment',
    ...segmentArgs,
    '-reset_timestamps', '1',
    '-segment_format', 'flac',
    '-segment_list', listPath,
    '-segment_list_type', 'csv',
    path.join(chunkDir, '%03d.flac'),
  ], 'ffmpeg normalise');

  if (!existsSync(listPath)) throw new Error('ffmpeg wrote no segment list');
  // Raw FLAC carries no duration header, so the segment list is the only exact
  // source of chunk start times. Rows are: file,start,end.
  const rows = readFileSync(listPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, start, end] = line.split(',');
      return { file: path.join(chunkDir, path.basename(name)), start: Number(start), end: Number(end) };
    });
  if (rows.length === 0) throw new Error('ffmpeg produced no audio chunks: does the file have an audio track?');
  for (const row of rows) {
    if (!Number.isFinite(row.start) || !Number.isFinite(row.end) || row.end <= row.start) {
      throw new Error(`unusable segment row for ${row.file}`);
    }
  }
  return rows;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function transcribeChunk(file, opts, apiKey) {
  const bytes = readFileSync(file);
  const limit = opts.maxUploadMb * 1_000_000;
  if (bytes.length > limit) {
    throw Object.assign(
      new Error(`${path.basename(file)} is ${(bytes.length / 1e6).toFixed(1)} MB, over the ${opts.maxUploadMb} MB limit; use a smaller --chunk`),
      { fatal: true },
    );
  }
  const form = new FormData();
  form.append('file', new Blob([bytes]), path.basename(file));
  form.append('model', opts.model);
  form.append('language', opts.language);
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  form.append('timestamp_granularities[]', 'segment');
  if (opts.prompt) form.append('prompt', opts.prompt.slice(0, 1000));

  let lastError;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      const res = await fetch(`${opts.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 500);
        const retriable = res.status === 429 || res.status >= 500;
        if (!retriable) throw Object.assign(new Error(`Groq ${res.status}: ${body}`), { fatal: true });
        throw new Error(`Groq ${res.status}: ${body}`);
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.fatal) throw err;
      if (attempt === opts.retries) break;
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw lastError;
}

function formatTimestamp(seconds, separator = ':') {
  const total = Math.max(0, Math.round(seconds * 1000));
  const h = String(Math.floor(total / 3_600_000)).padStart(2, '0');
  const m = String(Math.floor((total % 3_600_000) / 60_000)).padStart(2, '0');
  const s = String(Math.floor((total % 60_000) / 1000)).padStart(2, '0');
  if (separator === ',') return `${h}:${m}:${s},${String(total % 1000).padStart(3, '0')}`;
  return `${h}:${m}:${s}`;
}

function buildTranscript(segments) {
  const blocks = [];
  let current = null;
  for (const seg of segments) {
    const text = seg.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (!current) current = { start: seg.start, parts: [text], end: seg.end };
    else {
      current.parts.push(text);
      current.end = seg.end;
      if (seg.end - current.start >= 45) {
        blocks.push(current);
        current = null;
      }
    }
  }
  if (current) blocks.push(current);
  return blocks
    .map((b) => `[${formatTimestamp(b.start)}] ${b.parts.join(' ').replace(/\s+([,.;:!?])/g, '$1')}`)
    .join('\n\n');
}

function buildSrt(segments) {
  return segments
    .map((seg, i) => `${i + 1}\n${formatTimestamp(seg.start, ',')} --> ${formatTimestamp(seg.end, ',')}\n${seg.text.trim()}\n`)
    .join('\n');
}

// Preflight answers "can this machine transcribe a lecture right now" without
// touching any audio, so a missing key is reported as an actionable setup step
// instead of surfacing halfway through a course.
async function preflight(opts) {
  const rows = [];
  const major = Number(process.versions.node.split('.')[0]);
  rows.push(['node', major >= 18 ? 'ok' : 'TOO OLD', `${process.versions.node}${major >= 18 ? '' : ', need 18 or newer'}`]);

  for (const bin of ['ffmpeg', 'ffprobe']) {
    const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
    if (r.error || r.status !== 0) rows.push([bin, 'MISSING', 'install it, or add it to PATH']);
    else rows.push([bin, 'ok', (r.stdout || '').split('\n')[0].trim().slice(0, 58)]);
  }

  const { key, source } = locateApiKey(opts);
  if (!key) {
    rows.push(['groq key', 'MISSING', `nothing at ${source}`]);
  } else if (!key.startsWith('gsk_')) {
    rows.push(['groq key', 'SUSPICIOUS', `${source} does not start with gsk_`]);
  } else {
    let note = source;
    if (source.startsWith('/') && existsSync(source)) {
      const mode = statSync(source).mode & 0o777;
      if (mode & 0o077) note += ` (mode ${mode.toString(8)}: readable by other users, chmod 600)`;
    }
    rows.push(['groq key', 'present', note]);
  }

  if (key && key.startsWith('gsk_')) {
    try {
      const res = await fetch(`${opts.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      });
      rows.push(['groq api', res.ok ? 'ok' : `HTTP ${res.status}`, res.ok ? 'key accepted' : 'key rejected']);
    } catch (err) {
      rows.push(['groq api', 'unverified', err.name === 'TimeoutError' ? 'timed out' : 'network error']);
    }
  }

  const width = Math.max(...rows.map((r) => r[0].length));
  console.log('preflight');
  for (const [name, state, detail] of rows) {
    console.log(`  ${name.padEnd(width)}  ${state.padEnd(12)}  ${detail}`);
  }

  const failed = rows.some((r) =>
    r[1] === 'MISSING' || r[1] === 'TOO OLD' || r[1] === 'SUSPICIOUS' || r[1] === 'HTTP 401' || r[1] === 'HTTP 403');
  if (failed) {
    console.log(`
Fix the groq key yourself, in your own terminal, so it never passes through a chat:

  1. create one at https://console.groq.com/keys
  2. mkdir -p ~/.config/polimi-lectures
  3. printf '%s' 'gsk_your_key' > ~/.config/polimi-lectures/groq.key
  4. chmod 600 ~/.config/polimi-lectures/groq.key
  5. re-run: node scripts/transcribe.mjs --check
`);
  }
  process.exitCode = failed ? 1 : 0;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err.message}\n`);
    usage(1);
  }

  if (opts.check) {
    await preflight(opts);
    return;
  }

  if (!existsSync(opts.input)) throw new Error(`input not found: ${opts.input}`);
  if (opts.promptFile) {
    if (!existsSync(opts.promptFile)) throw new Error(`prompt file not found: ${opts.promptFile}`);
    opts.prompt = readFileSync(opts.promptFile, 'utf8').replace(/\s+/g, ' ').trim();
  }

  const apiKey = opts.dryRun ? '' : resolveApiKey(opts);
  if (!opts.dryRun && !apiKey) {
    throw new Error(`no Groq API key: pass --key-file, set GROQ_API_KEY, or write it to ${DEFAULT_KEY_FILE}`);
  }

  const outDir = path.dirname(opts.out);
  if (outDir && outDir !== '.') mkdirSync(outDir, { recursive: true });
  const chunkDir = `${opts.out}.chunks`;

  const totalDuration = durationOf(opts.input);
  console.log(`input      ${opts.input}`);
  console.log(`duration   ${formatTimestamp(totalDuration)}`);
  console.log(`chunking   ${opts.chunk}s -> ${chunkDir}`);

  const chunks = normaliseAndChunk(opts.input, chunkDir, opts.chunk, totalDuration, opts.snapToSilence);

  const segments = [];
  const failures = [];

  for (let i = 0; i < chunks.length; i++) {
    const { file, start: offset, end } = chunks[i];
    const label = `[${i + 1}/${chunks.length}] ${path.basename(file)} @ ${formatTimestamp(offset)}`;

    if (opts.dryRun) {
      console.log(`${label}  ${(readFileSync(file).length / 1e6).toFixed(1)} MB  (dry run, not uploaded)`);
      continue;
    }

    console.log(`${label}  transcribing...`);
    try {
      const result = await transcribeChunk(file, opts, apiKey);
      const raw = Array.isArray(result.segments) && result.segments.length
        ? result.segments
        : [{ start: 0, end: end - offset, text: result.text || '' }];
      for (const seg of raw) {
        segments.push({
          start: Number(seg.start) + offset,
          end: Number(seg.end) + offset,
          text: String(seg.text || ''),
        });
      }
    } catch (err) {
      console.error(`  FAILED ${path.basename(file)}: ${err.message}`);
      failures.push({ chunk: path.basename(file), error: err.message });
    }
  }

  if (opts.dryRun) {
    console.log(`\ndry run ok: ${chunks.length} chunks, nothing was sent.`);
    return;
  }

  segments.sort((a, b) => a.start - b.start);
  const header = [
    '---',
    `source: ${opts.input}`,
    `engine: groq/${opts.model}`,
    `language: ${opts.language}`,
    `audio: ${SAMPLE_RATE} Hz mono FLAC, ${opts.chunk}s chunks`,
    `duration: ${formatTimestamp(totalDuration)}`,
    `chunks: ${chunks.length}`,
    `failed: ${failures.length}`,
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
  ].join('\n');

  writeFileSync(`${opts.out}.transcript.md`, `${header}# Transcript — ${path.basename(opts.out)}\n\n${buildTranscript(segments)}\n`);
  writeFileSync(`${opts.out}.srt`, buildSrt(segments));
  writeFileSync(`${opts.out}.segments.json`, JSON.stringify({
    source: opts.input,
    model: opts.model,
    language: opts.language,
    duration: totalDuration,
    chunks: chunks.length,
    failures,
    segments,
  }, null, 2));

  console.log(`\nsegments   ${segments.length}`);
  console.log(`transcript ${opts.out}.transcript.md`);
  console.log(`subtitles  ${opts.out}.srt`);
  if (failures.length) {
    console.error(`\n${failures.length} chunk(s) failed. Re-run to retry; successful chunks are not cached.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
});
