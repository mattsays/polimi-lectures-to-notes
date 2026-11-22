# Pipeline reference

Operational detail for phases 0–2. Verified tooling on this machine: `ffmpeg`,
`ffprobe`, `pdftotext`, `pdftoppm`, `pdfinfo`, `node`, `aria2c`.

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
    "engine": "groq",
    "model": "whisper-large-v3-turbo",
    "language": "it",
    "chunk_seconds": 600,
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
      "url": "https://politecnicomilano.webex.com/webappng/sites/politecnicomilano/recording/play/…",
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

## 2. Download with PoliWebex

<https://github.com/sup3rgiu/PoliWebex> handles the Politecnico SPID login, the Webex
session and the actual download. It is not vendored into this skill: clone it once into
a stable location and keep it out of the course folder. Written by @sup3rgiu and
contributors, MIT licensed: credit it when you report results to the user.

```sh
git clone https://github.com/sup3rgiu/PoliWebex ~/tools/PoliWebex
cd ~/tools/PoliWebex && npm install && node poliwebex -h
```

`npm install` pulls Puppeteer, which fetches its own Chromium: the system browser is
not required. Prerequisites, both already present here: `aria2c` and `ffmpeg` on `PATH`,
plus Node above v14.

Single recording:

```sh
cd ~/tools/PoliWebex
node poliwebex -v "<webex-url>" -o "<course>/raw/_incoming"
```

Many at once, one URL per line:

```sh
node poliwebex -f links.txt -o "<course>/raw/_incoming"
```

`links.txt` lives in the course folder, one URL per line, and is the canonical record of
what was requested. Whatever form the links arrived in — pasted into the chat, a text
file, a WeBeep page — normalise them into that file first, so a re-download months later
does not depend on scrolling a conversation.

Useful flags:

| Flag | When |
|---|---|
| `-w <pwd>` | recording protected by a video password |
| `-i 2` | slow connection, login times out |
| `-k` | do not store the SPID password in the system keyring |
| `-e name.surname@mail.polimi.it` | login needs the PoliMi address |

Rules:

- **Credentials never enter the repository.** PoliWebex keeps the SPID password in the
  system keyring; passing `-p`/`-u` on the command line is allowed interactively but the
  values must not be written into the manifest, a script or a note.
- **The filename is metadata, not noise.** PoliWebex names files after the video title,
  and those titles usually describe the content of the lecture. Use them: derive `title`,
  `topics` and the lesson `type` from the filename before transcribing anything, because
  it costs nothing and seeds the glossary.

### From filename to manifest entry

After a batch lands in `raw/_incoming`, list it and build the mapping explicitly:

```
Lesson number 12 - Interpolazione polinomiale e fenomeno di Runge.mp4
Esercitazione 3 - Esercizi su spline e minimi quadrati.mp4
```

- `id`: sequence number, `L12` for theory, `E03` for exercise sessions.
- `type`: `exercise` if the title contains "esercitazione", "esercizi", "laboratorio",
  "esercitazione guidata"; otherwise `theory`. Ambiguous titles get asked about, since
  they decide which folder the notes end up in.
- `title`: the descriptive part of the filename, cleaned of the "Lesson number N -"
  prefix.
- `topics`: split the descriptive part on "e", ",", " - " into candidate topics. These
  are candidates, not final: fix them after the extraction phase, when you know what was
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
  transcript or captions, use it and skip phase 2 entirely.
- Downloads are slow and long: run them as a background job, one batch at a time, and
  keep the session free for other work.

## 3. Audio preparation

Groq's documented preprocessing, run once per lecture. The script does this
automatically; the commands below are what it executes, useful for manual verification.

```sh
ffmpeg -y -i raw/L01.mp4 -ar 16000 -ac 1 -map 0:a -c:a flac work/L01.flac
```

Two deviations from the bare command, both deliberate:

- `-map 0:a:0` instead of `-map 0:a`: the API transcribes only the first track, and
  mapping every audio stream would interleave outputs and break segmentation.
