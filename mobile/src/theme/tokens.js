// ---------------------------------------------------------------------------
// Design tokens — the single source of truth for the app's look.
//
// Ported straight from the two web Tailwind configs (marketing site + AS Store)
// so the mobile app shares the exact brand identity: AS red, charcoal, the dark
// "ink" commerce surfaces, amber accents and the light fog backgrounds. Every
// component reads these through `useTheme()` — never hard-code a hex or a pixel
// in a screen; add it here (or derive it) so the whole app stays consistent.
// ---------------------------------------------------------------------------

// Raw brand palette (matches tailwind.config.js in both web projects).
export const palette = {
  // AS brand red.
  asRed: '#A41E22',
  asRedDark: '#82161A',
  asRedLight: '#C53A3F',
  // Neutrals.
  asGray: '#B6B7B8',
  asCharcoal: '#383F41',
  // Dark commerce surfaces (Amazon-style header/sub-nav, AS-toned) — from AS Store.
  asInk: '#15181A',
  asInkSoft: '#222A2D',
  asInkLine: '#2C3236',
  // Accents / backgrounds.
  asAmber: '#F2A93B',
  asBg: '#EAEDED',
  asFog: '#F5F5F7',
  white: '#FFFFFF',
  black: '#000000'
};

// Semantic color roles for the (default) light theme. Components reference these
// names, so a future dark theme only needs to swap this object.
export const lightColors = {
  // Backgrounds
  background: palette.white,
  backgroundAlt: palette.asFog,
  surface: palette.white,
  surfaceAlt: palette.asFog,
  surfaceSunken: palette.asBg,
  // The surface a *product photo* sits on. Product photography is shot on white,
  // so anything tinted behind it just frames the photo's own white background as
  // a visible rectangle inside the tile — the picture stops being the product and
  // starts being a white box. White here makes that seam disappear.
  //
  // Kept separate from `surface` even though they match today: this one is
  // dictated by the photography, not by the design. A dark theme would flip
  // `surface` to ink and must leave this alone, or every product in the catalog
  // gets a glowing white slab behind it.
  productMedia: palette.white,
  // The dark chrome used by the store nav / hero blocks.
  inverse: palette.asInk,
  inverseSoft: palette.asInkSoft,

  // Brand
  primary: palette.asRed,
  primaryDark: palette.asRedDark,
  primaryLight: palette.asRedLight,
  accent: palette.asAmber,

  // Text
  text: palette.asInk,
  textMuted: 'rgba(21,24,26,0.55)',
  textFaint: 'rgba(21,24,26,0.40)',
  textOnPrimary: palette.white,
  textOnInverse: palette.white,
  textOnInverseMuted: 'rgba(255,255,255,0.72)',

  // Lines / borders
  border: 'rgba(21,24,26,0.10)',
  borderStrong: 'rgba(21,24,26,0.18)',
  borderOnInverse: 'rgba(255,255,255,0.12)',

  // States
  success: '#2E7D32',
  danger: '#D32F2F',
  dangerBg: '#FDECEC',
  warning: palette.asAmber,

  // Overlays / scrims
  scrim: 'rgba(0,0,0,0.45)',
  skeleton: 'rgba(21,24,26,0.08)'
};

// Spacing scale (multiples of 4). Use `theme.spacing(n)` for arbitrary values.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
  '6xl': 72
};

// Corner radii — the store leans on big soft radii (28px product cards).
export const radii = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  pill: 999,
  full: 9999
};

// Type scale. `-0.022em` Apple tracking → RN letterSpacing is in points, so we
// approximate per size at render time (see typography.js helper in ThemeProvider).
export const fontFamily = {
  // System font by default (Inter can be loaded via expo-font later and swapped
  // here in one place). We keep the *names* semantic so screens never care.
  regular: undefined, // RN system font
  medium: undefined,
  semibold: undefined,
  bold: undefined
};

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
  black: '900'
};

export const typeScale = {
  // { fontSize, lineHeight, weight, tracking }
  display: { fontSize: 40, lineHeight: 44, weight: '800', tracking: -0.9 },
  h1: { fontSize: 30, lineHeight: 36, weight: '700', tracking: -0.6 },
  h2: { fontSize: 24, lineHeight: 30, weight: '700', tracking: -0.5 },
  h3: { fontSize: 20, lineHeight: 26, weight: '600', tracking: -0.3 },
  title: { fontSize: 17, lineHeight: 23, weight: '600', tracking: -0.2 },
  body: { fontSize: 15, lineHeight: 22, weight: '400', tracking: 0 },
  bodyLg: { fontSize: 17, lineHeight: 25, weight: '400', tracking: 0 },
  callout: { fontSize: 14, lineHeight: 20, weight: '500', tracking: 0 },
  caption: { fontSize: 12, lineHeight: 16, weight: '500', tracking: 0.1 },
  overline: { fontSize: 11, lineHeight: 14, weight: '700', tracking: 0.8 }
};

// Elevation presets (iOS shadow + Android elevation together).
export const shadows = {
  none: {},
  card: {
    shadowColor: '#0F1111',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  raised: {
    shadowColor: '#0F1111',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  brand: {
    shadowColor: palette.asRed,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8
  }
};

// Layout constants shared across screens (content width caps, nav heights…).
export const layout = {
  maxContentWidth: 640, // keeps big tablets/web from stretching text lines
  screenPadding: spacing.xl, // default horizontal gutter (20)
  tabBarHeight: 60,
  headerHeight: 52,
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 }
};

export const timing = {
  fast: 150,
  base: 250,
  slow: 400
};
