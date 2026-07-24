// ---------------------------------------------------------------------------
// ThemeProvider + hooks — the central styling mechanism for the whole app.
//
// Any component gets the app's identity through these hooks and never hard-codes
// values:
//
//   const t = useTheme()                          // raw tokens + helpers
//   const styles = useThemedStyles(makeStyles)    // memoized StyleSheet from tokens
//
// `makeStyles` receives the theme, so a new component written months from now
// automatically inherits the same colors, spacing, radii, typography and
// shadows. Change a token once and every screen updates.
// ---------------------------------------------------------------------------

import { createContext, useContext, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { lightColors, palette, spacing as spacingScale, radii, shadows, layout, typeScale, fontWeight, fontFamily, timing } from './tokens';

// Build the full theme object exposed to the app. Kept in a factory so a dark
// theme is a one-liner later: buildTheme(darkColors).
function buildTheme(colors) {
  // `spacing` doubles as an object (theme.spacing.lg) and a function
  // (theme.spacing(2) === 8px units) for arbitrary multiples.
  const spacing = n => (typeof n === 'number' ? n * 4 : (spacingScale[n] ?? 0));
  Object.assign(spacing, spacingScale);

  return {
    colors,
    palette,
    spacing,
    radii,
    shadows,
    layout,
    type: typeScale,
    fontWeight,
    fontFamily,
    timing,
    // Convenience: a translucent version of any hex-ish color isn't trivial in
    // RN, so expose brand alpha helpers the design uses a lot.
    alpha: (hex, a) => hexWithAlpha(hex, a)
  };
}

// #RRGGBB + 0..1 alpha → rgba(). Falls back to the input for non-hex values.
function hexWithAlpha(hex, a) {
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const defaultTheme = buildTheme(lightColors);

const ThemeContext = createContext(defaultTheme);

export function ThemeProvider({ children, theme = defaultTheme }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

// Raw access to tokens + helpers.
export function useTheme() {
  return useContext(ThemeContext);
}

// Turn a `makeStyles(theme) => ({...})` factory into a memoized StyleSheet.
// This is the recommended way to style any new component: it guarantees the
// component participates in the shared design system.
export function useThemedStyles(makeStyles, deps = []) {
  const theme = useTheme();
  return useMemo(
    () => StyleSheet.create(makeStyles(theme)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, ...deps]
  );
}

export { defaultTheme };