- `-f segment -segment_time 600 -segment_format flac -segment_list list.csv` in the same
  pass: the whole lecture exceeds the upload limit whatever the tier, and the segment list
  is the only exact record of chunk start times (raw FLAC has no duration header).

Sizes, measured on real Italian speech rather than assumed: 16 kHz mono FLAC runs at
about 20 KB/s, so **10 minutes ≈ 12 MB** and **90 minutes ≈ 108 MB**. The documented
ffmpeg command alone is therefore not enough: a normal-length lecture exceeds even the
100 MB dev-tier limit, and on the 25 MB free tier it exceeds it four times over.
Segmentation is mandatory, not a convenience.

Secondary reason to keep it: each chunk is an independent request, so a transient
failure costs one chunk instead of a whole lecture, and the boundary offsets stay exact.

The script enforces the ceiling before uploading (`--max-upload-mb`, default 100, set 25
on the free tier) and fails with a clear message rather than sending a request that the
API will reject.

### Silence: cut in it, never remove it

Removing silence is tempting and almost useless here. Measured on a 90-minute lecture,
speech runs at about 20 KB/s, so trimming a realistic 10% of pauses takes the file from
108 MB to roughly 97 MB: still at the limit, and chunking already solved that problem
for good. At $0.04 per audio hour it saves half a cent.

The cost is not worth it: deleting audio shifts every later timestamp, so the transcript
no longer points at the right moment of the video or the right slide, and the pipeline
needs a `removed_intervals` map rebuilt and reapplied to every segment. That is a new
failure mode in the one property everything else depends on.

What is worth doing is using silence to decide **where** to cut. `silencedetect` finds
the pauses, each nominal boundary moves to the middle of the nearest one (within 30 s),
and the chunk starts exactly there. Nothing is deleted, so offsets stay absolute and
exact; what changes is that a chunk no longer begins or ends mid-word, which is where
Whisper produces its worst output. Verified on a fixture with pauses every 20 s: nominal
cuts at 60 s and 120 s became 52 s and 108 s, both inside pauses.

Disable with `--no-snap` when the recording has no usable pauses, e.g. continuous music
or heavy background noise that defeats the detector.

Two cases are worth deleting, and both are explicit rather than automatic:

- **dead zones** longer than ~2 minutes (audio dropout, a break, the room emptying);
  record the cut as an interval with its reason, and keep the time map;
- **silence at the very start or end**, which carries no information at all.

Whisper hallucination is the one genuine argument for trimming inside long silences: it
invents stock phrases in dead air. Prefer detecting those phrases and dropping them at
extraction time, which is reversible, over destroying the timeline.

## 4. Transcription

### Preflight

Before promising a transcription, check the machine:

```sh
node scripts/transcribe.mjs --check
```

It reports node, `ffmpeg`, `ffprobe`, the key location and permissions, and whether the
API accepts the key (a single `GET /models`, no audio). Exit code is nonzero when
something is missing or rejected, and it prints the setup steps.

The key is resolved from `--key-file`, then `$GROQ_API_KEY`, then `$GROQ_API_KEY_FILE`,
then `~/.config/polimi-lectures/groq.key`. **It is never requested in the conversation**:
the user creates it at console.groq.com/keys and writes it in their own terminal, so the
secret never enters a transcript, a log or a commit. If a key does get pasted into a
chat, the only right answer is to rotate it.

### Providers

Two backends behind one interface, chosen with `--provider`:

| | `groq` (default) | `cloudflare` |
|---|---|---|
| Endpoint | `POST {base}/audio/transcriptions`, multipart | `POST {base}/accounts/{id}/ai/run/@cf/openai/whisper-large-v3-turbo` |
| Body | multipart form | JSON with base64 audio |
| Response | bare transcript object | `{result, success, errors}` envelope |
| Glossary | `prompt` | `initial_prompt` |

