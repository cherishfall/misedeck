// Issue #255: the tools page's argv is written twice — TypeScript for
// the dispatch (`src/pages/ToolsPage/toolActionArgs.ts`) and Rust for
// the pinned builders (`src/mise.rs`) — and the two were kept aligned by
// a comment only (audit R-13). The shared case table
// `tests/fixtures/argv-parity.json` is the contract:
//
//   * this test executes the Rust half against the table (cargo test);
//   * `scripts/check-argv-parity.ts` executes the TS half against the
//     same file and runs as `npm run lint:argv-parity` inside
//     `npm run ci`.
//
// Breaking either builder, or changing the table without both sides,
// fails the half that no longer matches.

use std::path::PathBuf;

use serde::Deserialize;

use misedeck_lib::mise::{
    mise_install_argv, mise_link_argv, mise_uninstall_argv, mise_unuse_argv, mise_upgrade_argv,
    mise_use_argv,
};

#[derive(Deserialize)]
struct Case {
    builder: String,
    tool: String,
    #[serde(default)]
    version: String,
    #[serde(default)]
    path: String,
    #[serde(default)]
    global: bool,
    argv: Vec<String>,
}

#[derive(Deserialize)]
struct Table {
    cases: Vec<Case>,
}

fn table() -> Table {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/argv-parity.json");
    let text =
        std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("parse {}: {e}", path.display()))
}

#[test]
fn rust_builders_match_the_shared_tools_page_argv_table() {
    let table = table();
    assert!(!table.cases.is_empty(), "the argv parity table is empty");

    let mut builders = std::collections::BTreeSet::new();
    for case in &table.cases {
        builders.insert(case.builder.clone());
        let actual = match case.builder.as_str() {
            "install" => mise_install_argv(&case.tool, &case.version),
            "uninstall" => mise_uninstall_argv(&case.tool, &case.version),
            "use" => mise_use_argv(&case.tool, &case.version, case.global),
            "unuse" => mise_unuse_argv(&case.tool, case.global),
            "link" => mise_link_argv(&case.tool, &case.version, &case.path),
            "upgrade" => mise_upgrade_argv(Some(&case.tool)),
            other => panic!("unknown builder {other:?} in the argv parity table"),
        };
        assert_eq!(
            actual, case.argv,
            "the Rust `{}` builder drifted from the shared table",
            case.builder
        );
    }

    // A new tools-page builder needs a table case; if the TS side grows
    // one without the Rust half noticing, the missing name shows up here
    // rather than as silent drift.
    for expected in ["install", "uninstall", "use", "unuse", "link", "upgrade"] {
        assert!(
            builders.contains(expected),
            "the table has no `{expected}` case; every tools-page builder must be covered"
        );
    }
}
