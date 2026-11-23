# polimi-lectures-to-notes

A portable agent skill that turns Politecnico di Milano Webex lecture recordings plus
slides and handouts into Obsidian-style Markdown notes, following your own writing style.

Everything runs locally on Apple Silicon. No API keys, no accounts, no quota, no upload:
the recordings never leave the machine, and the only cost is wall-clock time.

## Status

v1 — download and transcription verified end to end; the note-writing phases tested on
fixtures, not yet on a full real course.

## Contents

| Path | What it is |
|---|---|
| `SKILL.md` | The skill itself: frontmatter, intake on activation, six phases, non-negotiable rules. |
| `STYLE.md` | Notes style. Binding rules; `[TO CONFIRM]` sections need calibration. |
| `reference/style-calibration.md` | Phase 0: what to ask for, what to observe in real notes, how to turn observations into rules. |
| `reference/pipeline.md` | Phases 1–3: manifest, installation, PoliWebex download, local transcription, slide extraction and alignment. |
| `reference/extraction.md` | Phase 4: JSON schema, exam-signal taxonomy, coverage check. |
| `reference/templates.md` | Phase 4: Markdown skeletons and course-level files. |
| `scripts/transcribe.mjs` | ffmpeg normalisation, whispermlx invocation, transcript and subtitle output, preflight. |
| `scripts/align.mjs` | Maps slides to the moments they are discussed, from lexical overlap and verbal cues. |
| `scripts/check-notes.mjs` | Lints the extraction JSON and the notes against the skill's rules. |
| `scripts/poliwebex-cookie.mjs` | Stores a Webex session cookie, for accounts that sign in with CIE instead of a password. |

## How it is designed

1. **Two passes, not one.** Extraction produces a JSON where every element carries a
   source; writing only lays out that JSON. A single pass lets the model fill gaps from
   its own knowledge, and makes style changes require re-transcribing everything.
2. **Style is learned at intake, not assumed.** The first thing the skill does for a new
   course is ask for two or three existing notes. Every `[TO CONFIRM]` in `STYLE.md` is a
   guess until that happens.
3. **The manifest is the source of truth.** Lesson status decides where to resume, so
   nothing silently restarts from zero.
4. **Batch before interactive.** Every recording is downloaded and transcribed first, in
   one unattended pass; then notes are written one lesson at a time with a checkpoint.
   The slow, boring part finishes before the interesting part starts.

The parts that make the notes better than a transcript are the slide alignment, the
selection rules and the exam-signal taxonomy — not the speech-to-text.

## Requirements

| Requirement | Why |
|---|---|
| Apple Silicon Mac | whispermlx runs on MLX; there is no CUDA path and no x86 path |
| `node` 18 or newer | both scripts use built-in `fetch` |
| `ffmpeg` + `ffprobe` | audio normalisation, duration checks |
| `whispermlx` | local transcription (Python package) |
| `aria2c` | PoliWebex uses it for downloading |
| PoliWebex | SPID login and the actual Webex download |

Nothing here calls a harness API, an MCP server or a proprietary tool. Any agent that can
read these files and run a shell command can execute it.

## Quickstart

1. **Transcription engine** — `uv tool install whispermlx` (its own environment, not the
   system Python). The model downloads on first use: ~1 GB.
2. **Media tools** — `brew install ffmpeg`.
3. **Downloader** —
   `git clone https://github.com/sup3rgiu/PoliWebex ~/tools/PoliWebex && cd ~/tools/PoliWebex && npm install`
   (~150 MB of bundled Chromium).
4. **Webex session** — the first download needs a browser cookie, once; see below.
5. **Verify** — `node scripts/transcribe.mjs --check`
6. **Run one lecture end to end** before trusting it with a whole course.

### Webex session

PoliWebex automates a username+password form, so an account that signs in with CIE on a
phone never gets through: it keeps asking for a password, and the browser lands on the
Webex home page instead of the recording. It does reuse a stored cookie, so give it one.

1. Sign in to Webex in Chrome as usual, then open any recording page.
2. DevTools → Network → right-click any request to `politecnicomilano.webex.com` →
   **Copy as cURL**.
3. `node scripts/poliwebex-cookie.mjs` → paste → Ctrl-D.

