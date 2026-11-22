# STYLE.md — notes style

Single source of style truth. The rules below are binding: when a note breaks one,
either the file is fixed or the rule is fixed, never half of both.

> **Status v1.** Sections marked `[TO CONFIRM]` are reasonable guesses, not yet derived
> from real notes. Validate them against two or three existing notes, then delete this
> notice. Every change gets a row in *Changelog* at the bottom.
>
> **Calibration is the first task of any new course**: see `reference/style-calibration.md`.
> Until it runs, every `[TO CONFIRM]` below is a guess.

## 1. File format

Obsidian-flavoured Markdown, one file per lesson.

- Name: `L03-interpolazione-polinomiale.md` for theory,
  `E02-spline-esercizi.md` for exercise sessions. Two-digit number, kebab-case title,
  no date in the name.
- Mandatory frontmatter:

```yaml
---
corso: Metodi Numerici
lezione: L03
tipo: teoria
data_lezione: 2026-03-12
argomenti: [interpolazione, spline]
fonti: [webex, slide-03]
tags: [corso/metodi-numerici, esame/interpolazione]
---
```

- Headings: `##` for sections, `###` for subsections. Nothing below `###`: if a fourth
  level is needed, the section is split.
- Wikilinks for lessons and concepts: `[[L02-errori|errori di troncamento]]`. Never
  Markdown links to files inside the course.
- A lesson file stays under 400 lines. Beyond that, split by topic and add an index file.
- **Images.** `[TO CONFIRM — decided by calibration]` Default proposal: no images, no
  screenshots of slides. The content of a figure is written as text, a table or a
  formula, and the slide number is cited. If the real notes do use images, state which
  kind (plots, diagrams, board photos), where they are stored (`assets/`) and the embed
  syntax; never embed an image without saying what it shows and where it came from.

## 2. Output language

Notes are written in the **language of the lecture** (default: Italian), because that is
the language of the exam and of the source material. This style specification is in
English; section titles map to the output language using the table in
`reference/templates.md`. Technical terms that are standard in English (stiff, spline,
runge phenomenon) stay in English inside the notes.

## 3. Skeleton of a theory lesson

Fixed order; missing sections are omitted rather than left as empty headings:

1. **Objective** — two lines: what you can do at the end of the lesson.
2. **Prerequisites** — only the background actually needed, with a wikilink to the lesson covering it.
3. **Definitions** — one per concept, stated in a sentence, notation after.
4. **Results** — theorems, properties, algorithms. Statement, hypotheses, then the proof at the depth declared below.
5. **Examples** — worked in full when the instructor does them in class, even if they look trivial.
6. **Exam traps** — callouts, one per trap.
7. **What you need for the exam** — at most five lines, only things not already said above.
8. **Links** — wikilinks to the related theory and exercise sessions. Last section, always present.

`[TO CONFIRM]` If your real notes open with the applied motivation instead of the
objective, the order changes: say so and it gets rewritten.

## 4. Proof depth

`[TO CONFIRM]` Proposed default:

- **Full** when the exam asks for it or the instructor works it out entirely on the board.
- **Sketch** (hypotheses → idea in two lines → conclusion) when the instructor says "the proof is in the book".
- **Omitted** when it is only mentioned and not worked: record "proof not given in class" with the reference.

Missing steps are never invented. If the instructor skips a computation, write
`> [!warning] Step skipped in class` and state what is missing.

## 5. Notation conventions

`[TO CONFIRM]` — align these with your notes, not with my preference.

- Inline formulas `$...$`, display formulas `$$...$$` on their own line.
- Equation numbering only when referenced elsewhere; otherwise no number.
- Vectors in bold (`$\mathbf{x}$`), matrices uppercase (`$A$`), scalars lowercase.
- Indices: `$x_i$`, `$x^{(k)}$` for iterations, `$\hat{x}$` for estimates.
- Sets: `$\mathbb{R}^n$`, `$\mathcal{O}(h^2)$`.
- Technical terms in **bold** at first occurrence in the file, never again.

## 6. Voice and density

- Impersonal or didactic "we". Never first person singular.
- Short sentences. One concept per sentence, one idea per paragraph.
- No filler: "as we saw", "it is worth noting", "in essence" do not appear.
- Tables only for real comparisons (methods, complexity, properties), never for lists.
- Code and algorithms go in a fenced block in the real language, with essential comments.

## 7. What never appears

- Digressions, anecdotes, discipline history, "because it is beautiful" motivation.
- The same concept repeated across sections.
- Transcript of instructor sentences with no technical value.
- Content not traceable to a slide, the board or a handout.
- Apologies, generic warnings, "this is a complex topic".

## 8. Callouts

Allowed types, no others:

| Callout | Use |
|---|---|
| `> [!danger] Trappola d'esame` | recurring error, flagged by the instructor or inferred from an exercise |
| `> [!example] Esempio svolto` | exercise or example done in class, with steps |
| `> [!warning] Da verificare` | uncertain content, formula only in speech, skipped step |
| `> [!question] Domanda in aula` | student question and the instructor's answer |
| `> [!abstract] In due righe` | summary at the end of a long section, three lines maximum |

`[TO CONFIRM]` If you already use your own callout set, replace this table.

## 9. Exercises and exercise sessions

A worked exercise always has: **statement** (data and request), **procedure** (numbered
steps, one per line), **result** (highlighted), **why it matters** (one line: what it
tests, where people go wrong). If the instructor makes a mistake in class, flag it in a
callout and give the corrected version.

## 10. Few-shot

`[EMPTY UNTIL CALIBRATION]` Two verbatim excerpts of your own notes go here, one theory
and one worked exercise, as a tone reference. Run `reference/style-calibration.md` to
collect them; as soon as they exist, this becomes the most important section of the file.

## Changelog

| Date | Change | Origin |
|---|---|---|
| 2026-11-22 | v1: initial setup | project decisions |
