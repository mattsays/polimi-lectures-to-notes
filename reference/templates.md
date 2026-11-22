# Templates

Markdown skeletons for phase 4. Copy the structure, not the content: anything not
present in the extraction JSON is dropped.

## Section titles by output language

The style specification is in English; the notes are written in the lecture language.

| Canonical | Italian | English |
|---|---|---|
| Objective | Obiettivo | Objective |
| Prerequisites | Prerequisiti | Prerequisites |
| Recap | Richiami | Recap |
| Definitions | Definizioni | Definitions |
| Results | Risultati | Results |
| Examples | Esempi | Examples |
| Worked exercises | Esercizi svolti | Worked exercises |
| Exam traps | Trappole d'esame | Exam traps |
| Mistakes to avoid | Errori da non fare | Mistakes to avoid |
| What you need for the exam | Da sapere per l'esame | What you need for the exam |
| Links | Collegamenti | Links |

## Theory lesson

```markdown
---
corso: {{course.name}}
lezione: L03
tipo: teoria
data_lezione: {{date}}
argomenti: [{{topics}}]
fonti: [webex, slide-03]
tags: [corso/{{course.slug}}, esame/{{topic}}]
---

# L03 — {{title}}

## Obiettivo

{{two_lines_on_what_you_can_do}}

## Prerequisiti

- {{only_what_is_actually_needed}} — [[{{lesson_id}}|{{label}}]]

## Definizioni

### {{concept_name}}

{{statement_in_one_sentence}}. Notazione: {{notation}}.
Fonte: slide {{n}}, {{timestamp}}.

## Risultati

### {{kind}} — {{name}}

**Ipotesi.** {{hypotheses}}

{{statement}}

**Dimostrazione** *({{full|schema|non svolta in aula}})*
1. {{step}}
2. {{step}}

Fonte: slide {{n}}, {{timestamp}}.

## Esempi

### {{example_title}}

> [!example] Esempio svolto — slide {{n}}, {{timestamp}}

**Traccia.** {{statement}}

**Dati.** {{data}}

**Procedimento.**
1. {{step}}
2. {{step}}

**Risultato.** {{result}}

**Perché conta.** {{why_it_matters}}

## Trappole d'esame

> [!danger] Trappola d'esame
> {{verbatim_text}}
>
> {{why}}

## Da sapere per l'esame

- {{max_five_lines_nothing_already_said}}

## Collegamenti

- Teoria: [[{{lesson}}]]
- Esercitazioni: [[{{exercise_session}}]]
```

Omit whole sections that have no content. Never leave an empty heading as a placeholder.

## Exercise session

```markdown
---
corso: {{course.name}}
lezione: E02
tipo: esercitazione
data_lezione: {{date}}
argomenti: [{{topics}}]
fonti: [webex, esercizi-02]
tags: [corso/{{course.slug}}, esame/{{topic}}]
---

# E02 — {{title}}

## Obiettivo

{{what_the_session_trains}}

## Richiami

- {{formula_or_method_needed}} — [[L{{n}}|{{label}}]]

## Esercizi svolti

### Esercizio 1 — {{short_name}}

> [!example] Svolto in aula — {{timestamp}}

**Traccia.** {{statement}}

**Dati.** {{data}}

**Procedimento.**
1. {{step}}
2. {{step}}

**Risultato.** {{result}}

**Perché conta.** {{what_it_tests_where_people_fail}}

### Esercizio 2 — {{short_name}}

{{same_structure}}

## Errori da non fare

> [!danger] Trappola d'esame
> {{text}}
>
> {{why}}

## Da sapere per l'esame

- {{max_five_lines}}

## Collegamenti

- Teoria: [[{{theory_lesson}}]]
```

If the instructor made a mistake in class, keep the wrong step in the procedure with a
callout right after it, then the corrected line. Do not silently print the right answer:
the fact that the wrong one is plausible is the lesson.

## Course-level files

### `_indice.md`

```markdown
# {{course.name}} — indice

## Teoria

| # | Lezione | Argomenti | Stato |
|---|---|---|---|
| L01 | [[L01-slug]] | {{topics}} | reviewed |

## Esercitazioni

| # | Sessione | Copre | Stato |
|---|---|---|---|
| E01 | [[E01-slug]] | lezioni L01–L02 | reviewed |

## File trasversali

- [[_glossario]]
- [[_errori-esame]]
```

### `_glossario.md`

One entry per term, alphabetical, one line each. The definition is the shortest correct
one, and the wikilink points to the lesson where it is explained properly.

```markdown
# Glossario

| Termine | Definizione | Prima occorrenza |
|---|---|---|
| Spline | {{short_definition}} | [[L03-slug\|L03]] |
```

### `_errori-esame.md`

The highest-value file in the course: every trap, aggregated, with the lesson it came
from. Grouped by topic, not by lesson, because that is how you revise.

```markdown
# Errori ricorrenti all'esame

## {{topic}}

- **{{trap}}** — {{why}}. Fonte: [[L03-slug|L03]].
- {{...}}
```

### Course `README.md`

```markdown
# {{course.name}}

{{institution}} — notes generated from lecture recordings.

- Source recordings: {{n}} lessons, {{hours}} hours
- Status: {{covered}} of {{total}} lessons written, {{reviewed}} reviewed
- Open issues: see `manifest.json` → `open_issues`

## Structure

{{short_description_of_folders}}

## Regeneration

The manifest tracks every lesson. Changing `STYLE.md` requires rerunning phase 4 only;
changing the transcription engine requires rerunning from phase 2.

## Coverage notes

Things the course normally covers that the recordings do not: {{list_or_none}}
```
