"use client";

// A short confetti burst for finished work. Pure DOM + Web Animations, nothing
// to install, and skipped entirely for people who prefer reduced motion.

const colors = ["#4338CA", "#F4A938", "#0E7C56", "#E5536F", "#7C73E6"];

export function celebrate(origin?: { x: number; y: number }) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 3;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden";
  document.body.appendChild(layer);

  const pieces = 28;
  let finished = 0;
  for (let index = 0; index < pieces; index += 1) {
    const piece = document.createElement("span");
    const width = 5 + Math.random() * 4;
    piece.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${width * (0.6 + Math.random())}px;border-radius:2px;background:${colors[index % colors.length]}`;
    layer.appendChild(piece);
    const angle = (Math.PI * 2 * index) / pieces + Math.random() * 0.4;
    const distance = 70 + Math.random() * 90;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 40;
    const animation = piece.animate(
      [
        { opacity: 1, transform: "translate(0, 0) rotate(0deg)" },
        { opacity: 1, offset: 0.7, transform: `translate(${dx}px, ${dy + 40}px) rotate(${Math.random() * 360}deg)` },
        { opacity: 0, transform: `translate(${dx * 1.1}px, ${dy + 110}px) rotate(${Math.random() * 540}deg)` },
      ],
      { duration: 900 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.3,1)" },
    );
    animation.onfinish = () => {
      finished += 1;
      if (finished === pieces) layer.remove();
    };
  }
  // Safety net in case an animation never reports finishing.
  window.setTimeout(() => layer.remove(), 2500);
}

/** Confetti from the centre of the element that was tapped. */
export function celebrateFrom(element: Element | null | undefined) {
  const box = element?.isConnected ? element.getBoundingClientRect() : null;
  celebrate(box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : undefined);
}
