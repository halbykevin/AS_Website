// Tiny scroll-position tracker for "dynamic" fixed headers. Attach `onScroll` to
// any ScrollView / FlatList and read `scrolled` — it flips to true once the
// content has moved past `threshold`px, so a header can reveal its shadow/border
// exactly when content slides under it. Only re-renders on the threshold cross
// (not every frame), so it's cheap.

import { useCallback, useRef, useState } from 'react';

export default function useScrolled(threshold = 6) {
  const [scrolled, setScrolled] = useState(false);
  const last = useRef(false);

  const onScroll = useCallback(
    e => {
      const y = e.nativeEvent.contentOffset.y;
      const next = y > threshold;
      if (next !== last.current) {
        last.current = next;
        setScrolled(next);
      }
    },
    [threshold]
  );

  return { scrolled, onScroll };
}
