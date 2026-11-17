// What every page of a language shares (lib/site.ts, lib/routes.ts): the structured data, the call to
// action that leads to Work, mailto links and hreflang, all from the content.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useSite, editJson, removeContent, siteUrl as site } from './helpers';
import { siteJsonLd, jsonLdScript, jsonLdIds, mailto, mainCta } from '../lib/site';
import { alternates, twin } from '../lib/routes';

before(() => { useSite(); });

test('the site JSON-LD holds only known facts: name in both languages, job, url, email, real profile links', () => {
  for (const lang of ['en', 'ka'] as const) {
    const [person, website] = siteJsonLd(lang)['@graph'] as Record<string, any>[];
    assert.equal(person['@type'], 'Person');
    assert.equal(person['@id'], jsonLdIds.person());
    assert.equal(person.name, lang === 'en' ? 'Elisabed Shabloni' : 'ელისაბედ შაბლონი');
    assert.equal(person.alternateName, lang === 'en' ? 'ელისაბედ შაბლონი' : 'Elisabed Shabloni');
    assert.equal(person.url, site);
    assert.equal(person.email, 'mailto:elisabed@example.com');
    assert.deepEqual(person.sameAs, ['https://code.example.com/elisabed'], 'a placeholder link is not a profile yet');
    assert.deepEqual(Object.keys(person).sort(), ['@id', '@type', 'alternateName', 'email', 'jobTitle', 'name', 'sameAs', 'url']);
    assert.equal(website['@type'], 'WebSite');
    assert.equal(website.inLanguage, lang);
    assert.deepEqual(website.author, { '@id': jsonLdIds.person() });
  }
  assert.equal((siteJsonLd('ka')['@graph'][1] as any).url, `${site}/ka`);
  assert.equal((siteJsonLd('en')['@graph'][1] as any).url, site);
});

test('jsonLdScript cannot close its <script> tag', () => {
  const out = jsonLdScript({ name: '</script><script>alert(1)</script>' });
  assert.doesNotMatch(out, /</);
  assert.deepEqual(JSON.parse(out), { name: '</script><script>alert(1)</script>' });
});

test('mailto: the site’s address, with an encoded subject and body', () => {
  assert.equal(mailto(), 'mailto:elisabed@example.com');
  assert.equal(mailto('A site & more', 'Line 1\n\nLine 2'), 'mailto:elisabed@example.com?subject=A%20site%20%26%20more&body=Line%201%0A%0ALine%202');
});

test('the call to action leads to Work with its price; without a Work page, to an email', () => {
  assert.deepEqual(mainCta('en'), { href: '/work', label: 'See packages from 1,500 ₾' });
  assert.deepEqual(mainCta('ka'), { href: '/ka/work', label: 'პაკეტები 1 500 ₾-დან' });
  removeContent('ka/work.json');
  assert.deepEqual(mainCta('ka'), { href: 'mailto:elisabed@example.com?subject=%E1%83%92%E1%83%90%E1%83%9B%E1%83%90%E1%83%A0%E1%83%AF%E1%83%9D%E1%83%91%E1%83%90%20%E1%83%A8%E1%83%94%E1%83%9C%E1%83%98%20%E1%83%A1%E1%83%90%E1%83%98%E1%83%A2%E1%83%98%E1%83%93%E1%83%90%E1%83%9C', label: 'მომწერე' });
  useSite();
  editJson('site.json', (s) => { s.sections.work = false; });
  assert.equal(mainCta('en').label, 'Email me');
  useSite();
});

test('an email address still [[to give]] is a dashed box wherever it shows, and nothing links to it', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');
  const { Footer, NotFoundBody } = await import('../components/Chrome');
  const { AboutPage } = await import('../components/AboutPage');
  const { WorkPage } = await import('../components/WorkPage');
  const { Home } = await import('../components/Home');
  const { llmsTxt } = await import('../lib/agent-md');
  const { checkSite } = await import('./site-checks');
  useSite();
  editJson('site.json', (s) => { s.email = '[[your email address]]'; });
  assert.equal(mailto('Hello'), null);
  const box = '<span class="ph">[[your email address]]</span>';
  for (const lang of ['en', 'ka']) {
    const pages = [Footer, NotFoundBody, AboutPage, WorkPage].map((c) => renderToStaticMarkup(createElement(c, { lang })));
    for (const html of pages) assert.doesNotMatch(html, /mailto:/);
    assert.ok(pages[0].includes(box), 'footer');
    assert.ok(pages[1].includes(box), '404');
    assert.ok(pages[2].includes(box), 'About’s contact list');
    assert.match(pages[2], /<span class="cta cta--ph">/, 'About’s button: its words in the dashed box, no link');
    assert.match(pages[3], /<span class="cta cta--ph">/, 'Work’s button');
    assert.equal((siteJsonLd(lang)['@graph'][0] as any).email, undefined);
  }
  assert.doesNotMatch(llmsTxt(), /mailto:|\[\[your email/);
  editJson('site.json', (s) => { s.sections.work = false; });
  assert.deepEqual(mainCta('en'), { href: null, label: 'Email me' });
  assert.match(renderToStaticMarkup(createElement(Home, { lang: 'en' })), /<span class="cta cta--ph">Email me<\/span>/);
  await checkSite();
  useSite();
});

test('hreflang pairs a page with its twin and defaults to the main language; a page without a twin has none', () => {
  assert.deepEqual(alternates('/work'), { languages: { en: '/work', ka: '/ka/work', 'x-default': '/work' } });
  assert.equal(twin('/about', 'ka'), '/ka/about');
  removeContent('ka/about.json');
  assert.equal(alternates('/about'), undefined);
  assert.equal(twin('/about', 'ka'), undefined);
  useSite();
});

test('About without a CV file: the content is valid and the page draws no CV row', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { createElement } = await import('react');
  const { loadContent } = await import('../lib/content');
  const { AboutPage } = await import('../components/AboutPage');
  const label = loadContent().lang.en.about!.cv!.label;
  assert.ok(renderToStaticMarkup(createElement(AboutPage, { lang: 'en' })).includes(`<dt>${label}</dt>`), 'the demo has the row');
  editJson('en/about.json', (a) => { delete a.cv; });
  assert.equal(loadContent().lang.en.about!.cv, undefined, 'still valid content');
  const without = renderToStaticMarkup(createElement(AboutPage, { lang: 'en' }));
  assert.ok(!without.includes(`<dt>${label}</dt>`));
  assert.doesNotMatch(without, / download=/);
});
