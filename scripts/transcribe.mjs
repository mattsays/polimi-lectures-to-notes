#!/usr/bin/env node
// Transcribe a lecture locally on Apple Silicon with whispermlx.
//
// whispermlx is a WhisperX fork running on MLX: it writes JSON (segments plus
// word-level timestamps) into --output_dir rather than printing it, so this
// wrapper normalises the media with ffmpeg, runs it once, and turns that JSON
// into a timestamped transcript and subtitles.
//
//   node scripts/transcribe.mjs raw/L01.mp4 --out work/L01
//   node scripts/transcribe.mjs --check
//
// Requires: ffmpeg, ffprobe, and whispermlx (pip/uv install) on PATH or at --whispermlx.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const DEFAULTS = {
  language: 'it',
  model: 'large-v3-turbo',
  bin: process.env.WHISPERMLX_BIN || 'whispermlx',
  prompt: '',
  force: false,
  diarize: false,
  hfToken: '',
  keepAudio: false,
};

const SAMPLE_RATE = 16000;

function usage(code = 0) {
  console.log(`
usage: node scripts/transcribe.mjs <media> --out <basename> [options]

  --out <path>         output basename (writes .transcript.md, .srt, .segments.json)
  --model <name>       whispermlx model, default large-v3-turbo (use large-v3 for accuracy)
  --language <code>    default it
  --prompt <text>      glossary passed as --initial_prompt, improves technical terms
  --prompt-file <f>    read the glossary from a file (wins over --prompt)
  --whispermlx <path>  binary, default $WHISPERMLX_BIN or whispermlx on PATH
  --diarize            label speakers; needs --hf-token and pyannote model acceptance
  --hf-token <token>   Hugging Face token for diarization (or $HF_TOKEN)
  --force              re-transcribe even if the transcript already exists
  --keep-audio         keep the normalised FLAC after the run
  --check              preflight only: node, ffmpeg, ffprobe, whispermlx
  --help               this text

The whole file goes to whispermlx in one invocation: it does its own VAD chunking,
so there is no upload limit to work around and no chunk offsets to reconstruct.
An existing transcript is skipped unless --force is given, which makes a batch over
many lectures resumable.
`.trim());
  process.exit(code);
}

function parseArgs(argv) {
  const opts = { ...DEFAULTS, input: null, out: null, promptFile: null, check: false, dryRun: false };
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
      case '--whispermlx': opts.bin = next(); break;
      case '--hf-token': opts.hfToken = next(); break;
      case '--diarize': opts.diarize = true; break;
      case '--force': opts.force = true; break;
      case '--keep-audio': opts.keepAudio = true; break;
      case '--check': opts.check = true; break;
      case '--dry-run': opts.dryRun = true; break;
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
  if (opts.diarize && !opts.hfToken) opts.hfToken = process.env.HF_TOKEN || '';
  return opts;
}

