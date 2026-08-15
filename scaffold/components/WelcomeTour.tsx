"use client";

/**
 * WelcomeTour.tsx — a compact, anchored welcome guide shown on first load
 * (replaces the old centered SweetAlert SignInNudge).
 *
 * Instead of a modal in the middle of the page, it's a small popover (a "coach
 * mark") that walks the visitor through the three things worth knowing, one at a
 * time, spotlighting the real element each step points at:
 *   1. Sign in  — where to sign in to save searches (skipped if already signed in).
 *   2. Samples  — the "See a sample company" picker for a quick, no-typing demo.
 *   3. Describe — focuses the cursor in the description box and invites a good,
 *                 detailed description.
 *
 * Targets are located by `data-tour="..."` attributes on the real controls
 * (sidebar Sign in link, the sample-company trigger, the description textarea),
 * so the tour stays decoupled from each component's internals. Rendered through
 * a portal to document.body and positioned with fixed coordinates from each
 * target's getBoundingClientRect(), re-measured on scroll/resize.
 *
 * Non-blocking and honest: the spotlight uses pointer-events:none so the page
 * stays fully interactive, Esc / Skip / the X all dismiss it, and it fires at
 * most ONCE EVER per browser (localStorage, not sessionStorage — see
 * lib/ui/welcomeTourPrefs.ts), so it never nags and never comes back after
 * sign-in.
 *
 * Themed entirely with the design-token classes so it adapts to light/dark.
 * Mounted only on the flag-ON home path (app/page.tsx).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import {
  hasSeenWelcomeTour,
  markWelcomeTourSeen,
  shouldStartWelcomeTour,
} from "@/lib/ui/welcomeTourPrefs";

type Placement = "top" | "bottom" | "left" | "right";
type Step = {
  key: string;
  selector: string;
  title: string;
  body: string;
  placement: Placement;
  /** step 3 lands the cursor in the description box */
  focusTarget?: boolean;
};

const GAP = 12; // px between the target and the popover
const PAD = 16; // viewport clamp padding
const POP_W = 288; // popover width (matches w-72)

