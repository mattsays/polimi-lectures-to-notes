# Extraction reference

Phase 3 turns a transcript plus slides into a structured JSON. The JSON is what makes
the notes trustworthy and regenerable: the writing phase may only lay out what is here.

## 1. Hard rules

- Every element carries `source: {timestamp, slide}`. One of the two may be `null` only
  if the other is present. An element with no source is deleted, not guessed.
- Symbolic content is copied from the slides, never reconstructed from speech. If a
  formula appears only in speech and the frame is unreadable, it goes to `to_verify`.
- If the instructor mentions a concept without explaining it, record
  `statement: null` and `note: "not explained in class"`. Do not complete it from your
  own knowledge; only the supplied handouts may fill it, with `source.handout`.
- Do not summarise. Capture the structure; compressing is the writing phase's job.
- Keep the instructor's own wording for traps and warnings. Those sentences are the
  ones that matter verbatim, and paraphrasing loses the signal.
- **Drop silence hallucinations.** A segment shorter than ~3 s whose text is a stock
  phrase ("Thank you.", "Thanks for watching.", "Sottotitoli a cura di") is Whisper
  completing a silent stretch, not something the instructor said — reproducible with two
  seconds of pure silence at `temperature: 0`. Delete it and list it under
  `dropped_hallucinations`, so a missing sentence is traceable to the filter instead of
  looking like a bad recording.

## 2. Schema

```json
{
  "lesson": "L03",
  "type": "theory",
  "title": "Interpolazione polinomiale",
  "concepts": [
    {
      "id": "c1",
      "name": "Polinomio interpolante",
      "kind": "definition|theorem|lemma|property|algorithm|observation",
      "statement": "...",
      "hypotheses": ["..."],
      "proof": {
        "present": true,
        "depth": "full|sketch|omitted",
        "steps": ["..."],
        "source": {"timestamp": "00:12:30", "slide": 7}
      },
      "priority": "exam|core|supporting",
      "source": {"timestamp": "00:12:30", "slide": 7}
    }
  ],
  "examples": [
    {
      "id": "e1",
      "kind": "worked_in_class|application|counterexample",
      "statement": "...",
      "data": ["..."],
      "steps": ["..."],
      "result": "...",
      "why_it_matters": "...",
      "board": false,
      "source": {"timestamp": "00:48:10", "slide": 12}
    }
  ],
  "exam_items": [
    {
      "id": "x1",
      "description": "...",
      "year": null,
      "source_kind": "stated|archive|implied",
      "source": {"timestamp": "01:02:00", "slide": null}
    }
  ],
  "traps": [
    {
      "id": "t1",
      "text": "...",
      "why": "...",
      "verbatim": true,
      "source": {"timestamp": "00:31:20", "slide": 9}
    }
  ],
  "classroom_questions": [
    {
      "id": "q1",
      "question": "...",
      "answer": "...",
      "misunderstanding": "...",
      "source": {"timestamp": "00:55:40", "slide": null}
    }
  ],
  "material_refs": [
    {"text": "...", "where": "slide 12 | handout §4.2 p.118 | exercise sheet 3"}
  ],
  "glossary": [
    {"term": "...", "definition": "...", "first_seen": "L03"}
  ],
  "to_verify": [
    {"text": "...", "reason": "formula only in speech", "timestamp": "00:20:10"}
  ],
  "dropped_hallucinations": [
    {"text": "Thank you.", "timestamp": "01:12:40", "reason": "2s of silence, stock phrase"}
  ],
  "gaps": [
    {"text": "...", "reason": "mentioned but not explained", "source": {"timestamp": "...", "slide": null}}
  ]
}
```

`priority` is set from the exam signals below, never from a feeling: `exam` means the
instructor flagged it or repeated it three or more times, `core` means it carries the
argument, `supporting` is everything else.

## 3. Exam signals

Scan the transcript explicitly for these patterns; do not rely on the model noticing
them while summarising.

| Signal | Cue in Italian (adapt to the course) | Goes to |
|---|---|---|
| Explicit exam flag | "lo chiedo all'esame", "questo è da esame", "ve lo chiedo sempre" | `exam_items` + `traps` |
| Worked exercise | "facciamo un esercizio", "prendiamo un esempio", "vediamo un caso" | `examples`, `kind: worked_in_class` |
| Recurring error | "sbagliano tutti qui", "attenzione al segno", "errore classico" | `traps` |
| Material pointer | "lo trovate nelle slide", "c'è nelle esercitazioni", "capitolo 4" | `material_refs` |
| Student question | a question in the room plus the answer | `classroom_questions` |
| Emphasis by repetition | same concept stated three or more times | `concepts[].priority: exam` |
| Past exam mention | "esame dell'anno scorso", "tema d'esame" | `exam_items`, `source_kind: archive` |

Two rules on judgement:

- A trap without a stated reason is still a trap. If the instructor says "this is the
  classic error" and never says why, record the text, leave `why` empty and add a
  `to_verify` entry. Do not invent the explanation.
- Silence is not evidence of absence. If a standard technique is never mentioned, that
  goes into `README.md` of the course as a coverage note, not into the lesson.

## 4. Coverage check before writing

Before leaving phase 3, answer these in `open_issues` of the manifest:

1. Every slide in the alignment map is either covered by a concept or explicitly
   marked as administrative/irrelevant.
2. Every `examples` entry has a stated `result`; if the instructor never finished the
   exercise in class, say so.
3. Every `to_verify` entry names what exactly is uncertain — a formula, a number, a name.
4. No `concepts` entry has `statement: null` without a matching `gaps` entry.

A lesson that fails the check is not ready for phase 4.
