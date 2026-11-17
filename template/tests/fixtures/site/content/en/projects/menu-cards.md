---
title: Menu cards
summary: Turns a café’s menu, kept in a spreadsheet, into a printed card and a menu page.
category: Tools
status: stable
imageAlt: A fictional café’s menu: dishes and drinks with their prices, in two columns.
imageCaption: The menu of a fictional café, made from its spreadsheet.
---

## What it does

A café keeps its menu in a spreadsheet: one row per dish, a column for the price. Menu cards reads that
sheet and makes two things from it: a card to print, sized for the table, and a page for the café’s
website. When a price changes, the café changes one cell and runs it again.

It never invents a dish or a price. A row without a price is left out and named in the report, so the
card on the table and the page online always say the same thing.

## What it needs

| File | What is in it |
|---|---|
| `menu.csv` | One row per dish: its name, its price, and an optional group such as “Drinks” |
| `menu.json` | Which columns to read and which currency to print |

The spreadsheet can come from any program that saves CSV. Georgian and English names both work, and a
dish can have both.

## Printing the card

The card is an A5 page with two columns. Groups start a new column when they would not fit, so a group
is never split across the fold. The fonts are embedded, so the card prints the same in any print shop.

To print it, open `menu.pdf` and print at actual size. Most cafés laminate it; the layout leaves a
margin wide enough for that.

## The menu page

The page is plain HTML with no scripts. It reads well on a phone, and search engines see the dishes and
prices as text. Put it anywhere on the café’s site, or link to it from a QR code on the table.

## Limits

- One currency per menu.
- No photos of the dishes: a menu with photos needs a designer more than a tool.
- Prices are printed as written in the sheet, so write them the way you want them read.