The helper pulls the cookie out of the pasted command, checks it against Webex, and only
then writes it into `~/tools/PoliWebex/config.json` (override with `--poliwebex <dir>` or
`$POLIWEBEX_DIR`). It is never echoed and never enters the shell history. Run `--check`
when downloads start failing again: cookies expire, typically once per study session.

The `X11 is not installed` warning from keytar is harmless on macOS, and `-k` silences it.

## Install

The contract is simple: a folder containing `SKILL.md`. Where it goes depends on the
harness.

**Any agent, no discovery.** Clone it anywhere and open your agent in that folder:

```sh
git clone https://github.com/mattsays/polimi-lectures-to-notes ~/tools/polimi-lectures-to-notes
cd ~/tools/polimi-lectures-to-notes
# then start your agent here and use the activation prompt below
```

**Harnesses with automatic skill discovery** scan a skills directory for `<name>/SKILL.md`.
Keep one clone as the source and link it, so edits apply immediately:

```sh
mkdir -p ~/.dsh/skills                       # DSH
ln -s ~/tools/polimi-lectures-to-notes ~/.dsh/skills/polimi-lectures-to-notes

mkdir -p .claude/skills                      # Claude Code, project scope
ln -s ~/tools/polimi-lectures-to-notes .claude/skills/polimi-lectures-to-notes
```

Check your harness's documentation for its exact root; the only requirement is that
`SKILL.md` sits at the top level of the skill folder.

### What is harness-specific

| Item | Portable? |
|---|---|
| `SKILL.md`, `STYLE.md`, the four references | yes, plain Markdown |
| `scripts/*.mjs` | yes, node standard library only |
| Discovery path and the `whenToUse` frontmatter key | depends: DSH reads it, other harnesses ignore it |
| `name` + `description` frontmatter | used by most skill-capable harnesses |

If a harness ignores `whenToUse`, add the trigger sentence to the activation prompt you
paste instead.

## Copy-paste activation prompt

Keep it to a pointer plus your inputs. Everything else lives in `SKILL.md`, and restating
it here would create a second copy to keep in sync — the kind of duplication that goes
stale the first time the skill changes.

```
Skill: https://github.com/mattsays/polimi-lectures-to-notes

Course: <name>
Links: <path to a .txt with one Webex URL per line, or paste the links here>
Handouts: <path or attachments: the instructor's slides, notes, handouts or book chapters>
My notes: <attach or paste what you have>
```

Italian:

```
Skill: https://github.com/mattsays/polimi-lectures-to-notes

Corso: <nome>
Link: <percorso di un .txt con un link Webex per riga, oppure incolla i link qui>
Dispense: <percorso o allegati: slide, appunti, dispense o capitoli del professore>
I miei appunti: <allega o incolla quello che hai>
```

Handouts and your notes are not the same input and the skill treats them differently:
handouts are the source of truth for formulas, figures and definitions, while your notes
are only a style reference.

That is the whole prompt: where the skill is, and the inputs. Fetching it, reading
`SKILL.md` and running its intake are the agent's job, not instructions to repeat — a
capable agent resolves a URL and reads the skill it points at. If it does not, that is
worth knowing before trusting it with a whole course.

If the agent reads the file and still drifts — asks for an API key, skips the intake,
starts writing before calibrating — that is an agent or harness problem. Fix it there,
not by inflating the prompt.

## Transcription

```sh
node scripts/transcribe.mjs raw/L01.mp4 --out work/L01 \
  --prompt-file work/glossary.txt
```

The language is `en` by default and never auto-detected: pass `--language it` for an
Italian course. A wrong guess is silent, while a wrong flag is obvious.

