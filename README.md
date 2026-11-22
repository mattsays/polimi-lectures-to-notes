# polimi-lectures-to-notes

A DSH skill that turns Politecnico di Milano Webex lecture recordings plus slides and
handouts into Obsidian-style Markdown notes, following a configurable personal style.

## Status

v1 — pipeline tested end to end: ffmpeg normalisation, chunking, Groq transcription with
a real API key, timestamp merge. Not yet run on a full real lecture. Missing inputs are
listed under *Next steps*.

## Contents

| Path | What it is |
|---|---|
| `SKILL.md` | The skill itself: YAML frontmatter, non-negotiable rules, six-phase flow. |
| `STYLE.md` | Notes style. Binding rules; `[TO CONFIRM]` sections need calibration. |
| `reference/style-calibration.md` | Phase 0: what to ask for, what to observe in real notes, how to turn observations into rules. |
| `reference/pipeline.md` | Phases 0–2: manifest schema, PoliWebex download, Groq transcription, slide extraction and alignment. |
| `reference/extraction.md` | Phase 3: JSON schema, exam-signal taxonomy, coverage check. |
| `reference/templates.md` | Phase 4: Markdown skeletons and course-level files. |
| `scripts/transcribe.mjs` | ffmpeg normalisation, chunking, Groq API calls, timestamp merge. No dependencies. |

## How it is designed

Four choices carry most of the value:

1. **Two passes, not one.** Extraction produces a JSON where every element carries a
   source; writing only lays out that JSON. A single pass lets the model fill gaps from
   its own knowledge, and makes style changes require re-transcribing everything.
2. **Style is learned at intake, not assumed.** The first thing the skill does for a new
   course is ask for two or three existing notes. Every `[TO CONFIRM]` in `STYLE.md` is
   a guess until that happens.
3. **The manifest is the source of truth.** Lesson status decides where to resume, so
   nothing silently restarts from zero. PoliWebex filenames become lesson titles and
   candidate topics, since they usually describe the lecture.
4. **Transcription is a script, not a tool call.** Groq is called directly with its
   documented preprocessing, so the audio pipeline is inspectable, re-runnable and
   independent of any session-level transcription tool.

The parts that make the notes better than a transcript are the slide alignment, the
selection rules and the exam-signal taxonomy — not the speech-to-text.

## Installation

The project root scanned by DSH is `<project>/.dsh/skills/`; the user-wide root is
`~/.dsh/skills/`. DSH discovers `<name>/SKILL.md` at the top level of a root and follows
symlinks, so keep this folder as the single source and link it:

```sh
git clone https://github.com/<you>/polimi-lectures-to-notes ~/tools/polimi-lectures-to-notes
mkdir -p ~/.dsh/skills
ln -s ~/tools/polimi-lectures-to-notes ~/.dsh/skills/polimi-lectures-to-notes
```

Editing files here then updates the skill with no copy step. Only `SKILL.md` is
registered; everything else is a resource loaded on demand.

## Prerequisites

| Requirement | State |
|---|---|
| `ffmpeg` + `ffprobe` | present, 8.1.1 |
| `node` (v18+, for built-in `fetch`) | present, v26 |
| `aria2c` (PoliWebex) | present |
| Groq API key | stored in `~/.config/polimi-lectures/groq.key`, mode 600 |
| PoliWebex cloned and `npm install`-ed | **missing** — clone to `~/tools/PoliWebex` |
| Two or three existing notes for style calibration | **missing** |

The key is read from, in order: `--key-file`, `$GROQ_API_KEY`, `$GROQ_API_KEY_FILE`,
then the default path. It is deliberately outside the workspace so it cannot be committed
or copied into a course folder.

Check the whole setup at any time, without transcribing anything:

```sh
node scripts/transcribe.mjs --check
```

It reports node, ffmpeg, ffprobe, where the key was found, whether its permissions are
too open, and whether Groq accepts it; on failure it prints the setup steps. The key is
**never requested in the conversation**: it is created at console.groq.com/keys and
written by the user in their own terminal, so it never enters a chat, a log or a commit.

`npm install` in PoliWebex downloads its own Chromium through Puppeteer; no system
browser is needed.

## Sizes, measured

16 kHz mono FLAC of real Italian speech runs at about 20 KB/s.

| Input | FLAC size | Verdict |
|---|---|---|
| 10 min | ~12 MB | fine |
| 30 min | ~36 MB | over the 25 MB free tier |
| 90 min | ~108 MB | over the 100 MB dev tier |

This is why 600-second chunks are the default: a lecture does not fit in one request at
any tier, and chunking also isolates retries to a single piece.

## Next steps

1. **PoliWebex.** Clone it, run `npm install`, download one lecture with
   `node poliwebex -v "<url>" -o raw/_incoming`, and confirm the filename → manifest mapping.
2. **Style calibration.** Provide two or three real notes; they fill `STYLE.md` §5 and
   §10 and settle proof depth, notation, images and callouts.
3. **First real run.** One lecture end to end, reviewed, before batch processing.

## Known risks

- Spoken mathematics and numbers are unreliable; the design forces symbolic content to
  come from slides or legible board frames.
- Whisper degrades on long stretches of near-identical audio (repetition loops lose
  accents and punctuation). Lectures are fine; edited compilations of repeated phrases
  are not. `temperature: 0` is already set and Groq does not expose
  `condition_on_previous_text`.
- Scanned or handwritten slides need page rendering, not text extraction.
- Poor audio in some recordings degrades every later phase; catch it at download time
  with `ffprobe` and a spot listen.
- PoliWebex drives a real SPID login: it breaks when PoliMi changes the login flow.
  Treat a failed download as a tool problem, not something to work around.
