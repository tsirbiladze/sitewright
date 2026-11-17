import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontmatter } from '../lib/frontmatter';

test('reads key: value lines and strips one pair of quotes', () => {
  const { data, body } = frontmatter('---\ntitle: The /x Skill\nsummary: "Quoted: with a colon."\nstatus: \'beta\'\n---\n# Body\n');
  assert.deepEqual(data, { title: 'The /x Skill', summary: 'Quoted: with a colon.', status: 'beta' });
  assert.equal(body, '# Body\n');
});

test('reads one level of nesting', () => {
  const { data } = frontmatter('---\nname: x\nmetadata:\n  version: "0.1.1"\n  homepage: "https://example.com/projects/x"\nlicense: MIT\n---\n');
  assert.deepEqual(data, { name: 'x', metadata: { version: '0.1.1', homepage: 'https://example.com/projects/x' }, license: 'MIT' });
});

test('handles CRLF line endings', () => {
  const { data, body } = frontmatter('---\r\ntitle: Windows\r\n---\r\nText');
  assert.deepEqual(data, { title: 'Windows' });
  assert.equal(body, 'Text');
});

test('keeps Georgian values as they are', () => {
  const { data } = frontmatter('---\ntitle: სკილი /fixture\ncategory: სავაჭრო დოკუმენტები\n---\n');
  assert.equal(data.title, 'სკილი /fixture');
  assert.equal(data.category, 'სავაჭრო დოკუმენტები');
});

test('returns the whole source as the body when there is no frontmatter', () => {
  const src = '# Just Markdown\n\n---\n\nA rule above, not frontmatter.';
  assert.deepEqual(frontmatter(src), { data: {}, body: src });
});
