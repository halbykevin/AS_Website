// The reel itself: one shared backdrop, eight beats, no transition components.
//
// Every scene sits on the same `<Background>`, and each one fades its own
// contents in and out at its edges (`useSceneFade`). That reads as a
// cross-dissolve without any overlapping sequences to keep in step — and it
// means reordering `SCENES` in config.js reorders the video, with nothing to
// rewire.
//
// Each scene is pulled back over its predecessor by `CROSSFADE` frames, so the
// two are on screen together while one fades out and the other fades in. Laid
// end to end instead, every cut shows a frame of bare background.
//
// Scenes are also premounted a second early so their photos are decoded before
// the cut. Without it the first frame of the shop grid renders with empty
// boxes, which on a 4-second beat is a tenth of the shot.

import React from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { CROSSFADE, SCENES } from './config';
import { baseText } from './lib/fonts';
import Background from './components/Background';
import Hook from './scenes/Hook';
import Shop from './scenes/Shop';
import Bag from './scenes/Bag';
import Wallet from './scenes/Wallet';
import Spin from './scenes/Spin';
import Events from './scenes/Events';
import Assistant from './scenes/Assistant';
import Cta from './scenes/Cta';

const SCENE_COMPONENTS = { hook: Hook, shop: Shop, bag: Bag, wallet: Wallet, spin: Spin, events: Events, assistant: Assistant, cta: Cta };

export default function AppReel() {
  return (
    <AbsoluteFill style={baseText}>
      <Background />
      <Series>
        {SCENES.map(({ id, duration }, i) => {
          const Scene = SCENE_COMPONENTS[id];
          return (
            <Series.Sequence
              key={id}
              durationInFrames={duration}
              offset={i === 0 ? 0 : -CROSSFADE}
              premountFor={30}
            >
              <Scene duration={duration} />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
}
