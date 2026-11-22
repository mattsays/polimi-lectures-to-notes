# Pipeline reference

Operational detail for phases 1–3. Verified tooling on this machine: `ffmpeg`,
`ffprobe`, `pdftotext`, `pdftoppm`, `pdfinfo`, `node`, `aria2c`, `uv`.

## 1. `manifest.json`

The manifest is the source of truth for the course. Notes are never edited without
updating the matching entry: it is what makes resuming and regeneration possible.

```json
{
  "course": {
    "name": "Metodi Numerici",
    "slug": "metodi-numerici",
    "institution": "Politecnico di Milano",
    "language": "it",
    "created": "2026-11-22"
  },
  "transcription": {
    "engine": "whispermlx",
    "model": "large-v3-turbo",
    "language": "it",
    "bin": null,
    "glossary_prompt": "spline, interpolazione, Runge, nodi di Chebyshev, ..."
  },
  "download": {
    "tool": "PoliWebex",
    "path": "~/tools/PoliWebex",
    "output_dir": "raw/_incoming",
    "links_file": "links.txt"
  },
  "lessons": [
    {
      "id": "L01",
      "type": "theory",
      "title": "Interpolazione polinomiale",
      "date": "2026-03-01",
      "url": "https://politecnicomilano.webex.com/recordingservice/…",
      "duration_s": null,
      "video": "raw/L01.mp4",
      "slides": ["assets/L01.pdf"],
      "handouts": [],
      "transcript": "work/L01.transcript.md",
      "subtitles": "work/L01.srt",
      "alignment": "work/L01.alignment.json",
      "extraction": "work/L01.json",
      "notes": "teoria/L01-interpolazione-polinomiale.md",
      "status": "todo",
      "open_issues": []
    }
  ]
}
```

`status` values, in order: `todo` → `downloaded` → `transcribed` → `aligned` →
`extracted` → `written` → `reviewed`. The status is the resume point: never jump ahead
silently, and record every unresolved doubt in `open_issues`.

`transcription.bin` records the whispermlx path when it is not on `PATH` (a virtualenv),
so later runs and later sessions do not have to rediscover it.

## 2. Download with PoliWebex

<https://github.com/sup3rgiu/PoliWebex> handles the Politecnico SPID login, the Webex
session and the actual download. It is not vendored into this skill: clone it once into
a stable location and keep it out of the course folder. Written by @sup3rgiu and
contributors, MIT licensed: credit it when you report results to the user.

```sh
git clone https://github.com/sup3rgiu/PoliWebex ~/tools/PoliWebex
cd ~/tools/PoliWebex && npm install && node poliwebex.js -h
```

`npm install` pulls Puppeteer, which fetches its own Chromium: the system browser is not
required. Prerequisites: `aria2c` and `ffmpeg` on `PATH`, plus Node above v14.

Note the entry point is `poliwebex.js`, not `poliwebex`.

Single recording:

```sh
cd ~/tools/PoliWebex
node poliwebex.js -v "<webex-url>" -o "<course>/raw/_incoming"
```

The whole batch, one URL per line:

```sh
node poliwebex.js -f links.txt -o "<course>/raw/_incoming"
```

`links.txt` lives in the course folder, one URL per line, and is the canonical record of
what was requested. Whatever form the links arrived in — pasted into the chat, a text file,
a WeBeep page — normalise them into that file first, so a re-download months later does not
depend on scrolling a conversation.

Useful flags:

| Flag | When |
|---|---|
| `-w <pwd>` | recording protected by a video password |
| `-i 2` | slow connection, login times out |
| `-k` | do not store the SPID password in the system keyring |
| `-e name.surname@mail.polimi.it` | login needs the PoliMi address |

### From filename to manifest entry

PoliWebex names files after the video title, and those titles usually describe the
content of the lecture. Use them: derive `title`, `topics` and the lesson `type` from the
filename before transcribing anything, because it costs nothing and it seeds the glossary.

```
Lesson number 12 - Interpolazione polinomiale e fenomeno di Runge.mp4
Esercitazione 3 - Esercizi su spline e minimi quadrati.mp4
```

- `id`: sequence number, `L12` for theory, `E03` for exercise sessions.
- `type`: `exercise` if the title contains "esercitazione", "esercizi", "laboratorio";
  otherwise `theory`. Ambiguous titles get asked about, since they decide which folder the
  notes end up in.
- `title`: the descriptive part of the filename, cleaned of the "Lesson number N -" prefix.
- `topics`: split the descriptive part on "e", ",", " - " into candidate topics. These are
  candidates, not final: fix them after the extraction phase, when you know what was
  actually covered.
