// CommandHint — a page's teaching line of related mise commands
// (docs/design/ui-ux-rules.md → command hint). The hint string lists
// commands separated by ` · ` (middle dot); each command renders as an
// unbreakable unit so wrapping happens only between commands, never
// mid-command. The line is capped at 60ch. Single implementation —
// pages never restyle or reimplement it.

import { Fragment } from "react";

import styles from "./CommandHint.module.css";

interface CommandHintProps {
  /** Full hint string; commands are separated by `·` (middle dot). */
  children: string;
}

export function CommandHint({ children }: CommandHintProps) {
  const commands = children
    .split("·")
    .map((command) => command.trim())
    .filter(Boolean);
  return (
    <p className={styles.commandHint}>
      {commands.map((command, index) => (
        <Fragment key={`${index}-${command}`}>
          {index > 0 && <span className={styles.separator}>{" · "}</span>}
          <span className={styles.command}>{command}</span>
        </Fragment>
      ))}
    </p>
  );
}
