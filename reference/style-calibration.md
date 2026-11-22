# Style calibration

Run this the first time a user asks for lecture notes, before writing anything.
The goal is to replace guesses in `STYLE.md` with observed properties of real notes.

## 1. When and how to ask

The request is in `SKILL.md` under *On activation*: ask once, in one message, alongside
the lecture list. Do not duplicate it here and do not ask item by item across several
turns.

Why it matters, and why it is worth stating to the user: notes that do not match how they
already study get ignored, no matter how accurate they are.

If the user has no samples, or prefers to skip: copy the proposed defaults into
`STYLE.md`, keep the `[TO CONFIRM]` markers, and let the phase 5 checkpoint do the
calibration instead. Never block the whole job over it, but never claim the style is
calibrated either.

## 2. What to extract from the samples

Read them as evidence, not as inspiration. For each dimension, record the observation
and the rule it implies. Mark genuinely ambiguous cases `[TO CONFIRM]` and ask one
targeted question, not a questionnaire.

| Dimension | What to look for | Where it lands |
|---|---|---|
| Images | screenshots of slides, plots, diagrams, photos of the board, or text only | `STYLE.md` §1 and §4 |
| Headings | depth used, numbering, casing, whether they are questions or nouns | §3 skeleton |
| Structure | order of sections, presence of summary boxes, recap at the end | §3 |
| Density | bullets vs prose, average paragraph length, line length | §6 |
| Formulas | inline vs display, numbering, LaTeX vs plain text vs pasted images | §5 |
| Notation | vectors, matrices, indices, iterations, sets, derivatives | §5 |
| Proofs | full, sketch, or absent; how hypotheses are marked | §4 |
| Exercises | statement/procedure/result split, numbering, where the answer sits | §9 |
| Admonitions | callouts, highlighted boxes, warnings, "attenzione" markers | §8 |
| Tables | used for what, or avoided entirely | §6 |
| Code | language, comments, pseudocode conventions | §6 |
| Frontmatter | presence, keys, tags, links between files | §1 |
| Length | lines or pages per lecture | §1 |
| Voice | impersonal, "we", notes-to-self, abbreviations | §6 |
| Omissions | what never appears: digressions, history, motivation, pictures | §7 |

## 3. Turn observations into rules

Every finding becomes a rule a writer can be held to, not an adjective.

- Observed: no images anywhere, only formulas and text.
  Rule: **no images, no screenshots of slides.** Instead, transcribe the content of the
  slide into text or a table, and cite the slide number.
- Observed: headings are noun phrases, max depth `###`, no numbering.
  Rule: **headings are noun phrases, `##`/`###` only, never numbered.**
- Observed: demonstrations reduced to one line of idea plus the citation.
  Rule: **proofs are sketches; a full derivation only when the exam asks for it.**

If a sample contradicts another sample, ask which is the current style instead of
averaging them.

## 4. Write the result down

Update `STYLE.md` in place: fill the `[TO CONFIRM]` sections, replace §10 with one
verbatim theory excerpt and one verbatim exercise excerpt from the user's own notes, and
add a `Changelog` row describing what was learned and from which sample. The excerpts
are the single most effective part of the file: they carry tone in a way rules cannot.

Record the sources in the row, e.g. `notes/analisi-2/cap3.pdf`, `notes/fisica-1/lezioni.md`.
Those files are the user's, not the course's: reference them, do not copy them into the
course folder.
