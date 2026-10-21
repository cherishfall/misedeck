// Body copy for a read failure card (issue #270). A PARSE_FAILED error
// carries no stderr — its `message` is the parse detail the user needs,
// so the card renders that instead of pointing at a stderr block that
// does not exist. Every other failure keeps the stderr-aware choice
// from #262.

import type { TFunction } from "i18next";

import type { AppError } from "../types/tauri";
import { resolveAppErrorMessage } from "./appError";
import { stderrBodyKey } from "./stderrBody";

export function readErrorBody(
  err: Pick<AppError, "code" | "message" | "stderr">,
  t: TFunction,
  withStderr: string,
  withoutStderr: string,
): string {
  if (err.code === "PARSE_FAILED") {
    return resolveAppErrorMessage(err.message, t);
  }
  return t(stderrBodyKey(err.stderr, withStderr, withoutStderr));
}
