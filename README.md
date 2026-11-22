# polimi-lectures-to-notes

A portable agent skill that turns Politecnico di Milano Webex lecture recordings plus
slides and handouts into Obsidian-style Markdown notes, following your own writing style.

It is not tied to a specific agent harness. It needs a shell, file access, `node` and
`ffmpeg`; everything else is plain files and one Node script with no dependencies.

## Status

v1 — pipeline tested end to end: ffmpeg normalisation, silence-aware chunking, Groq
transcription against the real API, timestamp merge. Not yet run on a full real lecture.
Missing inputs are listed under *Next steps*.

## Contents

| Path | What it is |
|---|---|
| `SKILL.md` | The skill itself: frontmatter, intake on activation, six-phase flow, non-negotiable rules. |
| `STYLE.md` | Notes style. Binding rules; `[TO CONFIRM]` sections need calibration. |
| `reference/style-calibration.md` | Phase 0: what to ask for, what to observe in real notes, how to turn observations into rules. |
| `reference/pipeline.md` | Phases 0–2: manifest schema, PoliWebex download, Groq transcription, slide extraction and alignment. |
| `reference/extraction.md` | Phase 3: JSON schema, exam-signal taxonomy, coverage check. |
| `reference/templates.md` | Phase 4: Markdown skeletons and course-level files. |
| `scripts/transcribe.mjs` | ffmpeg normalisation, chunking, Groq API calls, timestamp merge, preflight. |
| `scripts/poliwebex-cookie.mjs` | stores a Webex session cookie for PoliWebex, for accounts that sign in with CIE instead of a password. |

## How it is designed

1. **Two passes, not one.** Extraction produces a JSON where every element carries a
   source; writing only lays out that JSON. A single pass lets the model fill gaps from
   its own knowledge, and makes style changes require re-transcribing everything.
2. **Style is learned at intake, not assumed.** The first thing the skill does for a new
   course is ask for two or three existing notes. Every `[TO CONFIRM]` in `STYLE.md` is a
   guess until that happens.
3. **The manifest is the source of truth.** Lesson status decides where to resume, so
   nothing silently restarts from zero. PoliWebex filenames become lesson titles and
   candidate topics, since they usually describe the lecture.
4. **Transcription is a script, not a tool call.** Groq is called directly with its
   documented preprocessing, so the audio pipeline is inspectable, re-runnable and
   independent of whatever built-in transcription the harness happens to offer.

The parts that make the notes better than a transcript are the slide alignment, the
selection rules and the exam-signal taxonomy — not the speech-to-text.

## Requirements

| Requirement | Why | Harness-specific? |
|---|---|---|
| An agent with shell + file access | it runs `ffmpeg` and writes notes | no, any agent |
| `node` 18 or newer | `scripts/transcribe.mjs` uses built-in `fetch` | no |
| `ffmpeg` + `ffprobe` | normalisation, chunking, silence detection, validation | no |
| Network access to `api.groq.com` | transcription | no |
| `aria2c` + PoliWebex | downloading the recordings | no |
| A Groq API key | transcription | no |

Nothing in the workflow calls a harness API, an MCP server or a proprietary tool. Any agent
that can read these files and run a shell command can execute it.

## Quickstart

The shortest path from nothing to one finished lecture.

1. **Install PoliWebex**, which handles the download:
   `git clone https://github.com/sup3rgiu/PoliWebex ~/tools/PoliWebex && cd ~/tools/PoliWebex && npm install`
2. **Add a transcription backend**: a Groq key or a Cloudflare token and account id — see
   *Providers and credentials*.
3. **Hand over your Webex session**, because PoliWebex cannot log in with CIE — see
   *Webex session* below.
4. **Check the setup**: `node scripts/transcribe.mjs --check --provider cloudflare`
5. **Run one lecture end to end** before trusting it with a whole course.

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
`$POLIWEBEX_DIR`). It is never echoed and never enters the shell history. Run
`--check` when downloads start failing again: cookies expire, typically once per study
session.

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
| `scripts/transcribe.mjs` | yes, node standard library only |
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

If your harness discovers skills on its own and the repo is already linked into its skills
directory, you do not even need this: a plain "turn these lecture recordings into notes,
here are the links" is enough and the frontmatter description does the triggering.

If the agent reads the file and still drifts — asks for an API key, skips the intake,
starts writing before calibrating — that is an agent or harness problem. Fix it there,
not by inflating the prompt.

## Providers and credentials

Two transcription backends, selected with `--provider` (default `groq`):

| | Groq | Cloudflare Workers AI |
|---|---|---|
| Model | `whisper-large-v3-turbo` | `@cf/openai/whisper-large-v3-turbo` |
| Price per audio hour | $0.04 | $0.031 |
| Free allowance | 7200 audio-seconds per window | 10,000 neurons/day ≈ 3.5 h of audio |
| Beyond the allowance | pay per second | needs the Workers Paid plan |
| Glossary prompt | yes | yes |
| `condition_on_previous_text` | not exposed | exposed, set to `false` |
| API shape | OpenAI-compatible multipart | one endpoint per model, JSON + base64 |