- `date`: take it from the Webex page or the file mtime, never invented.
- Rename to `raw/L01.mp4` and record both the original filename and the final path, so a
  re-download can be matched to the right lesson.

Download in batches, then map and rename. Do not rename inside `_incoming` while a
download is still running.

- **Validate what came back**:
  `ffprobe -v error -show_entries format=duration -of csv=p=0 raw/L01.mp4`
  A missing audio stream or a duration far from the expected lesson length means the
  download or the recording is broken: stop and report, do not transcribe silence.
- **Check for a native transcript first.** If the recording page also offers a Webex
  transcript or captions, use it and skip phase 3 entirely.
- Downloads are slow and long: run them as a background job, one batch at a time.

### When the download does not start

The most common failure is not the tool and not this skill: it is authentication.

| Output | Meaning | Fix |
|---|---|---|
| `Cookie is not valid` then a password prompt | logged out, no saved password | see *Accounts that sign in with CIE* below |
| the command hangs after that prompt | stdin is not a TTY: an agent or a pipe swallowed it | it must be run by the user, in their own terminal |
| `Can't find video ID` | URL has no 32-character recording id | copy the URL from the recording page |
| `This video does not exist` | wrong id, or not shared with the account | check the recording is online and visible |
| login loop / timeout | SPID flow changed, or slow connection | retry with `-i 2` |

Never pipeline PoliWebex into another command on first run: `node poliwebex.js … | tail`
loses the interactive prompt and looks like a hang.

### Accounts that sign in with CIE

PoliWebex automates a username+password form. If the account authenticates with CIE on a
phone, there is no password to fill, so it can never get past login — whatever you type,
it comes back asking for a password, and the browser ends up on the Webex home page
instead of the recording.

Do not fight it: skip its login entirely. PoliWebex stores the session in `config.json`
under `cookie` and reuses it while valid, so a cookie captured from a normal browser
session is enough.

1. Log into Webex with CIE in Chrome, then open any recording page.
2. DevTools → Network → right-click any request to `politecnicomilano.webex.com` →
   **Copy as cURL**.
3. `node scripts/poliwebex-cookie.mjs`, paste it, press Ctrl-D. The helper pulls the
   cookie out of the pasted command, validates it against Webex, and writes it into
   `~/tools/PoliWebex/config.json`; it is never echoed back and never enters the shell
   history.
4. `node poliwebex.js -v "<url>" -o "<course>/raw/_incoming"` now prints `Cookie is valid`
   and asks for nothing.

Cookies expire — typically after a few hours or a browser restart. When downloads start
failing again, `node scripts/poliwebex-cookie.mjs --check` says so and you repeat step 2.
Expect to redo this once per study session, not once per lecture.

The `X11 is not installed` message from keytar is harmless noise on macOS: it means the
password cannot be stored in the keychain. With a valid cookie there is no password to
store.

## 3. Bootstrap

The whole pipeline is local, so setup is just three tools. Check, install, re-check.

```sh
node scripts/transcribe.mjs --check
```

| Missing | Command | Notes |
|---|---|---|
| `whispermlx` | `uv tool install whispermlx` | Python package; needs its own environment |
| `ffmpeg`, `ffprobe` | `brew install ffmpeg` | also used for audio normalisation |
| PoliWebex | see §2 | ~150 MB of bundled Chromium |

Without `uv`, use a virtualenv and pass the binary explicitly:

```sh
python3 -m venv ~/.venvs/mlx
~/.venvs/mlx/bin/pip install whispermlx
node scripts/transcribe.mjs --check --whispermlx ~/.venvs/mlx/bin/whispermlx
```

Record that path as `transcription.bin` in the manifest once, so every later call reuses it.

The model is downloaded from Hugging Face on first use: about 1 GB for `large-v3-turbo`,
about 3 GB for `large-v3`. It is cached afterwards, so the download happens once per
machine.

## 4. Local transcription

```sh
node scripts/transcribe.mjs raw/L01.mp4 --out work/L01 \
  --language it --prompt-file work/glossary.txt
```

What it does: normalises the media to 16 kHz mono FLAC with `ffmpeg`, runs whispermlx once
over the whole file, and turns the JSON it writes into:

| File | Content |
|---|---|
| `work/L01.transcript.md` | header plus `[HH:MM:SS]` blocks of about 45 seconds |
| `work/L01.srt` | segment-level subtitles for jumping to a moment |
| `work/L01.segments.json` | machine-readable segments, with the measured speed |
| `work/L01.work/` | normalised audio and whispermlx output, regenerable |

