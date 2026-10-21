// The Doctor page's copyable report (#238).
//
// The page's raw mise transcription stays byte-for-byte what mise said;
// this module only assembles the text that goes to the clipboard. The
// header identifies the running MiseDeck build, the body is the mise
// report untouched, and the two are separated by a blank line so the
// header cannot be mistaken for part of the command's output.

import type { DoctorPayload } from "../../types/tauri";

/** The mise doctor content for the clipboard.
 *
 *  The raw-text fallback carries `rawText` verbatim. The structured path
 *  stores mise's `--json` payload, which is the complete report the
 *  command emitted; pretty-printing changes whitespace only, never a
 *  value. `rawLines` is the last resort for old payloads that predate
 *  `rawText`. */
export function doctorReportBody(data: DoctorPayload, raw: unknown): string {
  if (typeof data.rawText === "string") return data.rawText;
  if (data.rawLines && data.rawLines.length > 0) {
    return data.rawLines.map((line) => line.text).join("\n");
  }
  return JSON.stringify(raw ?? {}, null, 2) ?? "";
}

/** Header first, then a blank line, then the body exactly as received. */
export function composeDoctorReport(header: string, body: string): string {
  return `${header}\n\n${body}`;
}