function run(cmd, args, label, timeout = 3_600_000) {
  const r = spawnSync(cmd, args, { encoding: 'buffer', timeout });
  if (r.error) {
    throw Object.assign(new Error(`${label}: ${cmd} not runnable (${r.error.message})`), { fatal: true });
  }
  if (r.status !== 0) {
    const tail = (r.stderr || '').toString().trim().split('\n').slice(-3).join(' ');
    throw Object.assign(new Error(`${label}: ${cmd} exited ${r.status}${tail ? ` — ${tail.slice(0, 400)}` : ''}`), { fatal: true });
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

function formatTimestamp(seconds, separator = ':') {
  const total = Math.max(0, Math.round(seconds * 1000));
  const h = String(Math.floor(total / 3_600_000)).padStart(2, '0');
  const m = String(Math.floor((total % 3_600_000) / 60_000)).padStart(2, '0');
  const s = String(Math.floor((total % 60_000) / 1000)).padStart(2, '0');
  if (separator === ',') return `${h}:${m}:${s},${String(total % 1000).padStart(3, '0')}`;
  return `${h}:${m}:${s}`;
}

// Quick preflight so a missing dependency is a setup instruction, not a crash
// halfway through a course.
function preflight(opts) {
  const rows = [];
  const major = Number(process.versions.node.split('.')[0]);
  rows.push(['node', major >= 18 ? 'ok' : 'TOO OLD', process.versions.node]);

  for (const bin of ['ffmpeg', 'ffprobe']) {
    const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
    if (r.error || r.status !== 0) rows.push([bin, 'MISSING', 'brew install ffmpeg']);
    else rows.push([bin, 'ok', (r.stdout || '').split('\n')[0].trim().slice(0, 54)]);
  }

  const probe = spawnSync(opts.bin, ['--help'], { encoding: 'utf8', timeout: 60_000 });
  const ran = !probe.error && ((probe.stdout || '').length + (probe.stderr || '').length) > 0;
  rows.push(['whispermlx', ran ? 'ok' : 'MISSING', ran
    ? `${opts.bin}, model ${opts.model}`
    : `${opts.bin} not runnable`]);

  const width = Math.max(...rows.map((r) => r[0].length));
  console.log('preflight');
  for (const [name, state, detail] of rows) {
    console.log(`  ${name.padEnd(width)}  ${state.padEnd(9)}  ${detail}`);
  }

  const failed = rows.some((r) => r[1] === 'MISSING' || r[1] === 'TOO OLD');
  if (failed) {
    console.log(`
whispermlx is a Python package; install it in its own environment:

  uv tool install whispermlx          # uv is already present on this machine
  # or: python3 -m venv ~/.venvs/mlx && ~/.venvs/mlx/bin/pip install whispermlx
  #     then pass --whispermlx ~/.venvs/mlx/bin/whispermlx

ffmpeg comes from Homebrew: brew install ffmpeg
The model (~1 GB for large-v3-turbo, ~3 GB for large-v3) downloads on first run.
`);
  }
  process.exitCode = failed ? 1 : 0;
}

function readSegments(jsonPath) {
  const parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const segments = (Array.isArray(parsed.segments) ? parsed.segments : []).map((seg) => ({
    start: Number(seg.start) || 0,
    end: Number(seg.end) || 0,
    text: String(seg.text ?? '').trim(),
    speaker: seg.speaker ? String(seg.speaker) : null,
  })).filter((seg) => seg.text);
  return { segments, text: String(parsed.text || '') };
}

function buildTranscript(segments) {
  const blocks = [];
  let current = null;
  for (const seg of segments) {
    const label = seg.speaker ? `[${seg.speaker}] ` : '';
    if (!current) current = { start: seg.start, parts: [label + seg.text], end: seg.end };
    else {
      current.parts.push(label + seg.text);
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
    .map((seg, i) => {
      const text = seg.speaker ? `[${seg.speaker}] ${seg.text}` : seg.text;
      return `${i + 1}\n${formatTimestamp(seg.start, ',')} --> ${formatTimestamp(seg.end, ',')}\n${text}\n`;
    })
    .join('\n');
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err.message}\n`);
    usage(1);
  }

  if (opts.check) {
    preflight(opts);
    return;
  }

  if (!existsSync(opts.input)) throw new Error(`input not found: ${opts.input}`);
  if (opts.promptFile) {
    if (!existsSync(opts.promptFile)) throw new Error(`prompt file not found: ${opts.promptFile}`);
    opts.prompt = readFileSync(opts.promptFile, 'utf8').replace(/\s+/g, ' ').trim();
  }

  const transcriptPath = `${opts.out}.transcript.md`;
  if (existsSync(transcriptPath) && !opts.force) {
    console.log(`skip       ${transcriptPath} already exists (use --force to redo)`);
    return;
  }

  const outDir = path.dirname(opts.out);
  if (outDir && outDir !== '.') mkdirSync(outDir, { recursive: true });
  const workDir = `${opts.out}.work`;
  mkdirSync(workDir, { recursive: true });

  const totalDuration = durationOf(opts.input);
  console.log(`input      ${opts.input}`);
  console.log(`duration   ${formatTimestamp(totalDuration)}`);

  // Normalise once: whispermlx would accept the video, but a 16 kHz mono FLAC is
  // smaller, deterministic, and independent of the container Webex produced.
  const audio = path.join(workDir, 'audio.flac');
  console.log(`audio      ${SAMPLE_RATE} Hz mono FLAC -> ${audio}`);
  run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', opts.input,
    '-ar', String(SAMPLE_RATE),
    '-ac', '1',
    '-map', '0:a:0',
    '-c:a', 'flac',
    audio,
  ], 'ffmpeg normalise');

  if (opts.dryRun) {
    console.log('dry run    ffmpeg done, whispermlx not invoked');
    return;
  }

  const mlxOut = path.join(workDir, 'mlx-out');
  rmSync(mlxOut, { recursive: true, force: true });
  mkdirSync(mlxOut, { recursive: true });

  const args = [
    audio,
    '--model', opts.model,
    '--language', opts.language,
    '--output_format', 'json',
    '--output_dir', mlxOut,
  ];
  if (opts.prompt) args.push('--initial_prompt', opts.prompt.slice(0, 1000));
  if (opts.diarize) {
    if (!opts.hfToken) throw new Error('--diarize needs --hf-token or $HF_TOKEN');
    args.push('--diarize', '--hf_token', opts.hfToken);
  }

  console.log(`model      ${opts.model}, language ${opts.language}`);
  console.log('transcribing (this is the slow part; whispermlx prints its own progress)');
  const startedAt = Date.now();
  run(opts.bin, args, `whispermlx`, 6 * 60 * 60 * 1000);
  const elapsed = (Date.now() - startedAt) / 1000;

  const produced = readdirSync(mlxOut).filter((f) => f.endsWith('.json'));
  if (produced.length === 0) throw new Error(`whispermlx wrote no JSON in ${mlxOut}`);
  const jsonPath = produced.includes('audio.json') ? path.join(mlxOut, 'audio.json') : path.join(mlxOut, produced[0]);

  const { segments, text } = readSegments(jsonPath);
  if (segments.length === 0) throw new Error('transcript has no segments: check that the audio has speech and an audio track');

  const header = [
    '---',
    `source: ${opts.input}`,
    `engine: whispermlx/${opts.model}`,
    `language: ${opts.language}`,
    `audio: ${SAMPLE_RATE} Hz mono FLAC`,
    `duration: ${formatTimestamp(totalDuration)}`,
    `segments: ${segments.length}`,
    `diarized: ${opts.diarize ? 'yes' : 'no'}`,
    `elapsed: ${formatTimestamp(elapsed)}`,
    `speed: ${(totalDuration / elapsed).toFixed(1)}x realtime`,
    `generated: ${new Date().toISOString()}`,
    '---',
    '',
  ].join('\n');

  writeFileSync(transcriptPath, `${header}# Transcript — ${path.basename(opts.out)}\n\n${buildTranscript(segments)}\n`);
  writeFileSync(`${opts.out}.srt`, buildSrt(segments));
  writeFileSync(`${opts.out}.segments.json`, JSON.stringify({
    source: opts.input,
    engine: `whispermlx/${opts.model}`,
    language: opts.language,
    duration: totalDuration,
    elapsedSeconds: Number(elapsed.toFixed(1)),
    diarized: opts.diarize,
    rawText: text,
    segments,
  }, null, 2));

  console.log(`segments   ${segments.length}`);
  console.log(`elapsed    ${formatTimestamp(elapsed)} (${(totalDuration / elapsed).toFixed(1)}x realtime)`);
  console.log(`transcript ${transcriptPath}`);
  console.log(`subtitles  ${opts.out}.srt`);

  if (!opts.keepAudio) rmSync(audio, { force: true });
}

try {
  main();
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
}
