'use client';

import { useEffect, useRef, useState } from 'react';
import type { TocItem } from '@/lib/projects';

const WIDE = '(min-width: 1080px)';

/**
 * "On this page". Wide screens: a sticky list beside the article. Narrower screens: the list sits
 * above the article, and once it scrolls away a bar at the top shows the section you are reading
 * and opens into the list, until the call to action at the end comes into view. The current section is marked with aria-current. One scroll listener,
 * throttled to animation frames.
 */
export function Toc({ items, title }: { items: TocItem[]; title: string }) {
  const [active, setActive] = useState<string | null>(null);
  const [bar, setBar] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const box = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => el !== null);
    const layout = nav.current?.parentElement;
    const cta = layout?.querySelector<HTMLElement>('.cta-block');
    const wide = window.matchMedia(WIDE);
    let frame = 0;
    const update = () => {
      frame = 0;
      // A section is current once its heading passes a line a third of the way down the screen.
      const line = Math.min(window.innerHeight / 3, 260);
      let current: string | null = null;
      for (const el of els) if (el.getBoundingClientRect().top <= line) current = el.id;
      // At the very bottom, a short last section may never reach the line.
      const last = els[els.length - 1];
      const end = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (end && last && last.getBoundingClientRect().top < window.innerHeight) current = last.id;
      setActive(current);
      // The bar shows while the list is above the screen and the article is still on it. It steps
      // aside once the call to action comes into view: from there the next step matters more.
      const listGone = (nav.current?.getBoundingClientRect().bottom ?? 1) < 0;
      const done = cta ? cta.getBoundingClientRect().top < window.innerHeight : (layout?.getBoundingClientRect().bottom ?? 0) <= 120;
      const show = !wide.matches && listGone && !done;
      setBar(show);
      if (!show && box.current) box.current.open = false;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [items]);

  const current = items.find((i) => i.id === active);
  const list = (inBar: boolean) => (
    <ol>
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            aria-current={item.id === active ? 'true' : undefined}
            onClick={inBar ? () => { if (box.current) box.current.open = false; } : undefined}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <nav className="toc" aria-labelledby="toc-h" ref={nav}>
      <h2 id="toc-h">{title}</h2>
      {list(false)}
      <details
        className="toc-bar"
        hidden={!bar}
        ref={box}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || !box.current?.open) return;
          box.current.open = false;
          box.current.querySelector('summary')?.focus();
        }}
      >
        <summary>
          <span className="toc-bar__label">{title}</span>
          {current && <span className="toc-bar__now">{current.text}</span>}
          <svg className="toc-bar__chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </summary>
        <div className="toc-bar__list">{list(true)}</div>
      </details>
    </nav>
  );
}
