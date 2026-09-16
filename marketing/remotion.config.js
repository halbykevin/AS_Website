// Remotion's build/render defaults for this project.
// CLI flags still win, so `npm run render:hq` can override the CRF below.

import { Config } from '@remotion/cli/config';

Config.setEntryPoint('./src/index.jsx');

// H.264 in an MP4: what Instagram re-encodes from with the least damage.
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
// 18 is visually lossless enough to survive Instagram's own second encode,
// which is the only one the viewer ever sees. Lower is wasted bytes.
Config.setCrf(18);

// Product photos are fetched from `public/` over Remotion's dev server; a slow
// decode should stall the frame, not render a hole in the shop grid.
Config.setDelayRenderTimeoutInMilliseconds(60000);

Config.setOverwriteOutput(true);
