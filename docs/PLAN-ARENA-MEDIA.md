# Arena beyond images — video and music rounds

Status: **designed, not built.** Written down because the question keeps coming
up and the answer is not "add a file type".

## The chain is already fine

`enter(media_uri: String)` is medium-agnostic — 200 characters of URL, nothing
about pixels. A song or a clip needs **no program change and no redeploy**. The
restriction is one line in the app:

```ts
// src/components/Arena.tsx
.filter((r) => Boolean(r.url) && (r.contentType ?? '').startsWith('image/'))
```

plus five `<Image>` render sites in the gallery.

## The real obstacle is voting, not rendering

A grid of four images is judged in about two seconds — you scan it. Four
thirty-second songs is **two minutes of sequential listening before anyone can
cast a single vote**.

Votes are already the scarce resource: every round so far has drawn exactly
one. A medium that costs a voter two minutes makes that worse, and a contest
nobody votes in does not pay out — `claim_place` requires a place, and a place
requires votes.

So the question is not "can we store an mp3 URL". It is "what can a voter judge
fast enough that they still vote".

## The design that survives that: one medium per round

`themes.json` is a flat list of strings today, and the round opener writes the
chosen theme into the Round account. Give each theme a `kind` and the client
enforces it — still no program change, because the client already decides what
today's theme is before the account exists:

```json
{ "text": "your machine, transformed into a robot",   "kind": "image" }
{ "text": "a ten-second loop of this room breathing", "kind": "video" }
{ "text": "the sound of your street, as a song",      "kind": "music" }
```

Why per-round rather than per-entry:

- a voter knows what they are in for before opening the tab
- the gallery renders ONE component per round instead of a mixed feed where a
  silent thumbnail and a song compete on unequal terms
- the quest can lead with the right capture affordance — camera for image,
  recorder for video, the composer for music

## Video first, music as its own screen

**Video** keeps the scanning speed if it behaves like a feed: muted autoplay on
scroll, tap for sound, no play button to find. The gallery is already a visual
grid, so this is a component swap plus a visibility hook.

**Music cannot be scanned at all**, so it needs a different screen: a waveform
list where each entry previews ~8 seconds from its loudest point. You judge a
hook, not a track. That is a different interaction from the image gallery, not
a variant of it, which is why it should not ship in the same change.

## Order of work

1. `kind` in `themes.json`, client enforces it, image stays the only value —
   ships nothing visible, makes everything after it small
2. video rounds: autoplay-on-scroll gallery cell, recorder entry path
3. music rounds: waveform screen, preview window selection
4. revisit the vote window — a medium that takes longer to judge may want a
   longer round, which is a `ends_at` question, not a media one

## What would change the plan

If voting stays at roughly one vote per round, none of this matters: the fix is
getting people to vote at all, and a new medium is a distraction. Measure that
first.
