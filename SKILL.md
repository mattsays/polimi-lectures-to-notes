---
name: polimi-lectures-to-notes
description: Turns Politecnico di Milano Webex lecture recordings plus slides and handouts into Obsidian-style Markdown notes, transcribing locally on Apple Silicon with whispermlx and following your own writing style.
whenToUse: The user provides PoliMi Webex lecture links (or a WeBeep course) and/or course slides or handouts and asks for notes, transcripts, summaries or study material.
---

# PoliMi lectures to notes

Turn recorded lectures and instructor material into notes you will actually consult.
Transcription is the means, not the product: the value lies in aligning with the slides,
in selecting what matters, and in capturing what the instructor says but never writes.

Everything runs on this machine. There is no API key, no quota and no upload: the only
cost is wall-clock time, so a whole course can be processed without asking anyone.

This skill assumes nothing about the agent running it beyond a shell and file access. When
a step says to run a command, run it. If the harness has no shell, say so and stop rather
than simulating the result.

## Non-negotiable rules

1. **No technical content without a source.** Every definition, formula, theorem and
   worked example carries `source: {timestamp, slide}`. Without a source it does not
   enter the notes.
2. **Formulas and numbers come only from slides or visible board work.** Transcripts get
   subscripts, indices and Greek names wrong. A formula that exists only in speech goes
   to `to_verify`, not into the notes.
3. **Gaps are filled only from the supplied handouts**, citing page or section. Never
   from the model's own knowledge: if the instructor skipped a step and the handout does
   not cover it, record the gap.
4. **Contradictions between lectures are recorded, not silently resolved.**
5. **Downloading and transcribing are batch; writing notes is not.** Process every
   recording first, then write one lesson at a time and get approval before the next.
6. **No transcript pasted into the notes.** If a sentence adds no concept, example or
   trap, it does not belong.
7. **Credentials never enter a file.** The PoliMi SPID session and any Hugging Face token
   stay out of manifests, scripts, command examples and notes.
8. **You own the setup.** If a dependency is missing, install it (phase 1) instead of
   reporting it and stopping. Say what you are about to download and roughly how large it
   is, then proceed.

## On activation

The first message after this skill is invoked is the intake. Nothing gets installed,
downloaded, transcribed or written before it is answered.

Read the user's message first, then ask **only for what is missing**, once, in the
user's language. If the user already sent links or slides, do not ask for them again:
confirm in one line and move on.

Canonical content, rendered in the user's language:

> Before I start I need four things, and one answer covers them all.
>
> 1. **The course** — its name and the recordings. Either a `.txt` file with one Webex URL
>    per line, or the links pasted directly into the message.
> 2. **The handouts** — the instructor's slides or notes as PDF, if they exist. Without
>    them I can still write notes, but formulas and figures become less reliable.
> 3. **Two or three of your existing notes**, in any format, photos included. I read them
>    to match how you already write: whether you use images, heading style, how dense the
>    prose is, how you lay out exercises. If you have none, say so — I will propose a
>    style and we will correct it on the first lesson.
> 4. **Which recordings are theory and which are exercise sessions**, but only if the
>    titles do not make it obvious.
>
> Everything runs locally: no accounts, no API keys, no uploads. The first run installs a
> few tools (about 1 GB of models) and transcribes on this Mac, so the whole course stays
> on disk.
>
> Then I will download every recording, transcribe them all, and start writing notes one
> lesson at a time so you can judge the first result before I continue.

Rules for this message:

- **Do not re-ask for an existing course.** If the course folder already holds a
  `manifest.json`, skip the intake entirely and open with what is left: which lesson you
  are resuming from, its status, and the open issues.
- **Ask once.** If an answer is partial, proceed with what you have and record the gap in
  `manifest.open_issues`. Never ask the same thing twice.
- **Never ask for credentials.** There are none to ask for; the Webex session comes from
  the user's own browser, once, and the instructions are in `reference/pipeline.md` §2.
- **Never ask what you can find out**: the course name from a WeBeep URL, the lesson type
  from a filename, the lesson count from the links.
- **If the user says "just start"**, start: write the first lesson with the proposed
  defaults, keep `STYLE.md` marked uncalibrated, and calibrate at the first checkpoint.
- **Name the next step**: after the answers, say what you are about to do before doing it.

## Supporting files

Read only what the current phase needs, not everything up front.

| File | When to read it |
|---|---|
| `STYLE.md` | Before writing any notes. Single source of style truth. |
| `reference/style-calibration.md` | Phase 0, the first time a course is proposed. |
| `reference/pipeline.md` | Phases 1–3: installation, PoliWebex download, local transcription, slide extraction and alignment. |
| `reference/extraction.md` | Phase 4: JSON schema, exam-signal taxonomy, coverage check. |
| `reference/templates.md` | Phase 4: Markdown skeletons for theory and exercise sessions. |
| `scripts/transcribe.mjs` | Phase 3. Run it; read it only when it fails. |
| `scripts/poliwebex-cookie.mjs` | Phase 2, only when PoliWebex asks for a password. |
| `scripts/check-notes.mjs` | Phase 4, before showing any note to the user. |

## Flow

### Phase 0 — Intake and style calibration
The request itself is defined in *On activation*. This phase is what to do with the
answers, and it happens once per course.

1. **Build the skeleton**: course folder and `manifest.json` per `reference/pipeline.md`
   §1, every lesson `status: todo`. Derive titles, ids and types from filenames where the
   titles carry them.
2. **Calibrate the style** from the sample notes, following
   `reference/style-calibration.md`: observe, turn observations into rules, write them
   into `STYLE.md` in place, record the source in its Changelog.
