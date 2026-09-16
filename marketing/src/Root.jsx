// What the Remotion studio and the renderer can see.
//
// `AppReel` is the deliverable: 1080x1920, 30fps, the aspect and frame rate
// Instagram wants for a Reel. The per-scene compositions below it exist so a
// beat can be opened and scrubbed on its own — tuning the wheel's deceleration
// by scrubbing 19 seconds into the full reel every time is how you stop tuning
// it.

import React from 'react';
import { AbsoluteFill, Composition } from 'remotion';
import AppReel from './AppReel';
import { canvas } from './brand';
import { DURATION, SCENES } from './config';
import Hook from './scenes/Hook';
import Shop from './scenes/Shop';
import Bag from './scenes/Bag';
import Wallet from './scenes/Wallet';
import Spin from './scenes/Spin';
import Events from './scenes/Events';
import Assistant from './scenes/Assistant';
import Cta from './scenes/Cta';
import Background from './components/Background';
import { baseText } from './lib/fonts';

const SCENE_COMPONENTS = { hook: Hook, shop: Shop, bag: Bag, wallet: Wallet, spin: Spin, events: Events, assistant: Assistant, cta: Cta };

const title = id => `Scene-${id.charAt(0).toUpperCase()}${id.slice(1)}`;

export const RemotionRoot = () => (
  <>
    <Composition
      id="AppReel"
      component={AppReel}
      durationInFrames={DURATION}
      fps={canvas.fps}
      width={canvas.width}
      height={canvas.height}
    />

    {SCENES.map(({ id, duration }) => {
      const Scene = SCENE_COMPONENTS[id];
      return (
        <Composition
          key={id}
          id={title(id)}
          component={() => (
            <AbsoluteFill style={baseText}>
              <Background />
              <Scene duration={duration} />
            </AbsoluteFill>
          )}
          durationInFrames={duration}
          fps={canvas.fps}
          width={canvas.width}
          height={canvas.height}
        />
      );
    })}
  </>
);
