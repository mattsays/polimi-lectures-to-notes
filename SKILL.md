---
name: polimi-lectures-to-notes
description: Turns Politecnico di Milano Webex lecture recordings plus slides and handouts into Obsidian-style Markdown notes that follow STYLE.md, separating theory from exercise sessions and capturing worked examples, exam traps and in-class questions.
whenToUse: The user provides one or more PoliMi Webex lecture recording links (or a WeBeep course) and/or course slides or handouts and asks for notes, transcripts, summaries or study material.
---

# PoliMi lectures to notes

Turn recorded lectures and instructor material into notes you will actually consult.
Transcription is the means, not the product: the value lies in aligning with the slides,
in selecting what matters, and in capturing what the instructor says but never writes.

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
5. **One lesson at a time.** Do not write the notes for a lesson before the user has
   approved the previous one, unless a full batch run was explicitly requested.
6. **No transcript pasted into the notes.** If a sentence adds no concept, example or
   trap, it does not belong.
7. **Credentials never enter a file.** The PoliMi SPID password stays in the system
   keyring: never write it into the manifest, a script, a command example or a note.

## On activation

The first message after this skill is invoked is the intake. Nothing gets downloaded,
transcribed or written before it is answered.

Read the user's message first, then ask **only for what is missing**, once, in the
user's language. If the user already sent links or slides, do not ask for them again:
confirm in one line and move on.

Canonical content, rendered in the user's language:

> Before I start I need four things, and one answer covers them all.
>
> 1. **The course** — its name and, if you have it, the WeBeep page or the list of Webex
>    recording links.
> 2. **The handouts** — the instructor's slides or notes as PDF, if they exist. Without
>    them I can still write notes, but formulas and figures become less reliable.
> 3. **Two or three of your existing notes**, in any format, photos included. I read them
>    to match how you already write: whether you use images, heading style, how dense the
>    prose is, how you lay out exercises. If you have none, say so — I will propose a
>    style and we will correct it on the first lesson.
> 4. **Which recordings are theory and which are exercise sessions**, but only if the
>    titles do not make it obvious.
>
> I will not ask for your SPID password: the first Webex download runs in your terminal,
> once, and after that it stays in your keychain.
>
> Then I will build the course manifest from the titles, calibrate the style on your
> notes, and take one lecture end to end so you can judge the result before I process the
> rest.

Rules for this message:

- **Do not re-ask for an existing course.** If the course folder already holds a
  `manifest.json`, skip the intake entirely and open with what is left: which lesson you
  are resuming from, its status, and the open issues.
- **Ask once.** If an answer is partial, proceed with what you have and record the gap in
  `manifest.open_issues`. Never ask the same thing twice.
- **Never request credentials**, and never offer to run the first PoliWebex login.
- **Never ask what you can find out**: the course name from a WeBeep URL, the lesson type
  from a filename, the lesson count from the links.
- **If the user says "just start"**, start: write the first lesson with the proposed
  defaults, keep `STYLE.md` marked uncalibrated, and calibrate at the phase 5 checkpoint.
- **Run the preflight before promising anything.** `node scripts/transcribe.mjs --check`
  verifies ffmpeg, ffprobe, node, the key and whether the API accepts it, in a second.
  If the key is missing or rejected, hand the user the setup steps and let them run them
  in their own terminal. Never ask for the key value, and never write it into a file on
  their behalf: you would need the secret in the conversation first.
- **If the user pastes a key into the chat anyway**, tell them to rotate it at
  console.groq.com/keys and store the new one locally.
- **Name the next step**: after the answers, say what you are about to do before doing it.

## Supporting files

Read only what the current phase needs, not everything up front.

| File | When to read it |
|---|---|
| `STYLE.md` | Before writing any notes. Single source of style truth. |
| `reference/style-calibration.md` | Phase 0, the first time a course is proposed. |
| `reference/pipeline.md` | Phases 0–2: manifest, PoliWebex, audio prep, Groq transcription, slide alignment. |
| `reference/extraction.md` | Phase 3: JSON schema, exam-signal taxonomy, coverage check. |
| `reference/templates.md` | Phase 4: Markdown skeletons for theory and exercise sessions. |
| `scripts/transcribe.mjs` | Phase 2. Run it; read it only when it fails. |

## Flow

### Phase 0 — Intake and style calibration
The request itself is defined in *On activation*. This phase is what to do with the
answers. It is blocking, and it happens once per course.

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

### Phase 1 — Download
Use PoliWebex as described in `reference/pipeline.md` §2. If `~/tools/PoliWebex` is not
installed, say so and ask before cloning anything. Never attempt to scrape Webex
yourself, never bypass the SPID login.

PoliWebex names files after the video title, and those titles usually describe the
lecture. Derive `id`, `type` (theory vs exercise session), `title` and candidate
`topics` from the filename before transcribing: it costs nothing and it seeds both the
manifest and the glossary. Then rename to `raw/L01.mp4`, validate with `ffprobe` and
record duration.

### Phase 2 — Transcription and alignment
Transcribe with `scripts/transcribe.mjs`, which calls the Groq API directly:

```sh
node scripts/transcribe.mjs raw/L01.mp4 --out work/L01 --language it \
  --prompt-file work/glossary.txt
```

The key is resolved automatically from `--key-file`, then `$GROQ_API_KEY`, then
`~/.config/polimi-lectures/groq.key`: never ask the user to paste it into the conversation.

If the script reports no key, tell the user exactly this and stop: create one at
console.groq.com/keys, then in their terminal
`mkdir -p ~/.config/polimi-lectures`, write the key to
`~/.config/polimi-lectures/groq.key`, `chmod 600` it, and re-run `--check`.

It normalises to 16 kHz mono FLAC, cuts inside silences where possible, keeps every
upload below the limit, timestamps every segment and merges. Keep `work/glossary.txt`
current: the glossary prompt is the cheapest accuracy win available. Then extract slide
text and build the slide ↔ time map as described in `reference/pipeline.md` §5–6.

### Phase 3 — Structured extraction
Produce `work/<id>.json` from transcript plus slides, following the schema in
`reference/extraction.md`. Write no Markdown in this phase. Apply the exam-signal
taxonomy: this is the step that decides whether the notes are worth anything.

### Phase 4 — Writing
Render the JSON into Markdown according to `STYLE.md` and `reference/templates.md`.
Nothing is added that is not in the JSON; this phase only lays out.

### Phase 5 — Checkpoint
Present the finished file with a three-line summary: what it contains, which `to_verify`
items remain open, what you think is missing. Ask for confirmation or corrections before
moving to the next lesson. Style corrections go back into `STYLE.md`, not only into that
one file, so they hold for every later lesson.

### Phase 6 — Course merge
Once the lessons are done, update `_glossario.md`, `_indice.md` and `_errori-esame.md`,
and the cross-links between theory and exercise sessions.

## Expected output

```
<course>/
├── README.md            index, status, how to regenerate
├── manifest.json        source of truth for the lessons
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

## Cost and speed

Groq `whisper-large-v3-turbo` costs $0.04 per audio hour, so a 40-hour course is under
two dollars. Upload is the bottleneck, not transcription: process one lecture at a time
and keep the transcript on disk so nothing is ever paid for twice.

## Regeneration

The manifest and the intermediate JSON exist for this: if `STYLE.md` changes, rerun phase
4 only. If the transcription engine changes, rerun from phase 2. Never restart from phase
0 without a reason.
