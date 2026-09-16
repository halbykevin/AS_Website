// Inter, the brand font — the same one both websites and the app are set in.
//
// Only the weights the reel actually uses, and only the latin subset: every
// extra face is a file the renderer has to fetch and block on before it can
// draw frame 0, and a missing weight shows up as a synthesised fake-bold that
// looks nothing like Inter.

import { loadFont } from '@remotion/google-fonts/Inter';

const { fontFamily } = loadFont('normal', {
  weights: ['400', '500', '600', '700', '800'],
  subsets: ['latin']
});

export const FONT = fontFamily;

/** Applied once, at the root, so no scene has to remember it. */
export const baseText = {
  fontFamily: FONT,
  // Inter's tabular figures keep a counting-up number from jittering as its
  // digits change width — the wallet balance is the whole point of that scene.
  fontVariantNumeric: 'tabular-nums',
  WebkitFontSmoothing: 'antialiased',
  textRendering: 'geometricPrecision'
};
