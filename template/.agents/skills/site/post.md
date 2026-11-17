# A blog post

A post is one Markdown file a language: `content/<lang>/blog/<name>.md`. Each language with a blog has `content/<lang>/blog/template.md`, a draft that shows every part a post can have and says how to use it: a new post starts as a copy of it, with every `[[…]]` replaced or removed and `draft: true` deleted. The frontmatter (`title`, `date`, `summary`) is described in `README.md`, "The content model".

What the template does not say:

- **The blog must be on**: `sections.blog` in `content/site.json`. If it is off, switching it on is a change of its own ([sections.md](sections.md)): ask the owner.
- **A post goes out in every language that has a blog**, unless the owner names one. A language has a blog when `content/<lang>/blog.json` exists. The files have the same name in each language: that is what links their pages to each other. Each is written as a text of its own language, not as a word-for-word translation. The facts, the numbers, the commands and the order of the sections are the same in each, and each links to the site's pages in its own language (`/work` in the main language, `/<code>/work` in the second).
- **The voice is the owner's.** First person, in plain words, speaking to the reader the way the site's other pages do. When the folder already has a post, read one before you write.
- **The facts are theirs.** Write from what they told you and from what the repo shows. Where the post needs a fact they have not given (a number, a date, a client, how long something took), write `[[what is missing]]` in its place, in each language, and name it at the hand-over.
- **The file name is the address**, `/blog/<name>` in the main language and `/<code>/blog/<name>` in the second: lowercase Latin letters, digits and hyphens, the title's key words. It stays the same once the post is live.
- **`date`** is the day the post goes out: today, unless the owner names another.
- **No `draft: true`** in a post you show: Vercel builds no drafts, so a draft is missing from the preview. The branch is what keeps the post away from `main` until the owner approves it.
- **The page ends with the site's own call to action**, under every post. The post's last section tells the reader where to read more, with a link at most, and asks for nothing.
- **An image** goes in `public/blog/` and is written `![what it shows](/blog/file.png)`.
- **Quotes**: in English the page turns straight quotes into curly ones; Georgian is written with „…“ as it should appear. Latin script inside Georgian text stays for code, commands and product names.

Done when everything but the placeholders you will name reads as finished text in each language, `pnpm check` and `pnpm test` pass, and the build lists the post on each language's blog page.
