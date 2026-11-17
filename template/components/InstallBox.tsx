// The install box and the command wells, drawn on the server. Only the tabs' state and the copy
// buttons run in the browser (./InstallBoxClient.tsx), so the browser gets only the page's own
// language and no code for what never changes.
import { useId } from 'react';
import { L, type Lang } from '@/lib/content';
import type { InstallTab } from '@/lib/projects';
import { CopyButton, CopyMarkdown, Tabs } from './InstallBoxClient';

/**
 * A wrapping command breaks between its arguments first: each argument is one box that moves to the
 * next line whole (`npx skills@latest add` / `owner/name`). Only an argument longer than the line
 * breaks inside, after a slash or @ (owner/ name), never after a leading slash.
 */
const breakable = (text: string) =>
  text.split(' ').flatMap((arg, i) => {
    const parts = arg.split(/(?<=\w[/@])(?=\w)/).flatMap((part, j) => (j ? [<wbr key={j} />, part] : [part]));
    const box = <span className="arg" key={i}>{parts}</span>;
    return i ? [' ', box] : [box];
  });

/**
 * A command in its own well, with a copy button that says "Copied" when it worked. By default the
 * well scrolls sideways; `wrap` lets a one-line command wrap instead, with continuation lines
 * indented, so a phone shows all of it.
 */
export function Command({ text, lang, light = false, wrap = false, label }: { text: string; lang: Lang; light?: boolean; wrap?: boolean; label?: string }) {
  const id = useId();
  const words = L(lang).ui.install;
  return (
    <div className={['cmd', light && 'cmd--light', wrap && 'cmd--wrap'].filter(Boolean).join(' ')}>
      {wrap ? (
        <pre aria-label={label}><code id={`${id}-c`}>{breakable(text)}</code></pre>
      ) : (
        <pre tabIndex={0} aria-label={label}><code id={`${id}-c`}>{text}</code></pre>
      )}
      <CopyButton text={text} label={words.copy} copiedLabel={words.copied} describedBy={label ? undefined : `${id}-c`} />
    </div>
  );
}

const MdIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M6 15.5v-7l2.75 3.25L11.5 8.5v7M15.75 8.5v6.5m0 0l-2.25-2.4m2.25 2.4l2.25-2.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const DocIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 3.5h6.5L18 8v12.5H7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M13.5 3.5V8H18M9.5 12.5h6M9.5 16h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
);
const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" /></svg>
);

/**
 * A tab's label, in its own box: the tab is at least 44 px wide, and the bar that marks the selected
 * tab is drawn under the label, not under the whole target. When the label ends with a short form
 * ("აგენტის სკილი" → "სკილი"), the start can be hidden on the narrowest phones so all tabs fit one
 * row; it stays in the accessible name.
 */
function TabLabel({ label, short }: { label: string; short?: string }) {
  if (!short || !label.endsWith(short) || label === short) return <span className="tab__label">{label}</span>;
  return <span className="tab__label"><span className="tab__start">{label.slice(0, -short.length)}</span>{short}</span>;
}

/**
 * The links under a project's header: a skill's SKILL.md and repository, then the page as Markdown
 * for agents. With install tabs they sit under the box that
 * straddles the header's edge; without, they stand alone under the header.
 */
export function InstallBox({ tabs, lang, fullHref, sourceHref, sourceLabel, markdownHref }: { tabs: InstallTab[]; lang: Lang; fullHref?: string; sourceHref?: string; sourceLabel?: string; markdownHref?: string }) {
  const base = useId();
  const t = L(lang).ui.install;
  const links = (
    <ul className="install__links">
      {fullHref && (
        <li>
          <DocIcon />
          {/* SKILL.md is written in English */}
          <a href={fullHref} hrefLang={lang === 'en' ? undefined : 'en'}>{t.full}</a>
        </li>
      )}
      {sourceHref && (
        <li>
          <GitHubIcon />
          <span>{t.source}: <a href={sourceHref}>{sourceLabel}</a></span>
        </li>
      )}
      {markdownHref && (
        <>
          <li>
            <MdIcon />
            <a href={markdownHref} type="text/markdown">{t.markdownView}</a>
          </li>
          <li>
            <CopyMarkdown href={markdownHref} label={t.markdownCopy} copiedLabel={t.copied} failedLabel={t.markdownFailed} />
          </li>
        </>
      )}
    </ul>
  );
  if (!tabs.length) return <section className="wrap install install--links" aria-label={t.heading}>{links}</section>;

  return (
    <section className="wrap install" aria-labelledby={`${base}-h`}>
      <div className="install__panel">
        <h2 id={`${base}-h`}>{t.heading}</h2>
        <Tabs
          base={base}
          labelledBy={`${base}-h`}
          ids={tabs.map((tab) => tab.id)}
          labels={tabs.map((tab) => <TabLabel key={tab.id} label={tab.label[lang]} short={tab.short?.[lang]} />)}
          panels={tabs.map((tab) => (
            <>
              {'commands' in tab ? (
                tab.commands.map((c) => (tab.language === 'json'
                  ? <Command key={c} text={c} lang={lang} label={`${tab.label[lang]} ${t.config}`} />
                  : <Command key={c} text={c} lang={lang} wrap />))
              ) : (
                <a className="btn-ghost" href={tab.download.href}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {tab.download.label[lang]}
                </a>
              )}
              <p className="note">{tab.note[lang]}</p>
            </>
          ))}
        />
      </div>
      {links}
    </section>
  );
}
