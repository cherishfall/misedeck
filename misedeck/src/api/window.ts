// Thin wrapper around the `set_window_theme` Tauri command (issue #47).
// Kept apart from `api/mise.ts`: this call touches the native window
// chrome and never spawns mise.

import { invoke } from "@tauri-apps/api/core";

import type { ThemeSetting } from "../state/themeContext";

/** Calls the `set_window_theme` Tauri command, applying the app theme
 *  to the native window chrome (title bar appearance + background).
 *  Rejects with the structured `AppError` on failure. */
export async function setWindowTheme(theme: ThemeSetting): Promise<void> {
  await invoke("set_window_theme", { theme });
}