3. **State the plan** in two lines: how many lessons, what you do first, what is missing.

Missing inputs degrade the output in known ways. Say which one applies rather than
pretending the result is unaffected:

| Missing | Consequence | What to do |
|---|---|---|
| Sample notes | the style is guessed | mark `STYLE.md` uncalibrated, calibrate at the first checkpoint |
| Slides or handouts | no reliable source for formulas, alignment degrades | every formula goes to `to_verify`, notes cite timestamps only |
| Lesson types | the theory/exercise split is unknown | keep everything under `teoria/`, resolve it after the first read |

### Phase 1 — Bootstrap
Make the machine capable of the whole job before touching a single lecture. Run the
preflight, install what is missing, and verify again:

```sh
node scripts/transcribe.mjs --check
```

| Missing | Install | Size |
|---|---|---|
| `whispermlx` | `uv tool install whispermlx` (or a dedicated venv) | model ~1 GB on first run |
| `ffmpeg`, `ffprobe` | `brew install ffmpeg` | small |
| PoliWebex | `git clone https://github.com/sup3rgiu/PoliWebex ~/tools/PoliWebex && cd ~/tools/PoliWebex && npm install` | ~150 MB (bundled Chromium) |

Install in that order and re-run the preflight until it is green. If `uv` is absent, use
`python3 -m venv ~/.venvs/mlx && ~/.venvs/mlx/bin/pip install whispermlx` and pass
`--whispermlx ~/.venvs/mlx/bin/whispermlx` on every call; record that path in the manifest
so later runs do not have to guess.

Do not install anything else. No API keys, no cloud accounts: this pipeline has none.

### Phase 2 — Download everything
Use PoliWebex as described in `reference/pipeline.md` §2. First normalise the links into
`links.txt` in the course folder, one URL per line, whether they arrived pasted in the chat
or as a file: that is what PoliWebex consumes and what a re-download points at.

Download the whole batch, not one file at a time — it is a slow, unattended step. Then map
each produced file to a lesson id and rename it to `raw/L01.mp4`.

If PoliWebex prints `Cookie is not valid` or asks for a password, stop and read
`reference/pipeline.md` §2: the account probably signs in with CIE, and the fix is a
browser cookie the user supplies once. Never ask for a password, never attempt the login.

### Phase 3 — Transcribe everything
Transcribe every lesson before writing any note. This is unattended work, and doing it in
one pass means the slow part is over before the interesting part starts.

```sh
node scripts/transcribe.mjs raw/L01.mp4 --out work/L01 --prompt-file work/glossary.txt
```

One invocation per lecture: whispermlx does its own VAD chunking, so there is nothing to
split and no offsets to reconstruct. An existing transcript is skipped unless `--force` is
passed, which makes the loop resumable. Keep `work/glossary.txt` current — the glossary
improves technical terms more than any other single change.

The language defaults to `en` and is never auto-detected; pass `--language it` for an
Italian course.

Then extract slide text and build the slide ↔ time map:

```sh
pdftotext -layout assets/L01.pdf work/L01-slides.txt
node scripts/align.mjs --segments work/L01.segments.json --slides work/L01-slides.txt \
                       --out work/L01.alignment.json
```

`reference/pipeline.md` §5–6 explains the heuristics and what they cannot do; check the
`low` confidence entries against the rendered pages.

### Phase 4 — Notes, one lesson at a time
Now the loop that produces deliverables. For each lesson, in order:

1. **Extract** `work/<id>.json` from transcript plus slides, following
   `reference/extraction.md`. No Markdown in this step.
2. **Write** the Markdown per `STYLE.md` and `reference/templates.md`. Nothing is added
   that is not in the JSON.
3. **Check before showing it**: `node scripts/check-notes.mjs <course> --lesson L01`.
   Errors are yours to fix — a source-less concept, an example without a result, a
   dangling wikilink. Warnings get mentioned to the user, not silently ignored.
4. **Checkpoint**: present the file with a three-line summary — what it contains, which
   `to_verify` items remain open, what you think is missing. Ask for confirmation before
   the next lesson.
5. **Fold corrections back** into `STYLE.md`, not only into that file, so they hold for
   every later lesson.

Never write lesson five before lesson one has been approved.

### Phase 5 — Course merge
Once the lessons are done, update `_glossario.md`, `_indice.md` and `_errori-esame.md`,
and the cross-links between theory and exercise sessions.

## Expected output

```
<course>/
├── README.md            index, status, how to regenerate
├── manifest.json        source of truth for the lessons
├── links.txt            the requested recordings, one URL per line
├── teoria/L01-….md
├── esercitazioni/E01-….md
├── _glossario.md
├── _indice.md
├── _errori-esame.md
├── work/glossary.txt    terms fed to the transcription prompt
└── raw/ work/ assets/   regenerable, never deliverables
```

`teoria/` and `esercitazioni/` hold deliverables only. A mixed session goes where most of
its time is spent, and the frontmatter says so.

## Time

There is no quota, so the only limit is how long this machine takes. The transcript header
records the measured speed (`speed: Nx realtime`) for every lecture: use the first real
measurement to estimate the rest instead of guessing, and tell the user before starting a
long batch. Do not run whispermlx on several lectures in parallel — MLX saturates the GPU
and concurrent runs are slower, not faster.

## Regeneration

The manifest and the intermediate JSON exist for this: if `STYLE.md` changes, rerun phase
4 only. If the model or the transcript changes, rerun from phase 3. Never restart from
phase 0 without a reason.
