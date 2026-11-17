// Fetch each agent skill's page text from its repo (the single source of truth) before `next build`.
// The skills are the projects of kind "skill" in content/projects/<slug>.json. For every language of
// the site (content/site.json) it fetches docs/<slug>.md (English) or docs/<slug>.<lang>.md, and
// CHANGELOG.md with CHANGELOG.<lang>.md where the repo has one; the main language's docs are required.
// Writes .content/skills/<slug>/{<lang>.md,SKILL.md,CHANGELOG*.md,images.json,source.json} and
// public/skills/<slug>/<image>. Then cuts the skill's specimen (its "specimen" in the project file)
// from its image as small WebP crops, public/skills/<slug>/<image>-<crop>.webp, listed in specimen.json.
// A site with no skill fetches nothing and needs no network.
//
// GitHub down: if a previous fetch exists, the build keeps using it (with a warning). The previous
// fetch is the working copy in .content/, or else the copy in .next/cache/skills/, which Vercel keeps
// between builds. With neither, the build stops and says why.
// Everything for a skill is fetched before anything is written, so a failure halfway never leaves a
// mix of two versions. The crops are cut from the image on disk, after a fetch or a fallback alike, so
// they come back with the previous fetch and always follow the project file.
//
// SKILLS_RAW_BASE overrides https://raw.githubusercontent.com (the tests serve fixtures locally).
// The "previous fetch" is recognised by the main language's file, .content/skills/<slug>/<lang>.md.
import { statSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const contentDir = join(root, 'content');
const { languages = ['en'] } = JSON.parse(readFileSync(join(contentDir, 'site.json'), 'utf8'));
const projectsDir = join(contentDir, 'projects');
const projects = existsSync(projectsDir)
  ? readdirSync(projectsDir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ slug: f.replace(/\.json$/, ''), ...JSON.parse(readFileSync(join(projectsDir, f), 'utf8')) }))
  : [];
const skills = projects.filter((p) => p.kind === 'skill');
const specimens = Object.fromEntries(skills.filter((s) => s.specimen).map((s) => [s.slug, s.specimen]));
const rawBase = (process.env.SKILLS_RAW_BASE ?? 'https://raw.githubusercontent.com').replace(/\/$/, '');
const raw = (repo, ref, path) => `${rawBase}/${repo}/${ref}/${path}`;
/** Where a language's page text lives in a skill's repo: docs/<slug>.md is English. */
const docFile = (slug, lang) => (lang === 'en' ? `docs/${slug}.md` : `docs/${slug}.${lang}.md`);