Cloudflare sends audio as base64 inside JSON, not as a raw body, because a raw body has
nowhere to put `language` and `initial_prompt` — without them the model guesses the
language and loses the glossary. The cost is 33% more bytes on the wire: a 12 MB chunk
becomes about 16 MB, still far under the 100 MB request limit.

It also exposes knobs Groq does not, and the default is set deliberately:
`condition_on_previous_text: false` fights the repetition loops measured on real audio.
`vad_filter`, `no_speech_threshold`, `compression_ratio_threshold` and
`hallucination_silence_threshold` remain available but off — they can drop audio, and
the timestamps have to stay aligned to the slides.

### Running it

```sh
export GROQ_API_KEY="gsk_..."
node scripts/transcribe.mjs raw/L01.mp4 \
  --out work/L01 \
  --language it \
  --prompt-file work/glossary.txt \
  --chunk 600
```

What it does: normalises and chunks with `ffmpeg`, uploads each chunk to
`POST /openai/v1/audio/transcriptions` with `response_format=verbose_json` and
`timestamp_granularities[]=segment`, adds the chunk's exact start offset to every
segment, and writes:

| File | Content |
|---|---|
| `work/L01.transcript.md` | header plus `[HH:MM:SS]` blocks of about 45 seconds |
| `work/L01.srt` | segment-level subtitles for jumping to a moment |
| `work/L01.segments.json` | machine-readable segments with absolute times |
| `work/L01.chunks/` | normalised audio and `list.csv`, regenerable, safe to delete |

Model choice:

| Model | Cost/hour | WER | Use it when |
|---|---|---|---|
| `whisper-large-v3-turbo` | $0.04 | 12% | default: fast and cheap, fine for lecture prose |
| `whisper-large-v3` | $0.111 | 10.3% | dense derivations, heavy jargon, or if turbo keeps mangling numbers |

`prompt` holds 200–500 characters of course-specific terms only: symbol names read
aloud, acronyms, instructor names, method names. It is the cheapest accuracy win
available, and it is why `work/glossary.txt` is updated after the first lesson rather
than guessed in advance.

### Quotas, backoff and hallucination

Groq reports the account's real quota on every response, and the script prints the balance
after each run: `budget     27 of 7200 audio-seconds used, 7173 left (window resets in 13.5s)`.

Measured on a free-plan account: **7200 audio seconds** and **2000 requests** per window.
A 90-minute lecture is 5400 audio seconds, so it eats most of one bucket. Plan one lecture
per refill, and read the printed reset time rather than assuming the window length.

- **429 is not retried blindly.** The response carries `retry-after`; the script waits
  that long, capped at 120 s, instead of burning the remaining budget on exponential
  backoff. Exhausted quota will not fix itself in a few seconds.
- **The 25 MB ceiling is enforced locally** before the upload, so a doomed request never
  costs a round trip. `--max-upload-mb 100` only on the developer tier.

**Hallucination on silence is real and reproducible.** Two seconds of pure silence,
transcribed with `temperature: 0`, returned `" Thank you."` — the model completing a
transcript that was not there. It appears in dead air, at pauses and at file boundaries.
Two mitigations, in order of preference:

1. drop any segment shorter than ~3 s whose text matches a stock phrase ("Thank you.",
   "Thanks for watching.", "Sottotitoli a cura di", and their variants) — reversible,
   cheap, and done at extraction time;
2. keep cutting *in* silences so the affected audio is small, never remove the silence
   itself: the timeline has to survive.

Record what was dropped in the extraction JSON, so a missing sentence is traceable to the
filter rather than to a bad recording.

Other rules:

- Verify timestamps are monotonic and end near the media duration: the header records
  `failed`, and a nonzero value means some chunks were never transcribed.
- Failed chunks are reported but not cached: re-running retranscribes everything.
  Acceptable at this cost; do not build a cache until it actually hurts.
- Spoken mathematics is unreliable: "kappa", "enne", "pi greco", "a con n" are guesses.
  Everything symbolic is checked against the slides before it may enter the notes.
- Never run the whole course before checking one lecture end to end.

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