Both credentials live outside any repo, so they cannot be committed or copied into a
course folder.

### Groq

Resolved from `--key-file`, then `$GROQ_API_KEY`, then `$GROQ_API_KEY_FILE`, then
`~/.config/polimi-lectures/groq.key`. Create a key at console.groq.com/keys.

### Cloudflare

1. Sign up at <https://dash.cloudflare.com/sign-up/workers-and-pages>.
2. Go to **Workers AI** → **Use REST API**.
3. Copy the **Account ID**.
4. **Create a Workers AI API Token** and copy it.
5. Store both in your own terminal:

```sh
mkdir -p ~/.config/polimi-lectures
printf '%s' '<api-token>'    > ~/.config/polimi-lectures/cloudflare.key
printf '%s' '<account-id>'   > ~/.config/polimi-lectures/cloudflare.account
chmod 600 ~/.config/polimi-lectures/cloudflare.key
```

Resolved from `--key-file` / `--account-id`, then `$CLOUDFLARE_API_TOKEN` and
`$CLOUDFLARE_ACCOUNT_ID`, then those two files.

To stop passing `--provider cloudflare` on every run, make it the default once:

```sh
printf '%s' 'cloudflare' > ~/.config/polimi-lectures/provider
```

Precedence: `--provider` flag, then `$LECTURE_STT_PROVIDER`, then that file, then `groq`.

### Verifying

```sh
node scripts/transcribe.mjs --check --provider cloudflare
```

It reports node, ffmpeg, ffprobe, where the credentials were found, whether their
permissions are too open, and whether the account accepts them. On failure it prints the
setup steps.

Credentials are **never requested in the conversation**: they are created in the
provider's dashboard and written by the user in their own terminal, so they never enter a
chat, a log or a commit. If one does get pasted into a chat, rotate it.

## Quotas, measured

Groq reports the real quotas on every response; Cloudflare does not, so its allowance has
to be tracked from the dashboard.

| | Groq | Cloudflare |
|---|---|---|
| Bucket | 7200 audio-seconds | 10,000 neurons/day |
| Requests | 2000 per window | not published |
| File ceiling | 25 MB free / 100 MB dev | 100 MB per request |

A 90-minute lecture is 5400 audio seconds, so it consumes most of a Groq bucket: expect
roughly **one lecture per refill**. On Cloudflare the same lecture is about 3600 neurons,
so the free daily allowance covers roughly **2.5 lectures a day**. The script prints
Groq's used/left balance after every run — plan with that number, not with an assumption
about the window length.

`--max-upload-mb` defaults to 25, which is safe on every plan and well below Cloudflare's
100 MB request limit. Base64 encoding inflates a 12 MB chunk to about 16 MB on the wire.

## Sizes, measured

16 kHz mono FLAC of real Italian speech runs at about 20 KB/s.

| Input | FLAC size | Fits one request? |
|---|---|---|
| 10 min | ~12 MB | yes |
| 30 min | ~36 MB | no on the 25 MB free tier |
| 90 min | ~108 MB | no, not even on the 100 MB dev tier |

This is why 600-second chunks are the default: a lecture does not fit in one request at
any tier, and chunking also isolates retries to a single piece.

## Next steps

1. **PoliWebex.** Clone it, run `npm install`, download one lecture with
   `node poliwebex -v "<url>" -o raw/_incoming`, and confirm the filename → manifest mapping.
2. **Style calibration.** Provide two or three real notes; they fill `STYLE.md` §5 and §10
   and settle proof depth, notation, images and callouts.
3. **First real run.** One lecture end to end, reviewed, before batch processing.

## Known risks

- Spoken mathematics and numbers are unreliable; the design forces symbolic content to
  come from slides or legible board frames.
- Whisper degrades on long stretches of near-identical audio (repetition loops lose
  accents and punctuation). Lectures are fine; edited compilations of repeated phrases
  are not.
- Scanned or handwritten slides need page rendering, not text extraction.
- Poor audio in some recordings degrades every later phase; catch it at download time
  with `ffprobe` and a spot listen.
- PoliWebex drives a real SPID login: it breaks when PoliMi changes the login flow, and it
  cannot handle CIE (phone) logins at all. Use `scripts/poliwebex-cookie.mjs` to inject a
  browser session cookie instead.
  Treat a failed download as a tool problem, not something to work around.

## Credits

**PoliWebex** — <https://github.com/sup3rgiu/PoliWebex> — by
[@sup3rgiu](https://github.com/sup3rgiu) and contributors
([@yuyu-19](https://github.com/yuyu-19), [@1alessandro1](https://github.com/1alessandro1),
[@GiorgioUghini](https://github.com/GiorgioUghini)), MIT licensed.

It does the hard part of this pipeline: the SPID login and the Webex download. This skill
invokes it as an external tool and does not redistribute its code, but the whole first
phase exists because that project works.

The rest of the pipeline stands on [ffmpeg](https://ffmpeg.org) and on Groq's hosted
Whisper (`whisper-large-v3` / `whisper-large-v3-turbo`), itself derived from
[OpenAI's Whisper](https://github.com/openai/whisper) model weights.
