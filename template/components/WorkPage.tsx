import Link from 'next/link';
import { Cta, Header, Footer, PageHead } from './Chrome';
import { Specimen } from './Specimen';
import { fillNodes, rich } from './Text';
import { fill, has, L, type Lang } from '@/lib/content';
import { mailto } from '@/lib/site';
import { getProject, projectHref } from '@/lib/projects';
import { fitAmount } from '@/lib/fit';

/** Keep a price on one line: "1,500 ₾" must never break before the sign or, in Georgian, inside "1 500". */
const nb = (s: string) => s.replace(/ /g, '\u00a0');

/**
 * The Work page: the offer as an invoice's total line (the package, its terms, and the amount standing
 * on the field's edge), an example, the call to action by email, what the client gets and how it goes.
 */
export function WorkPage({ lang }: { lang: Lang }) {
  const c = L(lang).work!;
  // The example is a project's picture; with the projects section off (or no text in this language) it is left out.
  const example = c.example && has(lang, 'projects') ? getProject(c.example.project) : undefined;
  const sp = example?.docs[lang] ? example.specimen : undefined;
  const mail = mailto(c.contact.subject, c.contact.body);
  const amount = fill(c.amount, { price: nb(c.price) });
  // The amount runs from margin to margin below 1000 px: its width, measured in the page's fonts (lib/fit.ts).
  const fit = { '--amount-fit': String(Math.round(fitAmount(amount, L(lang).script).em * 10000) / 10000) } as React.CSSProperties;
  return (
    <>
      <Header lang={lang} current="work" page="/work" />
      <main id="main" style={fit}>
        {/* The package as an invoice's total line: its name and the terms of the price, and the amount,
            which stands on the field's edge the way the name does on the home page. */}
        <PageHead lang={lang} title={c.title} lede={rich(c.lede)} field>
          <dl className="price">
            <dt>{rich(c.package)}</dt>
            <dd className="price__note">{rich(c.priceNote)}</dd>
            <dd className="price__amount">{rich(amount)}</dd>
          </dl>
        </PageHead>
        <div className="wrap page-body page-body--work">
          {/* In reading order: the example, the next step (with who it is for), then the detail. From
              1000 px the next step is the side column and stays in view; below, "who it's for" closes
              the page. */}
          <div className="split split--work">
            {sp && example && c.example && (
              <figure className="example">
                <Specimen specimen={sp} lang={lang} priority />
                <figcaption>{fillNodes(c.example.caption, { project: <Link href={projectHref(example, lang)}>{example.docs[lang]!.name}</Link> })}</figcaption>
              </figure>
            )}

            <div className="split__side">
              <section className="cta-block" aria-labelledby="cta-h">
                <h2 id="cta-h">{rich(c.contact.heading)}</h2>
                <p>{rich(c.contact.text)}</p>
                <Cta href={mail}>{rich(c.contact.button)}</Cta>
              </section>
              {c.who && (
                <section className="prose who" aria-labelledby="who-h">
                  <h2 id="who-h">{rich(c.who.heading)}</h2>
                  <p>{rich(c.who.text)}</p>
                </section>
              )}
            </div>

            <div className="prose split__main">
              <h2>{rich(c.get.heading)}</h2>
              <dl className="lines">
                {c.get.items.map(({ term, text }) => (
                  <div key={term}><dt>{rich(term)}</dt><dd>{rich(text)}</dd></div>
                ))}
              </dl>

              <h2>{rich(c.how.heading)}</h2>
              <ol className="steps">{c.how.steps.map((x) => <li key={x}><span>{rich(x)}</span></li>)}</ol>
            </div>
          </div>
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}
