import { useRef } from "react";

// Returns a delay picker for presenter auto-advance effects: 0 right after the
// presenter taps Skip (the `skip` counter changed), otherwise the normal delay.
// Call it once per effect run, before any early return, and list `skip` in the deps.
export function useSkipDelay(skip: number) {
  const last = useRef(skip);
  return (ms: number) => {
    const fast = skip !== last.current;
    last.current = skip;
    return fast ? 0 : ms;
  };
}
