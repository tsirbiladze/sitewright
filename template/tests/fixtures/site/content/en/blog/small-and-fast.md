---
title: Five checks before a small site goes live
date: 2026-11-10
summary: What I look at on every site before it gets its address, in the order I look at it.
---

A small site has few pages, so each one matters. Before a site goes live I go through the same five
checks, in this order, on a phone first.

## 1. Does the first screen say what the business does?

Open the home on a phone and read only what fits. If a stranger can't say what the business does and
where it is, the page isn't ready, however good the rest looks.

## 2. Does every page load in a moment?

I keep scripts out of pages that don't need them and send images at the size they are shown. A menu
or an address should never wait for a slideshow.

## 3. Can you reach everything with the keyboard?

Press Tab from the top of the page to the bottom. Every link and button should show where you are,
and nothing should be skipped.

## 4. Does the price say what it costs?

If the site shows a price, it shows the whole price: the number, the currency and what it includes.

## 5. Does the contact work?

I send myself a message through every way the site offers, and check that it arrives.

```bash
# The check I run on the built site: every page, three widths, overflow and contrast.
pnpm qa --strict
```

> A small site that answers these five is better than a big one that doesn't.