One invocation per lecture, deliberately. whispermlx is a WhisperX fork and performs its
own VAD chunking internally, so splitting the file here would only add offsets to
reconstruct and boundaries that cut words. There is no upload limit to respect either: this
is the local engine.

Model choice:

| Model | Download | Use it when |
|---|---|---|
| `large-v3-turbo` | ~1 GB | default: much faster, fine for lecture prose |
| `large-v3` | ~3 GB | dense derivations, heavy jargon, or if turbo keeps mangling numbers |

Measured on an M1 with turbo and no alignment: **5.7× realtime**, so a 90-minute lecture is
about 16 minutes and a 40-hour course about 7 hours. Each transcript records its own
measurement, so trust the header over this paragraph on another machine.

### Alignment is off by default

`--align` re-enables word-level alignment, which this pipeline does not use: slide alignment
works on segment timestamps. It is off because it needs a wav2vec2 model (~380 MB) and
NLTK's `punkt_tab` data, and during testing those failed independently, after the
transcription had already produced a complete result. Two extra downloads for timestamps
nobody reads is a bad default.

If a late whispermlx stage fails anyway, the script keeps the transcript and warns instead
of discarding minutes of work: the failure is reported, the segments are usable.

`--initial_prompt` holds 200–500 characters of course-specific terms only: symbol names
read aloud, acronyms, instructor names, method names. It is the cheapest accuracy win
available, and it is why `work/glossary.txt` is updated after the first lesson rather than
guessed in advance.

Other rules:

- **Resumability is by file, not by chunk.** An existing transcript is skipped unless
  `--force` is given, so a batch interrupted at lesson 7 restarts at lesson 7.
- **Do not run lectures in parallel.** MLX saturates the GPU; two concurrent runs are
  slower than two sequential ones.
- **Record the measured speed.** The header carries `speed: Nx realtime`; use the first
  real measurement to estimate a batch instead of guessing, and tell the user before
  starting it.
- Spoken mathematics is unreliable: "kappa", "enne", "pi greco", "a con n" are guesses.
  Everything symbolic is checked against the slides before it may enter the notes.
- Never run the whole course's notes before checking one lecture end to end.

### Hallucination on silence

Reproducible, not hypothetical: two seconds of pure silence, transcribed with
`temperature: 0`, came back as `" Thank you."`. Whisper completes a transcript that is not
there, in dead air, at pauses and at file boundaries, and whispermlx inherits that from the
model.

Two mitigations, in order of preference:

1. drop any segment shorter than ~3 s whose text matches a stock phrase ("Thank you.",
   "Thanks for watching.", "Sottotitoli a cura di", and variants) — reversible, cheap, done
   at extraction time, recorded under `dropped_hallucinations`;
2. keep the normalised audio (`--keep-audio`) when investigating a suspicious transcript,
   so a claim about silence can be checked instead of argued about.

## 5. Slide extraction

```sh
pdfinfo assets/L01.pdf | grep -E 'Pages|Page size'
pdftotext -layout assets/L01.pdf work/L01-slides.txt
```

Split the output on form feed to recover per-page text, keeping page numbers.

- **Text slides**: usable directly.
- **Slides with fewer than ~15 extracted words** are image-only, scanned, or dominated by
  figures and formulas: they must be read as images. Render only those pages:
  `pdftoppm -f 7 -l 9 -r 110 -png assets/L01.pdf work/pages/p`
- **Books and handouts**: extract only the chapter range relevant to the lesson, not the
  whole book, and cite `(handout, §4.2, p. 118)` in the extraction.
- **Board work** is not in the slides. If the instructor writes a derivation on the board,
  the only honest sources are the transcript plus the visual frame: flag it `board: true`
  and treat its formulas as needing verification unless the frame is legible.

## 6. Slide alignment

Goal: for each slide, the time interval in which the instructor is talking about it. This
is cheap and should not need a model.

1. Normalise slide text and transcript windows: lowercase, strip accents and punctuation,
   drop stopwords, keep numbers and symbols.
2. Slide every 30-second window across the slides and score token overlap (Jaccard on
   content words); keep the best few candidates per window.
3. Anchor on explicit cues: "next slide", "slide twelve", "this figure", "look at the
   plot", "as you can see here". These are near-certain and cheap to detect.
4. Between anchors, assign monotonically: people move forward. Mark backward jumps as
   `rewind` instead of smoothing them away, because that is usually a review moment worth
   capturing as a summary.
5. Write `work/L01.alignment.json`:
   `{"slide": 7, "t_start": 512, "t_end": 604, "confidence": "high|low", "anchor": "cue"}`

Only `low` confidence anchors go to the model for a bounded check, with the slide text
and two minutes of transcript around the candidate. Never send the whole transcript to
solve alignment.
