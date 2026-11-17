# CRATE for YouTube

Lets CRATE find YouTube videos and album playlists for your songs **without using the YouTube API quota**, by reading YouTube's own search, playlist and video pages in a background tab.

## What it does

When CRATE's song matcher asks, the add-on asks YouTube for the page (a video search, a playlist search, one playlist, or one video's page for its chapters and description) directly and reads it, **a few pages at once** (3 unless you change it in Options → Speed → "Pages at once", 1 to 4). If a page can't be read that way, it is opened in a background tab instead, one at a time with 9 to 15 seconds between them. Every answer is remembered (3 days for a search, 7 for a playlist or a video), so the same question never costs a second page.

## Limits, on purpose

- At most 4 pages at once (version 1.3.0; before it, one at a time). Only the add-on's own Options page sets the number: CRATE cannot ask for more. The starts are spread out (1.5 to 3 seconds divided by the number at once, never under 0.3).
- Pages opened in a tab: one at a time, with 9 to 15 seconds between them, and nothing else running meanwhile.
- No daily limit on pages (there was one of 250 until version 1.2.0), and a queue of at most 60 questions. It still stops the moment YouTube asks anything. **More pages at once makes that likelier**: if YouTube starts asking for checks, lower "Pages at once".
- Only YouTube search, playlist and video (watch) addresses are ever opened; every address and every question is checked again in the background.
- It **stops** at the first page that shows a cookie question or an "unusual traffic" page, or that it cannot understand, and leaves that page in front of you. Pass it, then press Continue (in CRATE, or in this add-on's options); or Cancel.
- No account, no password, nothing is sent anywhere except to your own CRATE page.

## What to know

This reads pages that YouTube's terms say only its API may be used for. It is slow and small on purpose, but your browser's cookies come with every page it opens, YouTube may show a check, and YouTube changes its pages without warning, which can stop this working until it is updated. If a page stops being understood, open it and use the toolbar button, **Diagnose this page**, and send what it shows.

## Install

1. In Chrome or Edge open `chrome://extensions`, turn on Developer mode, and **Load unpacked** this folder.
2. Open the add-on's options, type your CRATE's address, press **Connect**, and allow the permission.
3. In CRATE, the song matcher uses it automatically when it is connected (and there is no need for an API key).

## Faster, and in the background (version 1.1.0)

The add-on no longer opens a tab for each question. YouTube's search and playlist pages carry the data in the HTML they send back, so the background script asks for the page directly (with your browser's cookies, as a tab would) and reads it: about a second per question instead of fifteen, with nothing appearing on your screen. The pause between pages is 1.5 to 3 seconds (never under 1). Still one question at a time, still at most 250 pages a day, still remembering every answer, and still STOPPING at the first cookie question or "unusual traffic" page, which it opens in front of you for you to pass (then Continue). If a page can't be read directly it falls back to a background tab, with the old 9 to 15 second pause. A switch in the options ("Open a background tab for every page") turns the direct way off.

## Nothing was being found (version 1.1.1)

Version 1.1.0 read pages directly, and when the page data was there but nothing could be read from it, it answered "nothing found" and remembered that answer for days, so a reading problem looked like an album with no videos. Now: an empty direct reading is never trusted (a real page decides, and it also reads what is on screen); an empty answer is never remembered, and any empty answer remembered by 1.1.0 is ignored; and if direct reading twice finds nothing where a real page finds something, it switches itself off for a day and uses real pages. If it still finds nothing, use "Diagnose this page" on the YouTube page it opened and send what it shows.

Version 1.2.0 removed the limit of 250 pages a day. Nothing else about how it reads pages changed: one page at a time, 1.5 to 3 seconds apart when read directly, remembered answers, and a full stop at a cookie question, an "unusual traffic" page or anything it cannot understand. A very long run asks YouTube for a lot of pages: if YouTube starts asking questions, the add-on stops and tells you, and it is better to wait a while than to keep pressing Continue.

## 1.4.0

CRATE can ask for one video's page (`{kind: 'video', id}`). The add-on reads the video's title, channel, length, description and chapters from the page's own data, so CRATE can time each song of a full-album video from the video's chapters or the timestamps in its description instead of guessing from song lengths. Watch pages are opened only for CRATE's questions; on a video you open yourself the add-on does nothing.

## 1.5.0

**The visualizer hears CRATE's tab through the add-on.** CRATE's visualizer used to ask the browser to share the tab (a prompt, then the "Sharing this tab" bar for as long as it listened). With 1.5.0, CRATE asks the add-on instead, and the add-on captures the CRATE tab's own sound (`chrome.tabCapture`): no prompt and no bar. This is why the add-on now asks for the **tabCapture** permission.

- Only your connected CRATE page can ask, only for its own tab, and the stream can be used by that tab alone. Nothing is recorded or sent anywhere.
- Chrome mutes a tab while it is captured. (In 1.5.0 CRATE played the sound back from inside the tab, which stayed muted; fixed in 1.5.1.)
- Chrome may want you to click the add-on first. Then click **CRATE for YouTube** in the toolbar while on your CRATE page and press **Let CRATE hear this tab**. CRATE also keeps a **Share instead** button for the old prompt.
- It stops when you press Stop listening in CRATE or close the tab.

**Fix: chapters reach CRATE.** 1.4.0 read a video's description and chapters, but the part of the add-on that passes answers to the CRATE page dropped those two fields, so CRATE never got them. 1.5.0 passes them on.

## 1.5.1

**Fix: the music went silent while the visualizer listened.** Chrome mutes a tab while it is captured, and anything played from inside that tab is muted with it. Now the add-on captures the tab in a hidden page of its own (an "offscreen document", hence the new **offscreen** permission) and plays the sound out from there, so you keep hearing it. CRATE's visualizer asks that page for each frame it draws (the spectrum and a short stretch of the wave) and gets nothing else. Stop listening in CRATE ends the capture and closes the hidden page. Needs CRATE 1.95.22. Chrome lets an add-on capture a tab only after you have clicked it on that tab: click **CRATE for YouTube** in the toolbar and press **Let CRATE hear this tab**, or press **Alt+Shift+V** on the CRATE tab (change it at chrome://extensions/shortcuts).

## 1.5.3

YouTube's newer page layout is read: search results (and playlist pages) written as "lockups" (`lockupViewModel`) rather than `videoRenderer`, which gave CRATE's test search 0 videos ("YouTube may have changed its page"). The older layout is still read. Diagnose also shows one result as YouTube wrote it (`lockupSample`), so a later change can be read off and fixed.

## 1.5.2

The hidden page also measures the left and right channels separately and sends each one's peak with every frame, for the stereo level meter under the cover in CRATE's Track Info (CRATE 1.95.24). With 1.5.1, both rows of that meter show the mixed level.