export default function WelcomeTour() {
  const { user, loading } = useAuth();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const startedRef = useRef(false);
  const popRef = useRef<HTMLDivElement | null>(null);
  const nextBtnRef = useRef<HTMLButtonElement | null>(null);

  // Build the step list once auth resolves, then start — first visit this
  // browser, ever. Guarded by startedRef (this mount) AND the localStorage
  // "seen" flag (this browser, forever), so a remount after the OAuth
  // sign-in redirect can't re-trigger it: see shouldStartWelcomeTour().
  useEffect(() => {
    if (!shouldStartWelcomeTour({ loading, started: startedRef.current, seen: hasSeenWelcomeTour() })) {
      return;
    }
    startedRef.current = true;
    // Mark seen NOW, not only on dismiss — so a reload or a sign-in redirect
    // mid-tour can't re-trigger it (see lib/ui/welcomeTourPrefs.ts).
    markWelcomeTourSeen();

    const list: Step[] = [];
    if (!user) {
      list.push({
        key: "signin",
        selector: '[data-tour="signin"]',
        title: "Save your searches",
        body: "Sign in here to keep your searches and pick up where you left off. It's optional — you're welcome to explore without an account.",
        placement: "right",
      });
    }
    list.push({
      key: "samples",
      selector: '[data-tour="samples"]',
      title: "Want a quick demo?",
      body: "Pick one of these sample companies to see real grant matches instantly — no typing required.",
      placement: "top",
    });
    list.push({
      key: "describe",
      selector: '[data-tour="describe"]',
      title: "Describe your company",
      body: "Give a good description here — as much detail as you like (what you build, who it's for, your size, funding). The more you share, the more specific your grant matches.",
      placement: "bottom",
      focusTarget: true,
    });
    setSteps(list);
    setIndex(0);
  }, [loading, user]);

  const active = !!steps && !done && index < steps.length;
  const step = active ? steps![index] : null;

  const end = useCallback(() => {
    // Already marked seen at start; re-marking here is a harmless, idempotent
    // safety net in case that first write hit a transient storage failure.
    markWelcomeTourSeen();
    setDone(true);
    setRect(null);
    setPos(null);
  }, []);

  const next = useCallback(() => {
    setIndex((i) => {
      const total = steps?.length ?? 0;
      if (i + 1 >= total) {
        markWelcomeTourSeen();
        setDone(true);
        return i;
      }
      return i + 1;
    });
  }, [steps]);

  // Locate + measure the current target; skip a step whose target is missing.
  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(step.selector);
    if (!el || (el.getBoundingClientRect().width === 0 && el.getBoundingClientRect().height === 0)) {
      next();
      return;
    }
    // Bring the target into view; keep it instant so measurement is stable.
    try {
      el.scrollIntoView({ block: "center", behavior: "auto" });
    } catch {
      /* older browsers — ignore */
    }
    const measure = () => setRect(el.getBoundingClientRect());
    measure();
    // Re-measure after the sidebar's ~0.2s expand transition settles.
    const raf = requestAnimationFrame(measure);
    const t = window.setTimeout(measure, 260);

    // Land the cursor in the description box on its step.
    let focusT = 0;
    if (step.focusTarget) {
      focusT = window.setTimeout(() => {
        try {
          el.focus({ preventScroll: true });
        } catch {
          /* not focusable — ignore */
        }
      }, 140);
    }

    const onMove = () => setRect(el.getBoundingClientRect());
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      clearTimeout(focusT);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [step, next]);

  // Position the popover from the target rect + the popover's own size, clamped.
  useLayoutEffect(() => {
    if (!rect || !step) {
      setPos(null);
      return;
    }
    const pop = popRef.current;
    const pw = pop?.offsetWidth || POP_W;
    const ph = pop?.offsetHeight || 150;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top: number;
    let left: number;
    switch (step.placement) {
      case "right":
        left = rect.right + GAP;
        top = rect.top;
        break;
      case "left":
        left = rect.left - GAP - pw;
        top = rect.top;
        break;
      case "top":
        left = rect.left;
        top = rect.top - GAP - ph;
        break;
      case "bottom":
      default:
        left = rect.left;
        top = rect.bottom + GAP;
        break;
    }
    left = Math.max(PAD, Math.min(left, vw - pw - PAD));
    top = Math.max(PAD, Math.min(top, vh - ph - PAD));
    setPos({ top, left });
  }, [rect, step]);

  // Esc dismisses. (Enter/arrows are left to the focused Next button so we never
  // hijack typing once the description box has focus.)
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        end();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, end]);

  // Move focus to Next so keyboard users can advance — except on the describe
  // step, where the textarea deliberately holds focus.
  useEffect(() => {
    if (!active || !step || step.focusTarget) return;
    const t = window.setTimeout(() => nextBtnRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, [active, step]);

  if (!active || !step || typeof document === "undefined") return null;

  const total = steps!.length;
  const isLast = index + 1 >= total;

  const highlightStyle: CSSProperties = {
    position: "fixed",
    top: (rect?.top ?? 0) - 6,
    left: (rect?.left ?? 0) - 6,
    width: (rect?.width ?? 0) + 12,
    height: (rect?.height ?? 0) + 12,
    borderRadius: 10,
    // A viewport-filling dim via a huge spread, with a token-colored ring on the
    // target. rgba (not hex) keeps check:hex happy; var() adapts to the theme.
    boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55), 0 0 0 2px var(--color-action)",
    pointerEvents: "none",
    zIndex: 60,
    transition: "top 120ms ease, left 120ms ease, width 120ms ease, height 120ms ease",
  };

  const popStyle: CSSProperties = pos
    ? { position: "fixed", top: pos.top, left: pos.left, width: POP_W, zIndex: 61 }
    : { position: "fixed", top: 0, left: 0, width: POP_W, zIndex: 61, visibility: "hidden" };

  return createPortal(
    <>
      {rect && <div aria-hidden style={highlightStyle} />}
      <div
        ref={popRef}
        role="dialog"
        aria-modal="false"
        aria-label="Welcome guide"
        style={popStyle}
        className="rounded-lg border border-structure-on-canvas bg-canvas-alt p-4 text-foreground shadow-overlay"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="font-display text-[14px] font-bold leading-snug text-structure-on-canvas">
            {step.title}
          </p>
          <button
            type="button"
            onClick={end}
            aria-label="Skip guide"
            className="-mr-1 -mt-1 shrink-0 rounded-sm p-1 text-structure-on-canvas transition hover:bg-structure hover:text-token-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <p className="mt-1.5 text-pretty font-body text-[13px] leading-relaxed text-foreground">
          {step.body}
        </p>

        <div className="mt-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden>
            {steps!.map((s, i) => (
              <span
                key={s.key}
                className={`h-1.5 w-1.5 rounded-full transition ${
                  i === index
                    ? "bg-structure-on-canvas"
                    : i < index
                    ? "bg-structure-on-canvas/50"
                    : "bg-structure-on-canvas/20"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={end}
              className="font-mono text-[11px] uppercase tracking-eyebrow text-foreground underline underline-offset-4 transition hover:text-structure-on-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
            >
              Skip
            </button>
            <button
              ref={nextBtnRef}
              type="button"
              onClick={next}
              className="inline-flex min-h-[36px] items-center rounded-sm bg-structure px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-eyebrow text-token-white shadow-sm transition hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-structure-on-canvas focus-visible:ring-offset-2"
            >
              {isLast ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
