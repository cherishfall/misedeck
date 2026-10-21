// UpgradeArrow — the upgrade path's arrow, drawn as inline SVG (#258).
//
// Why not the `→` character: U+2192 sits outside the unicode-range of all
// three bundled faces (src/fonts.css lists U+2191 / U+2193 but not
// U+2192), so the character fell back to a system face while the version
// numbers around it stayed in JetBrains Mono. The arrow is still the
// visual language's sole decorative glyph; drawing it here keeps its
// shape, weight and advance independent of font coverage.
//
// Colour comes from the shared `.upgrade-arrow` class in tokens.css — one
// span class, one token colour (`--flare`) — so every upgrade path renders
// alike (docs/design/ui-ux-rules.md → Glyphs & icons).

export function UpgradeArrow() {
  return (
    <span className="upgrade-arrow" aria-hidden="true">
      <svg width="0.7em" height="0.7em" viewBox="0 0 16 16" fill="none" focusable="false">
        <path
          d="M2 8h11.5M9.5 4.5 13 8l-3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
