// Args for the Settings page's `mise settings ls --json-extended` reads
// (issue #273).
//
// `--local` restricts the list to the directory's own config — the
// correct scope for the page's default, explicit view. Combining it
// with `--all` asks for "every default that is also set locally", which
// is empty in a directory with no local settings and never yields the
// key-name completion the add form needs. Show all therefore lists
// mise's full set (built-in defaults plus global config, with local
// overrides where they exist); the Source column says where each row
// comes from. Global mode has no directory to scope to, so it never
// passes `--local`.
export function settingsLsArgs(all: boolean, local: boolean): string[] {
  const args = ["settings", "ls", "--json-extended"];
  if (all) args.push("--all");
  else if (local) args.push("--local");
  return args;
}