async function get(url, { optional = false, binary = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (res.status === 404 && optional) return null;
      if (!res.ok) throw Object.assign(new Error(`${res.status} ${url}`), { status: res.status });
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (err) {
      // A missing file won't appear on a retry; a network hiccup might.
      if (attempt >= 2 || (err.status && err.status < 500)) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

function imageSize(buf) {
  if (buf.subarray(1, 4).toString() === 'PNG') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

const why = (err) => [err.message, err.cause?.code ?? err.cause?.message].filter(Boolean).join(': ');
const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };

/**
 * Cut the skill's specimen crops from its self-hosted image as lossless WebP (pixel-exact text and
 * red marks, and smaller than lossy at this size) and list them in specimen.json for lib/projects.ts.
 * Without the image in the docs, or if a crop fails, the skill is shown without a specimen.
 */
async function cutSpecimen(slug, dir, pub) {
  const record = join(dir, 'specimen.json');
  rmSync(record, { force: true });
  const spec = specimens[slug];
  if (!spec) return;
  const img = readJson(join(dir, 'images.json'))?.[spec.image];
  if (!img) throw new Error(`the docs don't show ${spec.image}`);
  const { default: sharp } = await import('sharp');
  const file = basename(img.src);
  const out = { image: spec.image };
  const made = [];
  for (const [name, c] of Object.entries(spec.crops)) {
    const crop = `${file.replace(/\.[^.]+$/, '')}-${name}.webp`;
    const { size } = await sharp(join(pub, file))
      .extract({ left: c.x, top: c.y, width: c.w, height: c.h })
      .webp({ lossless: true, effort: 6 })
      .toFile(join(pub, crop));
    out[name] = { src: `/skills/${slug}/${crop}`, width: c.w, height: c.h };
    made.push(`${name} ${c.w}×${c.h}, ${(size / 1024).toFixed(1)} KiB`);
  }
  writeFileSync(record, JSON.stringify(out, null, 2));
  console.log(`skills: ${slug}: specimen cut from ${file} (${made.join('; ')})`);
}

/**
 * A lossless WebP twin of every PNG the docs show (the skill page serves it, and keeps the original
 * behind "Open full size"), recorded as `webp` in images.json. Re-made from the cached image too.
 */
async function webpTwins(slug, dir, pub) {
  const file = join(dir, 'images.json');
  const images = readJson(file);
  if (!images) return;
  const { default: sharp } = await import('sharp');
  for (const img of Object.values(images)) {
    delete img.webp;
    const name = basename(img.src);
    if (!/\.png$/i.test(name) || !existsSync(join(pub, name))) continue;
    const twin = name.replace(/\.png$/i, '.webp');
    const { size } = await sharp(join(pub, name)).webp({ lossless: true, effort: 6 }).toFile(join(pub, twin));
    if (size < statSync(join(pub, name)).size) img.webp = `/skills/${slug}/${twin}`;
    else rmSync(join(pub, twin), { force: true });
  }
  writeFileSync(file, JSON.stringify(images, null, 2));
}

let failed = false;
const mainDoc = `${languages[0]}.md`;
for (const { slug, repo, ref } of skills) {
  const dir = join(root, '.content/skills', slug);
  const pub = join(root, 'public/skills', slug);
  const cache = join(root, '.next/cache/skills', slug);
  let fetched = false;
  try {
    const [primary] = languages;
    const others = languages.filter((l) => l !== 'en');
    const [docs, skill, changelog, changelogs] = await Promise.all([
      Promise.all(languages.map((lang) => get(raw(repo, ref, docFile(slug, lang)), { optional: lang !== primary }))),
      get(raw(repo, ref, `skills/${slug}/SKILL.md`)),
      get(raw(repo, ref, 'CHANGELOG.md'), { optional: true }),
      Promise.all(others.map((lang) => get(raw(repo, ref, `CHANGELOG.${lang}.md`), { optional: true }))),
    ]);

    // Self-host images the docs point to in the same repo.
    const urls = new Set([...docs.filter(Boolean).join('\n').matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((m) => m[1]));
    const files = [];
    const images = {};
    for (const url of urls) {
      if (!url.startsWith(`${rawBase}/${repo}/`)) continue;
      const buf = await get(url, { binary: true });
      const file = basename(new URL(url).pathname);
      files.push([file, buf]);
      images[url] = { src: `/skills/${slug}/${file}`, ...imageSize(buf) };
    }

    rmSync(dir, { recursive: true, force: true });
    rmSync(pub, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    mkdirSync(pub, { recursive: true });
    languages.forEach((lang, i) => { if (docs[i]) writeFileSync(join(dir, `${lang}.md`), docs[i]); });
    writeFileSync(join(dir, 'SKILL.md'), skill);
    if (changelog) writeFileSync(join(dir, 'CHANGELOG.md'), changelog);
    others.forEach((lang, i) => { if (changelogs[i]) writeFileSync(join(dir, `CHANGELOG.${lang}.md`), changelogs[i]); });
    for (const [file, buf] of files) writeFileSync(join(pub, file), buf);
    writeFileSync(join(dir, 'images.json'), JSON.stringify(images, null, 2));
    writeFileSync(join(dir, 'source.json'), JSON.stringify({ repo, ref, fetchedAt: new Date().toISOString() }, null, 2));
    fetched = true;
    console.log(`skills: ${slug}@${ref} fetched (${languages.filter((_, i) => docs[i]).join('+')}, ${files.length} image(s))`);
  } catch (err) {
    if (!existsSync(join(dir, mainDoc)) && existsSync(join(cache, 'content', mainDoc))) {
      cpSync(join(cache, 'content'), dir, { recursive: true });
      if (existsSync(join(cache, 'public'))) cpSync(join(cache, 'public'), pub, { recursive: true });
    }
    if (existsSync(join(dir, mainDoc))) {
      const prev = readJson(join(dir, 'source.json'));
      const stale = prev?.ref && prev.ref !== ref ? ` (${prev.ref}, not ${ref} as content/projects/${slug}.json asks)` : '';
      console.warn(`skills: ${slug}: ${why(err)}; building from the previous fetch${stale}, made ${prev?.fetchedAt ?? 'at an unknown time'}`);
    } else {
      console.error(
        `skills: ${slug}: could not fetch ${repo}@${ref} (${why(err)}), and there is no previous fetch in .content/skills/${slug}.\n` +
        `  The skill pages are built from that repo, so the first build needs GitHub. Check the network, the repo and the ref, then run \`pnpm build\` again.`,
      );
      failed = true;
    }
  }
  if (!existsSync(join(dir, mainDoc))) continue;
  try {
    await webpTwins(slug, dir, pub);
  } catch (err) {
    console.warn(`skills: ${slug}: the skill page shows its images as PNG (${why(err)})`);
  }
  try {
    await cutSpecimen(slug, dir, pub);
  } catch (err) {
    rmSync(join(dir, 'specimen.json'), { force: true });
    console.warn(`skills: ${slug}: no specimen on the home, the projects page and Work (${why(err)})`);
  }
  if (fetched) {
    try {
      rmSync(cache, { recursive: true, force: true });
      cpSync(dir, join(cache, 'content'), { recursive: true });
      cpSync(pub, join(cache, 'public'), { recursive: true });
    } catch {} // the cache copy is a convenience; the fetch itself succeeded
  }
}
if (failed) process.exit(1);
