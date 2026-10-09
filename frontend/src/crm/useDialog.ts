import { useEffect, useRef } from "react";
export function useDialog(close: () => void, busy: boolean) {
  const ref = useRef<HTMLElement>(null),
    state = useRef({ close, busy });
  state.current = { close, busy };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current
      ?.querySelector<HTMLElement>("button:not(:disabled),input:not(:disabled)")
      ?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !state.current.busy) {
        event.preventDefault();
        state.current.close();
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ) || [],
      );
      const first = controls[0],
        last = controls.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !ref.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !ref.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = scroll;
      previous?.focus();
    };
  }, []);
  return ref;
}
