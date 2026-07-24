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
