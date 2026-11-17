// Typographic quotes in English prose (smartQuotes in lib/projects.ts): curly in the rendered text,
// straight in code, in the Markdown twin and on Georgian pages.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useSite, slug } from './helpers';

let skills: typeof import('../lib/projects');
before(async () => {
  useSite({ skill: true });
  skills = await import('../lib/projects');
});

test('apostrophes inside and at the end of words', () => {
  const q = skills.smartQuotes;
  assert.equal(q("the shipment's papers"), 'the shipment’s papers');
  assert.equal(q("don't, it's, we'll"), 'don’t, it’s, we’ll');
  assert.equal(q("the documents' dates"), 'the documents’ dates');
});

test('double quotes open after a space, a bracket or a dash, and close everywhere else', () => {
  const q = skills.smartQuotes;
  assert.equal(q('"check the documents"'), '“check the documents”');
  assert.equal(q('He said "yes" (and "no").'), 'He said “yes” (and “no”).');
  assert.equal(q('["a"] {"b"} —"c"– –"d"'), '[“a”] {“b”} —“c”– –“d”');
  assert.equal(q('"Hello," she said.'), '“Hello,” she said.');
  assert.equal(q('a "quote".'), 'a “quote”.');
});

test('single quotes as quotation marks', () => {
  assert.equal(skills.smartQuotes("a 'single' quote (and 'another')"), 'a ‘single’ quote (and ‘another’)');
});

test('text with no quotes, and Georgian quotes, pass through unchanged', () => {
  assert.equal(skills.smartQuotes('No quotes here — 1,500 ₾.'), 'No quotes here — 1,500 ₾.');
  assert.equal(skills.smartQuotes('„ვებგვერდი შენთვის“'), '„ვებგვერდი შენთვის“');
});

test('in the render: prose gets curly quotes, code spans and blocks keep straight ones', () => {
  const { html } = skills.renderMarkdownForTest('Run `say "hi"` and read the "rules" — it\'s quick.\n\n```bash\necho "it\'s"\n```\n', 'en');
  assert.match(html, /Run <code>say &quot;hi&quot;<\/code> and read the “rules” — it’s quick\./);
  assert.match(html, /<code class="language-bash">echo &quot;it&#39;s&quot;/);
});

test('in the render: emphasis, links, headings, lists and blockquotes', () => {
  const r = (md: string) => skills.renderMarkdownForTest(md, 'en').html;
  assert.match(r('**"bold"** and _"em"_'), /<strong>“bold”<\/strong> and <em>“em”<\/em>/);
  assert.match(r('A [link\'s "text"](/y).'), /<a href="\/y">link’s “text”<\/a>/);
  assert.match(r('## The "check" command\'s limits'), /<h2 id="the-check-commands-limits"><a class="h-anchor" href="#the-check-commands-limits">The “check” command’s limits<\/a><\/h2>/);
  assert.match(r('- "List" item\'s end'), /<li>“List” item’s end<\/li>/);
  assert.match(r('> "Quoted" text'), /<p>“Quoted” text<\/p>/);
});

test('Georgian docs are left as written', () => {
  const { html } = skills.renderMarkdownForTest('"ka" don\'t', 'ka');
  assert.match(html, /<p>&quot;ka&quot; don&#39;t<\/p>/);
});

test('the project page gets curly quotes; its Markdown twin and summary keep the source’s straight ones', () => {
  const doc = skills.getProject(slug)!.docs.en!;
  assert.match(doc.html, /alt="A marked &quot;demo&quot; invoice"/, 'alt text is an attribute, not prose');
  assert.match(doc.markdown, /!\[A marked "demo" invoice\]/);
  assert.doesNotMatch(doc.markdown, /[“”‘’]/);
});

test('an apostrophe right after inline code closes: `check`’s', () => {
  assert.match(skills.renderMarkdownForTest("The `check`'s output.", 'en').html, /<code>check<\/code>’s output/);
});

test('a quote right before inline code opens: “`code`”', () => {
  assert.match(skills.renderMarkdownForTest('Type "`npx`" first.', 'en').html, /“<code>npx<\/code>”/);
});

test('a leading apostrophe in an elision closes: ’90s', () => {
  assert.equal(skills.smartQuotes("the '90s"), 'the ’90s');
});
