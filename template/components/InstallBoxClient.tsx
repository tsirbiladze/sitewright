'use client';

// The only parts of the install box that run in the browser: the tabs' state and keys, and the two
// copy buttons. Everything else (labels, commands, notes, links) is drawn on the server by
// ./InstallBox.tsx and passed in, so the browser gets only the page's own language. The two copy
// icons live here: a page has up to seven copy buttons, and icons passed from the server would be
// repeated in the page's data once per button.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/** Copies text; falls back to a hidden textarea where the async clipboard is unavailable. */
async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

const CopyIcon = () => (
  <svg className="i-copy" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M5 15V6a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);
const CheckIcon = () => (
  <svg className="i-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** A state that falls back to `idle` after `ms`, for "Copied". */
function useFlash<T extends string>(idle: T, ms: number) {
  const [state, setState] = useState<T>(idle);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = (next: T) => {
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(idle), ms);
  };
  return [state, flash] as const;
}

/**
 * The copy button beside a command, with both icons (CSS shows one); the label turns into "Copied"
 * when it worked, and a live region says so.
 */
export function CopyButton({ text, label, copiedLabel, describedBy }: { text: string; label: string; copiedLabel: string; describedBy?: string }) {
  const [state, flash] = useFlash<'idle' | 'copied'>('idle', 2200);
  const copied = state === 'copied';
  return (
    <>
      <button type="button" className={copied ? 'copy is-copied' : 'copy'} onClick={async () => { await writeClipboard(text); flash('copied'); }} aria-describedby={describedBy}>
        <CopyIcon />
        <CheckIcon />
        <span>{copied ? copiedLabel : label}</span>
      </button>
      <span className="sr-only" aria-live="polite">{copied ? copiedLabel : ''}</span>
    </>
  );
}

/** "Copy as Markdown": fetches the page's .md twin and puts it on the clipboard. */
export function CopyMarkdown({ href, label, copiedLabel, failedLabel }: { href: string; label: string; copiedLabel: string; failedLabel: string }) {
  const [state, flash] = useFlash<'idle' | 'copied' | 'failed'>('idle', 2600);

  async function copy() {
    const text = fetch(href).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.text(); });
    try {
      // Safari only allows clipboard writes inside the click, so hand it the pending text.
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((v) => new Blob([v], { type: 'text/plain' })) })]);
      } else {
        await writeClipboard(await text);
      }
      flash('copied');
    } catch {
      try { await writeClipboard(await text); flash('copied'); } catch { flash('failed'); }
    }
  }

  return (
    <>
      <button type="button" className={state === 'copied' ? 'link-btn is-copied' : 'link-btn'} onClick={copy}>
        {state === 'copied' ? <CheckIcon /> : <CopyIcon />}
        <span>{state === 'copied' ? copiedLabel : label}</span>
      </button>
      <span className="sr-only" aria-live="polite">{state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : ''}</span>
    </>
  );
}

/**
 * The tab row and its panels: one row at every width (if it ever overflows, the edge with more
 * fades), arrow keys, Home and End. Labels and panels come drawn from the server.
 */
export function Tabs({ base, ids, labelledBy, labels, panels }: { base: string; ids: string[]; labelledBy: string; labels: ReactNode[]; panels: ReactNode[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const list = useRef<HTMLDivElement>(null);

  const fade = useCallback(() => {
    const el = list.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle('fade-start', max > 1 && el.scrollLeft > 1);
    el.classList.toggle('fade-end', max > 1 && el.scrollLeft < max - 1);
  }, []);
  useEffect(() => {
    fade();
    window.addEventListener('resize', fade);
    document.fonts?.ready.then(fade);
    return () => window.removeEventListener('resize', fade);
  }, [fade]);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const last = ids.length - 1;
    const next = ({ ArrowRight: active === last ? 0 : active + 1, ArrowLeft: active === 0 ? last : active - 1, Home: 0, End: last } as Record<string, number>)[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setActive(next);
    const tab = refs.current[next];
    tab?.focus();
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  return (
    <>
      <div className="tabs" role="tablist" aria-labelledby={labelledBy} onKeyDown={onKey} onScroll={fade} ref={list}>
        {ids.map((id, i) => (
          <button
            key={id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            className="tab"
            id={`${base}-tab-${id}`}
            aria-controls={`${base}-panel-${id}`}
            aria-selected={i === active}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
          >
            {labels[i]}
          </button>
        ))}
      </div>
      {ids.map((id, i) => (
        <div key={id} className="panel" role="tabpanel" id={`${base}-panel-${id}`} aria-labelledby={`${base}-tab-${id}`} hidden={i !== active}>
          {panels[i]}
        </div>
      ))}
    </>
  );
}
