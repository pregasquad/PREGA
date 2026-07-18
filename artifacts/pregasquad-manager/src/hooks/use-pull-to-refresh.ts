import { useState, useRef, useEffect } from "react";

const THRESHOLD = 72;
const MAX_PULL = 92;

export function usePullToRefresh(
  containerRef: React.RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void>,
) {
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef(0);
  const currentPullRef = useRef(0);
  const isActivePullRef = useRef(false);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;
      startYRef.current = e.touches[0].clientY;
      // Only activate when the vertical overflow policy allows scrolling AND we're at the top.
      // Do NOT require scrollHeight > clientHeight — short/empty pages should still be
      // refreshable. What we must block is overflow:hidden/clip containers (e.g. the
      // Planning board) which are never user-scrollable and always have scrollTop===0,
      // so they would spuriously arm the pull gesture during card drags.
      const overflowY = getComputedStyle(el).overflowY;
      const isScrollable = overflowY !== "hidden" && overflowY !== "clip";
      isActivePullRef.current = isScrollable && el.scrollTop <= 0;
      currentPullRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isActivePullRef.current || isRefreshingRef.current) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        // Scrolling up — cancel pull mode so normal scroll takes over
        isActivePullRef.current = false;
        currentPullRef.current = 0;
        setPullY(0);
        return;
      }
      // Rubber-band resistance: square-root curve so it feels natural
      const y = Math.min(Math.sqrt(delta) * 5, MAX_PULL);
      currentPullRef.current = y;
      setPullY(y);
    };

    const onTouchEnd = async () => {
      if (!isActivePullRef.current) return;
      const pulled = currentPullRef.current;
      isActivePullRef.current = false;

      if (pulled >= THRESHOLD && !isRefreshingRef.current) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        currentPullRef.current = 48;
        setPullY(48);
        try {
          await onRefresh();
        } finally {
          isRefreshingRef.current = false;
          setIsRefreshing(false);
          currentPullRef.current = 0;
          setPullY(0);
        }
      } else {
        currentPullRef.current = 0;
        setPullY(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [containerRef, onRefresh]);

  return { pullY, isRefreshing };
}
