# GUI-layer affordances are orthogonal to CLI-shaped interaction

> [简体中文](../../zh-CN/docs/adr/0007-gui-layer-affordances-are-orthogonal.md)

Product principle 2 ("CLI-shaped interaction") was repeatedly over-applied: agents cited it to block GUI-layer UX work such as drag-resizing table columns, copy-path buttons, and pre-install checks. The owner corrected this misreading during beta8 feedback (2026-09-08): MiseDeck is a GUI, and affordances that make a GUI humane are not CLI features and cannot violate a ban on inventing CLI features.

## Considered Options

- Read principle 2 as banning any interaction mise CLI does not have: rejected — it would forbid normal GUI ergonomics (resizing, copying, hover states) and shrink the product to a worse-than-terminal form.
- Read principle 2 as banning only invented concepts/features (chosen): the CLI-shaped constraint governs what the product *is*; the GUI layer governs how it is *presented and operated*.

## Decision

The "CLI-shaped interaction" ban covers **concepts, vocabulary, and functionality** only: nothing may exist in MiseDeck that mise CLI has no concept or feature for. **Presentation- and interaction-layer affordances** — table column resizing, copy-to-clipboard buttons, pre-flight install checks, hover and focus treatments — are orthogonal to CLI functionality and are permitted and encouraged. A proposed feature fails principle 2 only when a mise CLI user could not predict what it does because it invents something mise does not have; "the CLI has no column-resize keybinding" is not a violation.

## Consequences

- Agents should stop rejecting GUI-layer ergonomics tickets on principle-2 grounds, and should proactively propose humane interaction affordances when they serve the same CLI-shaped feature.
- Agents should still refuse (or flag to the owner) anything that introduces a concept, noun, or capability mise lacks — ADR-0004's vocabulary ban and principle 3 stay fully in force.
- AGENTS.md principle 2 states this boundary explicitly in both locales.
