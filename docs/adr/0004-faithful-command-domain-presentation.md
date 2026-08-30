# Faithful command-domain presentation, directory context instead of project entity

> [简体中文](./0004-faithful-command-domain-presentation.zh-CN.md)

MiseDeck is a faithful GUI over mise's existing command surface: every screen maps to a mise command its users already know, and the app invents no concepts the CLI does not have. Project-level support is expressed as a **directory context** (mise's own `cwd` model: a directory bar at the top, defaulting to Global; pointing it at a directory makes every page operate on that directory via `mise -C`) — not a project entity with registration or a separate "projects world". Every mutating action runs through an execution panel showing the exact mise command being run plus live logs (teaching device, trust device, debugging device), a pattern validated by the Homebrew GUI Taphouse.

## Considered Options

- Project-as-first-class-entity (project list, project detail worlds): rejected — it confused the owner, contradicts mise's own mental model, and exceeds the original intent of a UI shell over mise's subcommands.
- Silent execution with friendly spinners: rejected — hides the command mapping that makes the GUI educational and trustworthy.

## Consequences

- README and design reviews use the standard: "could a mise CLI user predict what this screen does?"
- Resolves the deferred information-architecture question tracked in issue #10.
