// Which colour family an env row's source badge uses — one
// implementation for both pages that render env sources (Env,
// Directory preview), so they cannot drift apart (issue #232).
//
// A source is a neutral fact, not a state: where a value came from is
// carried by the badge's *text* (`Current directory · rust`,
// `Tool · go`, `Inherited`). Warning colour in this app means "needs
// attention / has drifted" (visual-language.md), and a tool-injected
// var needs neither — so `tool` joins `project` in the info family
// instead of wearing the warning gold that made three rows look like
// pending items.

import type { EnvSource } from "../api/miseTools";

export type BadgeVariant = "default" | "info" | "warning";

export function envSourceVariant(source: EnvSource): BadgeVariant {
  switch (source) {
    case "project":
    case "tool":
      return "info";
    case "global":
    case "parent":
    case "default":
    default:
      return "default";
  }
}
