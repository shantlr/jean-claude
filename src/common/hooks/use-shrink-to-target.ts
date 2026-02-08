import { animate } from 'framer-motion';
import { useCallback, type RefObject } from 'react';

/**
 * Three-phase "squeeze, shrink, fly" animation:
 *
 * Phase 1a — Squeeze width (spring):
 *   Width narrows to match the height, forming a tall square.
 *
 * Phase 1b — Shrink to squircle (spring):
 *   Both dimensions shrink to a small squircle with a whitish glow.
 *
 * Phase 2 — Fly (ease-out):
 *   The squircle translates to the target element,
 *   shrinking further and fading as it arrives.
 */
export function useShrinkToTarget({
  panelRef,
  targetSelector,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  targetSelector: string;
}) {
  const triggerAnimation = useCallback(async () => {
    const panel = panelRef.current;
    const target = document.querySelector(targetSelector);
    if (!panel || !target) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const panelRect = panel.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const squareSize = 80;

    // Center positions for the panel
    const panelCenterX = panelRect.left + panelRect.width / 2;
    const panelCenterY = panelRect.top + panelRect.height / 2;

    // Where the ghost needs to be positioned to stay centered as a square
    const shrunkLeft = panelCenterX - squareSize / 2;
    const shrunkTop = panelCenterY - squareSize / 2;

    // Create ghost element matching the overlay panel
    const ghost = document.createElement('div');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${panelRect.left}px`,
      top: `${panelRect.top}px`,
      width: `${panelRect.width}px`,
      height: `${panelRect.height}px`,
      opacity: 0,
      zIndex: '60',
      pointerEvents: 'none',
      borderRadius: '8px',
      border: '1px solid rgb(64, 64, 64)',
      background: 'rgb(38, 38, 38)',
      boxShadow:
        '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 100px -20px rgba(0,0,0,0.6)',
      overflow: 'hidden',
    });
    document.body.appendChild(ghost);

    // Intermediate square: width matches height, centered horizontally
    // const intermediateSize = panelRect.height;
    // const intermediateLeft = panelCenterX - intermediateSize / 2;

    // ── Phase 2: Fly to target ──
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    const finalSize = targetRect.height;
    const finalLeft = targetCenterX - finalSize / 2;
    const finalTop = targetCenterY - finalSize / 2;

    const PHASE_1_DURATION = 0.6;
    const PHASE_2_DURATION = 0.6;

    const anim = animate([
      // #1. Squeeze
      [
        ghost,
        {
          left: `${shrunkLeft}px`,
          top: `${shrunkTop}px`,
          position: 'fixed',
          height: `${squareSize}px`,
          width: `${squareSize}px`,
          opacity: 0.9,
          borderRadius: `20px`,
          boxShadow:
            '0 0 30px 6px rgba(255,255,255,0.25), 0 0 60px 12px rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.5)',
          background: 'rgb(65, 65, 75)',
        },
        {
          type: 'spring',
          duration: PHASE_1_DURATION,
          width: {
            duration: PHASE_1_DURATION * 0.8,
          },
          left: {
            duration: PHASE_1_DURATION * 0.8,
          },
        },
      ],

      // 2. Fly to target along a curve
      //    top eases out (swoops up fast, decelerates)
      //    left eases in (drifts slowly, then accelerates toward target)
      [
        ghost,
        {
          left: `${finalLeft}px`,
          top: `${finalTop}px`,
          width: `${finalSize}px`,
          height: `${finalSize}px`,
          opacity: 0,
          boxShadow: '0 0 12px 3px rgba(255,255,255,0.15)',
        },
        {
          duration: PHASE_2_DURATION,
          ease: [0.4, 0, 0.2, 1],
          top: { ease: [0.0, 0.0, 0.2, 1.0] },
          left: { ease: [0.5, 0.0, 1.0, 0.8] },
        },
      ],
    ]);
    await anim.then(() => anim.complete());

    ghost.remove();

    // Pulse the target
    target.classList.add('jobs-pulse');
    target.addEventListener(
      'animationend',
      () => target.classList.remove('jobs-pulse'),
      { once: true },
    );
  }, [panelRef, targetSelector]);

  return { triggerAnimation };
}
