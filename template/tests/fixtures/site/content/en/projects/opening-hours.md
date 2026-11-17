---
title: Opening hours
summary: A small widget that tells a shop’s visitors whether it is open right now.
category: Widgets
status: beta
---

## What it does

The widget shows one line on a shop’s site: “Open now, until 19:00”, or “Closed, opens tomorrow at
10:00”. It works out the line in the visitor’s browser from the shop’s hours and its time zone, so a
visitor in another country still reads the shop’s own time.

## Setting the hours

The hours are a short list, one line per day, written the way a shop would write them on its door.
A day can have a break, and a day can be closed. The widget reads the list once and keeps no data
about the visitor.

## Holidays

A holiday is one more line with its date. On that day the widget says the shop is closed, and the
line before it says so a day ahead, so nobody walks to a closed door.

## Limits

The widget knows what the shop tells it. When the hours change, the list has to change too: the
widget cannot guess.