One invocation per lecture. whispermlx is a [WhisperX](https://github.com/m-bain/whisperX)
fork on [MLX](https://github.com/ml-explore/mlx): word-level timestamps and VAD come for
free, and it does its own internal chunking, so there is nothing to split here and no
offsets to reconstruct.

| Output | Content |
|---|---|
| `work/L01.transcript.md` | header plus `[HH:MM:SS]` blocks |
| `work/L01.srt` | segment subtitles, for jumping to a moment |
| `work/L01.segments.json` | segments plus the measured speed |
| `work/L01.work/` | normalised audio and engine output, regenerable |

An existing transcript is skipped unless `--force` is passed, so a batch interrupted at
lesson 7 restarts at lesson 7. `--initial_prompt` takes the course glossary and is the
cheapest accuracy win available.

Word-level alignment is **off by default** (`--align` turns it on). It buys word timestamps
this pipeline does not use — slide alignment works on segment timestamps — and it costs two
extra downloads plus two extra failure modes: a wav2vec2 model of ~380 MB and NLTK's
`punkt_tab` data. During testing the alignment stage failed twice on exactly those, after
the transcription itself had already succeeded.

Model choice: `large-v3-turbo` (~1 GB) by default, `large-v3` (~3 GB) when the material is
dense with formulas. Both are downloaded once and cached.

## Checking notes

```sh
node scripts/check-notes.mjs <course>            # every lesson
node scripts/check-notes.mjs <course> --lesson L01
```

It enforces what a person reliably forgets to check: a concept, example or trap with no
source; an example without a result; a `to_verify` entry that does not say what is
uncertain; a lesson marked `written` whose files do not exist; missing frontmatter;
headings deeper than `###`; callouts outside the allowed set; wikilinks that point at
nothing. Errors fail the run, warnings are worth reading.

## Time, not quota

There is no usage limit, so the only constraint is how long the machine takes.

Measured on an M1 with `large-v3-turbo`, no alignment: **5.7× realtime** (241 s of audio in
42 s). That puts a 90-minute lecture at about **16 minutes** and a 40-hour course at about
**7 hours** of wall clock.

Every transcript records its own measurement in the header (`speed: Nx realtime`), so the
first real lecture on a different machine replaces these numbers with its own. Use that
figure to estimate a batch and tell the user before starting it.

Do not run lectures in parallel — MLX saturates the GPU, and two concurrent runs are slower
than two sequential ones.

## Next steps

1. **First real course.** One lecture end to end — download, transcribe, notes — and
   review before the batch.
2. **Style calibration.** Two or three real notes fill `STYLE.md` §5 and §10 and settle
   proof depth, notation, images and callouts.
3. **Re-measure on a full lecture.** The 5.7× figure comes from a four-minute fixture; a
   90-minute file may differ slightly once the model stays warm.

## Known risks

- Spoken mathematics and numbers are unreliable; the design forces symbolic content to
  come from slides or legible board frames.
- Whisper hallucinates in dead air: two seconds of pure silence, at `temperature: 0`,
  returned `" Thank you."`. The extraction phase drops stock phrases and records them in
  `dropped_hallucinations`.
- Scanned or handwritten slides need page rendering, not text extraction.
- Poor audio in some recordings degrades every later phase; catch it at download time with
  `ffprobe` and a spot listen.
- PoliWebex drives a real SPID login: it breaks when PoliMi changes the login flow, and it
  cannot handle CIE (phone) logins at all. Use `scripts/poliwebex-cookie.mjs` to inject a
  browser session cookie instead.
- whispermlx tracks WhisperX upstream: a fork can lag behind fixes, and the MLX path has
  no CUDA equivalent, so this pipeline is Apple Silicon only by design.

## Credits

**PoliWebex** — <https://github.com/sup3rgiu/PoliWebex> — by
[@sup3rgiu](https://github.com/sup3rgiu) and contributors
([@yuyu-19](https://github.com/yuyu-19), [@1alessandro1](https://github.com/1alessandro1),
[@GiorgioUghini](https://github.com/GiorgioUghini)), MIT licensed.

It does the hard part of this pipeline: the SPID login and the Webex download. This skill
invokes it as an external tool and does not redistribute its code, but the whole first
phase exists because that project works.

**whispermlx** — <https://github.com/KalebJS/whispermlx> — a WhisperX fork running on
[MLX](https://github.com/ml-explore/mlx), which does the transcription locally. Built on
[WhisperX](https://github.com/m-bain/whisperX) by Max Bain et al.,
[mlx-whisper](https://github.com/ml-explore/mlx-examples/tree/main/whisper),
[pyannote-audio](https://github.com/pyannote/pyannote-audio) and
[OpenAI Whisper](https://github.com/openai/whisper).

The rest of the pipeline stands on [ffmpeg](https://ffmpeg.org).
