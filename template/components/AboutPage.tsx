import Link from 'next/link';
import { Cta, Email, Header, Footer, PageHead, Placeholder } from './Chrome';
import { isPlaceholder, rich } from './Text';
import { getContent, L, linkLabel, liveHref, type AboutText, type Lang } from '@/lib/content';
import { bareUrl, mailto } from '@/lib/site';

type Entry = AboutText['sections'][number]['entries'][number];

/**
 * An entry whose every field is still a placeholder is drawn as one dashed block, its lines set as the
 * real ones will be; otherwise each `[[…]]` inside real text is a dashed word.
 */
const allPlaceholders = (values: (string | undefined)[]) => values.filter(Boolean).every((v) => isPlaceholder(v!));

/** A title that links when its address is a page that exists (a link into a section that is off is dropped). */
function EntryTitle({ entry }: { entry: Entry }) {
  const target = entry.href && !isPlaceholder(entry.href) ? liveHref(entry.href) : null;
  if (!target) return <>{rich(entry.title)}</>;
  return target.startsWith('/') ? <Link href={target}>{rich(entry.title)}</Link> : <a href={target}>{rich(entry.title)}</a>;
}

/** About: the person's name as the masthead, short facts, a contact block with every link and the CV, then the CV itself. */
export function AboutPage({ lang }: { lang: Lang }) {
  const c = getContent();
  const l = L(lang);
  const a = l.about!;
  const words = l.ui.chrome;
  return (
    <>
      <Header lang={lang} current="about" page="/about" />
      <main id="main">
        <PageHead lang={lang} title={l.site.name} lede={rich(a.lede)} name>
          <dl className="meta cv-meta">
            {a.facts.map((f) => <div key={f.label}><dt>{rich(f.label)}</dt><dd>{rich(f.value)}</dd></div>)}
          </dl>
        </PageHead>

        <div className="wrap page-body">
          <div className="cv">
            <section className="cv__contact cta-block" aria-labelledby="contact-h">
              <h2 id="contact-h">{rich(a.contact.heading)}</h2>
              <p>{rich(a.contact.text)}</p>
              <Cta href={mailto(a.contact.subject)}>{rich(a.contact.button)}</Cta>
              <dl className="cv-links">
                <div><dt>{words.email}</dt><dd><Email className="email" split /></dd></div>
                {c.site.links.map((link) => (
                  <div key={link.url}>
                    <dt>{linkLabel(link, lang)}</dt>
                    <dd>{isPlaceholder(link.url) ? <Placeholder>{link.url}</Placeholder> : <a href={link.url}>{bareUrl(link.url)}</a>}</dd>
                  </div>
                ))}
                {/* The CV as a file is the owner's to have or not: without one the row is not drawn. */}
                {a.cv && (
                  <div>
                    <dt>{rich(a.cv.label)}</dt>
                    <dd>{isPlaceholder(a.cv.href) ? <Placeholder>{a.cv.href}</Placeholder> : <a href={a.cv.href} download>{rich(a.cv.text)}</a>}</dd>
                  </div>
                )}
              </dl>
            </section>

            <div className="cv__main">
              {a.sections.map((section, i) => (
                <section key={section.heading} aria-labelledby={`cv-h-${i}`}>
                  <h2 id={`cv-h-${i}`}>{rich(section.heading)}</h2>
                  <ol className="cv-list">
                    {section.entries.map((e, j) => {
                      const ph = allPlaceholders([e.when, e.title, e.where, e.text, e.stack]);
                      const plain = (s: string) => (ph ? s : rich(s));
                      return (
                        <li key={j} className={ph ? 'cv-entry cv-entry--ph' : 'cv-entry'}>
                          <p className="cv-entry__when">{e.date && !ph ? <time dateTime={e.date}>{e.when}</time> : plain(e.when)}</p>
                          <div>
                            <h3>{ph ? e.title : <EntryTitle entry={e} />}</h3>
                            <p className="cv-entry__where">{plain(e.where)}</p>
                            <p>{plain(e.text)}</p>
                            {e.stack && <p className="cv-entry__stack">{plain(e.stack)}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}

              <section aria-labelledby="stack-h">
                <h2 id="stack-h">{rich(a.stack.heading)}</h2>
                <dl className={allPlaceholders(a.stack.groups.map((g) => g.items)) ? 'cv-stack cv-stack--ph' : 'cv-stack'}>
                  {a.stack.groups.map((s) => (
                    <div key={s.group}><dt>{rich(s.group)}</dt><dd>{allPlaceholders([s.items]) ? s.items : rich(s.items)}</dd></div>
                  ))}
                </dl>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}
