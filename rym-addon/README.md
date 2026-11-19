# CRATE for RateYourMusic

A small browser add-on that looks at an artist's discography, or a **genre's** discography, on **rateyourmusic.com** and flags every release that is **already in your CRATE** — so you can see at a glance what you still need to add.

- **✓ In your crate** (green): you have it.
- **≈ Another edition in your crate** (amber): you have the same album with a different year (a reissue, say).
- A small **"CRATE · 3 of 7 in your crate"** summary in the corner, which can **dim** or **hide** the releases you already have. On a genre page it counts the rows **on that page** (a genre can have thousands of releases across many pages), and it re-flags when you go to the next page.

Everything happens inside your browser. The add-on makes **no network requests** and sends your data nowhere. It only *adds* markers to RYM's page; it never changes RYM's own text or links.

## New in 1.23.0

"Update from Rate Your Music" now works for releases that have no RYM link yet. The add-on reads Rate Your Music's search for the release's artist and title (in the same hidden page, with the same pause between pages), takes the result that matches (same artist and title; the same type and year win a tie), and reads that release's page. The update brings the RYM link with it. A release the search doesn't turn up is skipped and named in CRATE. Needs CRATE 1.135.160 or newer.

## New in 1.22.0

- **Credits**: a release page's credits go to CRATE with its other details. Roles on given tracks land on those songs in CRATE; the rest on the release.
- **Song pages**: open a song on RateYourMusic (`/song/...`) and its rating, rating count, genres, descriptors and credits go to CRATE (1.135.33 or newer), which puts them on that song. The lyrics are never read. Options → *captureSongs* can turn it off.

## Install (Chrome, Edge, Brave, Opera, Vivaldi…)

1. Unzip `crate-rym-addon.zip` somewhere you'll keep it (the browser reads the folder in place).
2. Open `chrome://extensions` (or `edge://extensions`), switch on **Developer mode**, click **Load unpacked** and choose the folder.
3. Pin it from the puzzle-piece menu if you like. Firefox is not supported yet.

## First: your CRATE must be version 1.29.203 or newer

The add-on can only learn what you have from CRATE, and older CRATEs can't tell it (1.29.201 and 1.29.202 share your list but not each release's *type*, so the add-on can't tell an album from its single). If you host CRATE yourself (for example on GitHub Pages), upload the newest `index.html` to the same place, then reload CRATE with **Ctrl+F5** (Cmd+Shift+R on a Mac) so your browser doesn't keep showing the old copy. CRATE's version is shown in its footer.

## Connect it to your CRATE

Open the add-on's **Options** (click its icon → Options) and use either way:

**A. Connect (stays up to date).** Paste your CRATE's address (the page you open CRATE at, e.g. `https://yourname.github.io/crate/`) and press **Connect**. Your browser asks permission for *that one address only*. After that, whenever CRATE is open in a tab it hands the add-on a compact list of your releases, and the add-on keeps it current as you add releases.
In CRATE, **⚙ → "Share my crate with the RYM add-on"** must be on (it is by default; it needs CRATE 1.29.201 or later).

**B. Import a file (a snapshot).** In CRATE choose **⚙ → Export crate…**, keep the *Other* links ticked (that's where the RYM address lives) and download the file. The file includes each release's type. Choose it in the add-on's Options. Import again after adding releases.

Then open any artist, or any genre, on RateYourMusic.

## What it shares, and with whom

CRATE offers the add-on: **artist, title, release type, release date, descriptor, catalogue number and RYM link** for each release. **Not** ratings, reviews, Spotify/YouTube links, or listening history. The message goes only to CRATE's own page, addressed to its own origin, and only an add-on you connected to that address receives it. You can switch sharing off in CRATE at any time (⚙ → *Share my crate with the RYM add-on*) or press **Forget my crate data** in the add-on's Options.

## How it decides "already added"

1. **RYM address.** Every RYM discography item links to a release page like `/release/album/yes/close-to-the-edge/`. If a release in your CRATE has that same address saved as its RYM link, it's a certain match.
2. **Artist, title and release type** (when CRATE has no saved RYM link): ignoring case, accents, a leading "The", `&` vs "and" and punctuation, and a bracketed edition note. If the year differs, it's flagged amber instead of green.
   **The release type must agree.** The same artist and title can be an album, a single, an EP, a compilation and a music video (Cocteau Twins' "Heaven or Las Vegas" is all of them on RYM). RYM's type comes from the release address (`/release/album/…`, `/release/single/…`, `/release/musicvideo/…`), or from the "1990 | Single" line when a row has no address. CRATE's type is Album, EP, Single, Compilation, Live or Mixtape (Live counts as an album, as on RYM). If you have the album, the single and the video are **not** flagged. If a type is unknown on either side the add-on gives it the benefit of the doubt. You can turn this off in Options (*Treat different release types as different releases*).
3. On a **genre page** every row has its own artist (the bold line), so each row is matched against its own artist. If a row has no artist link, the artist is taken from its RYM address, and a collaboration with several artists matches if any one of them is in your crate.
4. A release on an **artist's** page that is **by another artist** (a compilation they "appear on") is *not* matched by title, so it isn't mistaken for one of yours; only a saved RYM address can match it.

## If it doesn't flag anything

RYM can change its page. This add-on was written against the class `component_discography_item` (and RYM's older `disco_release`), but I could not test it on the live site.

1. Open an artist page, click the add-on's icon and press **Diagnose this page**. It reports how many discography items it found and how many matched.
2. If it finds **0 items**, copy the report and look at the page with your browser's *Inspect*: find the element that wraps one release in the discography and its class. In **Options → Advanced** enter that as the item selector (and the selector of the release link inside it, if needed). No reinstall needed.
3. If it finds items but matches none, check that Options shows your releases and that some have a RYM link (the status line says how many).

## Troubleshooting: use the Connection check

In the add-on's **Options** there is a **Connection check**. It tests each step between CRATE and the add-on and tells you what to do about the first one that fails. With your CRATE open in a tab, press **Check and sync now**.

| It says | What it means / what to do |
|---|---|
| ✗ Not connected yet | Enter your CRATE's address in Options and press Connect (or import a file). |
| ✗ The browser has not allowed this add-on on … | Press Reconnect and allow it. |
| ✗ The receiving script is not set up | Press Reconnect. |
| ✗ No tab is open at … | Open your CRATE in a tab. Its address must begin with **exactly** the address the check shows: same `https://`, same `www` (or none), same domain. If you open CRATE at a different address, connect that one instead. |
| ✗ The add-on's script has not run on your CRATE page | Reload your CRATE tab, then press Check and sync now. |
| ✗ Your CRATE page did not answer, and it has no add-on support | Your CRATE is older than 1.29.201 (or that page isn't CRATE). Upload the newest `index.html`, hard-reload it (Ctrl+F5), then check again. |
| ✗ …supports the add-on but did not answer | Reload CRATE and check ⚙ → *Share my crate with the RYM add-on* is on. |
| ✗ Your CRATE did not say what type each release is | Your CRATE is older than 1.29.203. Update it, reload it, then press Check and sync now. Until then an album and its single with the same title look identical. |
| ✗ …answered, but sharing is switched off | In CRATE: ⚙ → *Share my crate with the RYM add-on*. |

On a RateYourMusic page the small summary tells you the state too: **"not connected — set up"** (nothing connected, no data), **"connected — waiting for your CRATE"** (connected, but no list has arrived yet: use the Connection check), **"sharing is off in CRATE"**.

After installing, reload any RYM tab that was already open.

## Files

**Updating the add-on:** replace the files in the same folder, open `chrome://extensions` and press the add-on's reload button, then reload any RYM tab.

`manifest.json` · `core.js` (matching rules, shared with CRATE's duplicate protection) · `content-rym.js` (runs on RYM artist pages) · `content-crate.js` (receives your list on your CRATE page, after you connect) · `options.html/js` · `popup.html/js` · `ui.css` · `icons/`

Permissions: `storage` and `scripting` only. The RYM script is declared for `rateyourmusic.com/artist/*` and `rateyourmusic.com/genre/*`; the CRATE address is a permission you grant yourself when you press Connect.

## RYM ratings (version 1.3.0)

While you browse RateYourMusic, the add-on also keeps the **average rating and the number of ratings** it sees, so CRATE can show them next to your own ratings (CRATE 1.31.0 or newer: ⚙ → RYM ratings…).

- It reads them on **artist pages, genre pages and release pages**. On a discography row it takes the first figure written like `3.65` and the whole number right after it (the ratings count).
- Only the average, the ratings count, the release's name, type and year are kept, in this browser, until your CRATE asks for them. Nothing is sent anywhere else, and nothing on the RYM page is changed.
- **Options → RYM ratings** switches collecting off, shows how many ratings have been collected, and forgets them. If RYM's markup ever changes, *Advanced* has a selector for the rating inside an item.
- In CRATE a rating you typed yourself is never overwritten; a rating that came from the add-on is refreshed when RYM's average moves.
- The add-on now also runs on `rateyourmusic.com/release/*` (a very small script that only reads the rating). It still does nothing on any other part of the site.

## Genre descriptions (version 1.4.0)

When you open a genre's page on RateYourMusic (for example `rateyourmusic.com/genre/progressive-rock/`), the add-on saves the **description text** shown there, so CRATE can fill in that genre's description (CRATE 1.32.0 or newer: ⚙ → RYM ratings & genres…).

- Only the genre's name, the description text and the page address are kept, in this browser, until your CRATE asks for them. Nothing is sent anywhere else, and nothing on the RYM page is changed.
- A genre's sub-pages (such as its artist list) are not read.
- **Options → Genre descriptions** switches this off, shows what has been collected, and forgets it. If RYM's markup changes, *Advanced* has a selector for the description box; the panel on the genre page says when the description couldn't be found.
- In CRATE, a genre that already has a description of yours is never changed: RYM's version is kept beside it for you to read or choose.
- The add-on now also runs on `rateyourmusic.com/genre/*` with one more small script (it only reads the description).

## A trail of how each rating changes (version 1.5.0)

For every release whose rating it reads, the add-on now keeps a short **trail of readings**: when it saw the average and the number of ratings, and what they were. A reading is added when the average changes or the number of ratings has moved by 5% or more, at most one a day, up to 40 per release. CRATE joins this trail to its own record of the release (CRATE 1.33.0 or newer shows it on the album page).

- It only records what it sees while you browse RateYourMusic: there is no background checking.
- Same as before, nothing leaves the browser except to your own CRATE page, when it asks.
- Trails of earlier versions' ratings start from the reading the older version had saved.

## Tracklists (version 1.6.0)

On a RateYourMusic **release page** the add-on also saves the **tracklist**: the titles in order, each track's length, any Disc / Side headings, and a track's own rating where the page shows one. CRATE's tracklist editor has an **RYM** button (under Fill from) that asks the add-on for it (CRATE 1.36.0 or newer).

- It looks for list items or table rows that carry a length and takes the biggest group, ignoring "related releases" style areas. If a page has no rows at all it reads the tracklist area as text, the way a pasted list is read. If it can't find a tracklist it saves nothing.
- Only the release's address, names, type and the tracklist are kept, in this browser, until your CRATE asks for them.
- **Options → Tracklists** switches this off, shows what has been collected, and forgets it. If RYM's markup ever changes, *Advanced* has a selector for one track row.
- In CRATE nothing changes until you press "Use this list". A track rating from RYM is only added to a track that has none of its own.

## Send to CRATE (version 1.7.0)

Pull releases from RateYourMusic into your crate (CRATE 1.37.0 or newer).

- On a **release page** a small **Send to CRATE** button appears (bottom right). It sends that release: artist, title, type, release date, primary and secondary genres, and its tracklist.
- On **genre, artist and chart pages** the page panel (the CRATE pill) has **Send N releases to CRATE**: every release listed on the page. A chart or genre page shows one page of results at a time; send each page you want.
- **Nothing is sent just by visiting a page**, only when you press the button. What you send waits in this browser; CRATE collects it when it opens (and when you return to its tab) and shows a bar to **Review** it. The review is CRATE's usual import review: what is new, what you already have, tick what to add. Nothing is added until you press Add there.
- Videos aren't kept. A release already in your crate is marked as such in the review.
- **Options → Send to CRATE** switches the buttons off, shows what is waiting, and discards it. *Advanced* has a selector for the artist name(s) on a release page, in case RYM's layout changes.

## If a release page's tracklist isn't picked up (version 1.7.1)

Open the add-on's popup on the release page and press **Diagnose**. It says how many tracks it read and whether they were kept, and shows a report (including the page's tracklist markup) you can copy. A tracklist is now read whether or not the page shows track lengths, with nested credit lists, vinyl numbering (A1, B2) and lengths held in a `data-inseconds` attribute. After updating, reload the RYM page once; the add-on also looks again a few seconds after a page loads.

## Covers (version 1.7.2)

"Send to CRATE" now also sends the cover picture RateYourMusic shows for each release (release page: the cover, else the page's share image; list pages: the picture in each row's release link, in the biggest size it offers). CRATE checks that each cover really loads before it saves it, and leaves the rest to its own lookup. *Advanced* in the options has a selector for the cover picture on a release page.

## Knowing what you already have, and updating it (version 1.8.0)

On a RateYourMusic **release page** the button now reflects your crate (it needs your CRATE connected and sharing, as for the badges on artist pages):

- **✓ In your CRATE · Update CRATE from this page**: you have this release. Pressing it sends the page's details; CRATE opens an *update review* where you tick which fields to fill in or refine (date, genres, RYM link, tracklist with lengths). Where the page and your crate disagree it is shown but not ticked.
- **≈ Another edition in your CRATE · Send to CRATE**: you have the same title with a different year; sending adds this one as a new release.
- **Send to CRATE**: you don't have it.

The button follows your crate live: delete a release in CRATE and the button on an open RYM page goes back to *Send to CRATE* without a reload. What you send is now also *pushed* to CRATE straight away, so its review bar appears without waiting to be asked.

## Tracklists on real RYM pages (version 1.7.3)

The tracklist is now found from the page's **"Track listing" heading** and read row by row: a track's title without its *lyrics* button, its length, and its rating; the **track credits** (names and roles, hidden or shown) are skipped; **sub-items** such as "- Piece One 3:58" are folded into the track above (their lengths add up); an **Enhanced Content** video and the **Total length** line are left out. If the page can't be split into rows the add-on now saves nothing rather than reading everything as text. After updating, visit the release page once, then in CRATE use Edit -> RYM -> Use this list to replace a list that was read wrongly before.

## Knowing what is in your crate (version 1.8.x)

The add-on keeps the list CRATE shares with it (artist, title, type, year, RYM link) and uses it to say whether you have a release: on a release page the button reads *In your CRATE · Update CRATE from this page*, *Another edition in your CRATE · Send to CRATE*, or just *Send to CRATE*; on genre, artist and chart pages the panel counts what you own. CRATE refreshes that list whenever its library loads or changes, so adding, editing or **deleting** a release (including the **last** one: an empty crate is understood, and the page says "your crate is empty") is picked up by the open RYM tabs straight away. If CRATE isn't open when something changes, the add-on hears about it the next time CRATE opens.

## Ratings are never titles (version 1.8.2)

A track's own rating (and the vote count beside it) is never read as its title: a row whose title can't be found gives no track rather than a wrong one. If the first reading of a release page finds fewer than two tracks, or titles that are really numbers, the add-on reads it again ignoring class names that mention "credit", and saves nothing if that is no better. A wrong copy kept by an older version is removed or replaced the next time you open that release's page. The popup's **Diagnose** says when the second reading was needed.

## Names from a release page (version 1.8.3)

The artist, title, type and primary genres are read from the page's title ("Title by Artist (Album, Genre): Reviews, Ratings, Credits, Song list"); the older shorter wording still works. A name that picked up that page wording is cleaned wherever the add-on handles it. In CRATE, ⚙ → **Tidy artist names…** repairs releases whose saved artist carries it.

## Details, covers and tracks (version 1.9.0)

A release page now also gives the **label**, the **catalogue number** and the **descriptors** (found by their headings in the page's info table), and the **larger** of the cover picture and the page's share image. Tracklist rows are read by what each piece is, so a page that puts the rating and vote count before the number and title reads the same as one that puts them after. If a page still reads wrong, the popup's **Diagnose** shows the tracklist's and the info table's own markup and what was read back.

## Split releases and the info table (version 1.9.1)

A track row's title is read as one piece (so a split release's "Swirlies - Didn't Understand" stays whole), and a numbered row counts as a track even when its rating comes first and there are no lengths. The label, catalogue number and descriptors are read only from the release's own info table, never from your own cataloguing box. Several artists in a list row are joined the way the page joins them ("A / B", "A, B", "A & B").

## Covers and the issue line (version 1.9.2)

The cover is found first by the picture's own text ("Cover art for <title> by <artist>"), then by class names, then by the page's share image. The label and catalogue number are read from the page's issue line ("Homestead / HMS 166-2") when the info table has none. Diagnose lists the cover candidates and the issue line's markup.

## Rank (version 1.9.3)

A release page's "Ranked #40 for 1991, #1,475 overall" is read as the overall rank (1,475) and kept beside the rating, so CRATE can bold the top-ranked releases the way Rate Your Music does. A list page, which gives no overall rank, never wipes one already kept.

## Update from Rate Your Music (version 1.10.0)

When you press "update" on a release in CRATE (or choose "Update from Rate Your Music" on one or several selected releases), a background script opens each release's Rate Your Music page **one at a time** in a background tab, lets it settle, reads it as "Update CRATE from this page" would, closes it, waits 8 to 15 seconds (never under 6), and opens the next. At most 25 pages a run, and no limit on how many runs you start in a day; only `rateyourmusic.com/release/...` addresses; it stops at the first page that asks for a check, or can't be read, and leaves that page open in front of you. A page that no longer exists is skipped. Closing the page yourself ends the run. Cancel is in CRATE's status bar. The details arrive as waiting updates; nothing in CRATE changes until you apply them.

This needs no new permission. It is automated visiting of a site whose terms discourage it, and which may ask for a check: keep runs small, and stop if it does.

## Sides on their own (version 1.10.1)

A track on a side numbered just "A" (or "AA" for a double A-side) gets its real title instead of "A", and a title made of digits ("1490") is read next to a vinyl number. A track that really is called "A" keeps that title.

## Continue after a check, and per-release progress (version 1.11.0)

While an "Update from Rate Your Music" run goes on, CRATE is told how each page went (read, skipped, or the one being read), which is what its queue shows. If a run stops (a check from Rate Your Music, a slow page), CRATE can ask it to **continue**: the page that failed is tried again, then the releases it hadn't reached; the ones already read are not read again. The page left open for you is closed when it continues.

## How many ratings each track has (version 1.12.0)

A track's average rating on a release page comes with the number of ratings it is based on ("3.4 | 20"). The add-on now reads that number too, in each of the ways the page writes it, and sends it with the rating. It is only ever kept alongside a rating.

## No daily limit (version 1.12.1)

The limit of 120 pages in 24 hours is gone, along with the day-by-day count it needed. What still keeps a run gentle: one page at a time, 8 to 15 seconds between pages (never under 6), at most 25 pages in a run, and the run STOPS at the first page that asks for a check or can't be read. Because there is no daily cap any more, Rate Your Music is more likely to ask for a check if you run it all day; when it does, pass the check and press Continue, or stop for a while.

## Counts written as "6k" (version 1.12.2)

On a release with many ratings, a track's count is abbreviated ("6k", "5k", "1.2k"). Version 1.12.0 and 1.12.1 took that for the track's title. The add-on now reads it as the count (about 6000: the page rounds it), and a piece like that straight after a rating is never a title.

Version 1.12.3: the full list of genres. A release page lists primary and secondary genres, and either can be long; the add-on used to keep only the first four of each (and the page it sends them to cut the text at 200 characters). Both lists are now kept whole, up to 30 each. "Diagnose this page" now also shows the secondary genres it read.

## A release's ratings count, and scenes (version 1.12.5)

The number of ratings of a RELEASE (not a track) could flip between the real figure and something wrong as you browsed: a page that writes it shortened ("6k", "1.2m") was read as 0, or as 6, and that replaced the exact count a release page had given. Now a shortened count is read (about 6000, with how rough it is), a page that shows no count leaves the known one alone, and a shortened count that fits the exact one already known doesn't replace it. CRATE 1.63.0 applies the same rules to what it receives, so even an older add-on can no longer blank a count.

Scenes are not genres: a link in a row headed Scenes or Movements (or to a /scene/ page) is not read as a genre, and a name ending in "Scene" (Laurel Canyon Scene) is dropped from a genre list. (This is the change CRATE 1.58.2 described as add-on 1.12.4; that version was never saved where CRATE keeps its add-ons, so it is made again here.)

## Exact figures behind the hover (version 1.12.6)

A track list shows a rounded rating and a shortened count ("4.6 | 5k"), but hovering it says "4.56 from 4,733 ratings". The add-on now reads that exact text wherever the page keeps it (an attribute of the row or of something in it, such as a title, an aria-label or a tooltip's data, or text that only shows on hover) and saves 4.56 and 4,733 instead of 4.6 and about 5,000. The same goes for the ratings on artist and list pages, and for a release's own rating. Where a page has no such text, the rounded figures are read as before.

## The exact figures, kept before the page hides them (version 1.12.7)

RYM writes a rating's exact figures in its hover text ("4.56 from 4,733 ratings") while showing rounded ones ("4.6 | 5k"). The hover text starts as each element's `title`, but as soon as the page has loaded its tooltip plugin (tipTip) takes the titles away and keeps them in its own script, so version 1.12.6 usually found nothing to read. A new small script, `content-tips.js`, now runs as each RYM page starts loading, before the page's own scripts, and copies every "… from N ratings" title onto its element as `data-crate-tip`. The tracklist, the release's rating and the artist and chart rows are then read from that copy. It adds that one attribute and changes nothing else; it stops watching the page 15 seconds after it has loaded.

## Exact figures, asked from the tooltip itself (version 1.12.8)

On a real release page the tracks still came through rounded ("6k"): the copy kept by `content-tips.js` wasn't on the rows, so the title had gone before it was seen (or the add-on was loaded after the page). Now, when a row has no exact figure anywhere, the add-on asks RYM's tooltip for it: it sends that row's rating a pretend mouse-over, which makes the tooltip write "4.37 from 6,379 ratings" into its box, reads it, and sends a mouse-out straight away, before the tooltip's own delay, so nothing appears on screen (`CrateRym.exactFromTip` in `core.js`). The figure is then kept on the row as `data-crate-tip`. This works whenever the page was loaded, with no need to reload it after reloading the add-on.

## Diagnose shows the exact-figure check (version 1.12.9)

Diagnose (in the add-on's popup, on a release page) now also reports `addonVersion`, `tipsKeeperRan` (whether `content-tips.js` ran on this page) and `exactProbe` for the first track row: its `.has_tip` element, any title or kept `data-crate-tip` on it, the exact figure read, and what RYM's tooltip box held after the pretend hover. The pretend hover also sends `mouseenter`/`mouseleave` now, for a tooltip that listens for those.

## Scenes and movements (version 1.13.0)

A release's scenes and movements now go to CRATE with the rest of its details, for CRATE's Scene and Movement fields (CRATE 1.72.0 or later; an older CRATE ignores them). They are read from a row of the release's info table headed Scene(s) or Movement(s), from links to a `/scene/` or `/movement/` page in the release's own info, and from a genre-list name ending in "Scene" (which is still kept out of the genres). "Canterbury" and "Canterbury Scene" count as one; at most six of each. In an update, CRATE fills a blank Scene or Movement and shows a different one you already have without ticking it.

## Track links, and where and when it was recorded (version 1.14.0)

- **Each track's own page.** Every track in a release's tracklist now carries the address of its song page on Rate Your Music (`https://rateyourmusic.com/song/…/`) when the row links to one. CRATE (1.74.0 or later) saves it as the track's RYM link wherever a track has none: when a release is added, when a tracklist is filled in, and in an update ("RYM track links"). A link you typed yourself is never replaced.
- **Recorded.** The release's "Recorded" row is read: the date it began (a year, a month, or a day: "June 1973 – August 1973" gives June 1973), and the place, if one is named ("at Electric Lady Studios, New York City" gives "Electric Lady Studios, New York City"). CRATE puts them in Recorded and Location, filling in a blank one. A year you have is refined by a month or a day of that year. A different date is shown in the review, unticked. A Location you already have is left alone, because it may be where the band formed or a venue.
- **Fix:** scenes and movements (1.13.0) were dropped on the way out of the add-on, so they never reached CRATE. They are now kept.

## Sides E to P (version 1.14.1)

**Fix:** track positions were recognised only for sides A to D (A1 … D9). On a set of three or more records (Neil Young's *Decade* has sides A to F), a track at E1 or F2 came through titled "E1" instead of its real name. Sides A to P are recognised now (up to eight records). CRATE (1.77.1 or later) repairs a saved tracklist with titles like "E1" the next time the release is updated from Rate Your Music: the corrected list is ticked for you.

## Covers from list pages (version 1.14.2)

**Fix:** sending a list page to CRATE (a label's releases, a chart, a genre page) often came through without covers, and CRATE showed letters instead. Two reasons: Rate Your Music loads a list's pictures as you scroll, and the add-on read each row's picture once, when the page opened, before most had arrived; and a cover that wasn't inside the release's link was only taken when it was the row's only picture. Now any row still without a cover is read again when you press **Send to CRATE**, and Rate Your Music's own cover picture is recognised wherever it sits in the row (also as a background picture, or a lazy-loading one). A row with several pictures and none clearly the cover still sends none, rather than maybe an artist photo.

## Covers from genre and chart pages (version 1.14.3)

**Fix:** on a genre or chart page, the part of each row the add-on reads is the title-and-artist column, and the cover sits in the column beside it, so no cover was found even after 1.14.2. The cover is now looked for in the blocks around the row too, as far as they are still about that one release (never in the next row). **Diagnose** on a list page now starts with how many rows have a cover ("9 of 10 with a cover"), lists the first few, and includes the markup around the first row, so a page that still comes through without covers can be looked into. Releases sent before you update keep no cover: send the page again.

## Covers from list pages, really (version 1.14.4)

**Fix:** Rate Your Music's list pages offer each cover in several sizes and two formats (a `<picture>` with 75 and 150 pixel versions as WebP and JPEG). The add-on counted those as several different pictures, and its rule against guessing ("several pictures and none clearly the cover: send none") then dropped them all, so no row had a cover. Addresses that name the same picture (the same id in RYM's picture address) now count as one, and the biggest is sent, a JPEG before a WebP. Two different covers in a row still send none.

## Track positions (version 1.15.0)

Each song of a tracklist now carries its position as the release page writes it ("A", "B2", "3"), so CRATE can show it beside the song's place in the list. A rating's vote count is never taken for one.

## Bold songs (version 1.16.0)

Rate Your Music prints some of a release's songs in bold. The tracklist now marks those songs (`bold: true`), so CRATE can show and filter them. A song counts as bold when its title is drawn heavier than the others on that release (by the page's own style, or a `<b>`/`<strong>` around it); a release whose titles are all drawn the same marks none.

## Bold releases (version 1.17.0)

On list pages (an artist's discography, charts, genre pages), Rate Your Music prints some release titles in bold. The ratings the add-on reads there now say which (`b: 1` bold, `b: 0` not), so CRATE can bold the same releases. As with songs, a release counts as bold when its title is drawn heavier than the others on the page; a page that draws them all the same says nothing, and what was known before stands. A release page itself doesn't show it.

## Your progress through genres and charts (version 1.18.0)

Each genre or chart page you open (`/genre/indie-rock/`, `/genre/indie-rock/2/`, `/charts/top/album/all-time/g:indie-rock/3/`…) is noted, with how many of its releases are in your crate. A page is **done** when you send it to CRATE, press **Mark this page done** in the page panel, or already have every release on it. **Not done after all** takes that back, and then having everything on the page doesn't mark it again.

- The pill says which page you are on, with a ✓ when it is done ("CRATE · 12 of 40 on this page in your crate · page 3 ✓").
- The page panel lists the pages of that genre or chart that are done and the ones opened but not done, when you first opened this one, and links to the **next page to check** (the first one not done).
- **Options → Your progress through genres and charts** lists every genre and chart, the one opened last first, each with a link to its next page, and can forget it all.

A chart with other choices (a decade, a release type) is its own list. Kept in this browser only (`rymPages`, up to 300 lists); nothing is sent anywhere.

## Release details for Pull details (version 1.18.0)

The tracklist kept from a release page now carries that release's **label** (from the info table, else the first issue line, "Blanco y Negro / NEG 19"), **catalogue number**, **release date**, **primary genres** and **cover**. CRATE's *Pull details* shows them in its RYM column (CRATE 1.85.14 or later). A release whose page you opened before 1.18.0 gets them when you open its page again.

## Your progress, in CRATE (version 1.19.0)

CRATE (1.89.2 or later) now shows the genre and chart pages you have checked, on each genre's page in CRATE: a card **On Rate Your Music** with the pages done, the ones opened but not done, and a link to the next page to check, for the genre's own page and any chart of it. When CRATE is open, the add-on hands it this progress (`rymPages`) when asked, and again whenever a page is checked or marked done in another tab. Nothing else is shared, and nothing leaves your browser.

## Updates without tabs (version 1.20.0)

"Update from Rate Your Music" no longer opens a tab for each page. The pages are read in an invisible frame in the add-on's own hidden page (an *offscreen document*, `fetcher.html`), by the same reading code as before, at the same pace (8 to 15 seconds apart, 25 a run). **A tab opens only when Rate Your Music asks for a check:** if the frame gets a check ("Just a moment…", a captcha), or can't read the page, that page is opened in a background tab as before; if the tab gets a check too, the run stops and puts that page in front of you to pass. After a check, the rest of that run uses tabs, so Rate Your Music isn't asked twice for each page.

To show Rate Your Music in a frame, the add-on removes the two response headers that forbid framing (`X-Frame-Options`, `Content-Security-Policy`), and only for frames that are in no tab, which only its hidden page has: pages you open yourself are untouched. The rule lasts while a run is on. This needs three new permissions, which Chrome lists when you reload the add-on: *offscreen*, *declarativeNetRequestWithHostAccess*, and access to `rateyourmusic.com` (the add-on already ran there; now its background may load it too).

Firefox has no offscreen documents, so there the add-on keeps using tabs. To use tabs in Chrome too, tick *"Update from Rate Your Music": read each page in a background tab* in the add-on's Options.

## Parts of a track (version 1.20.1)

Rate Your Music lists the parts of some tracks under them, with no position of their own ("A4 The Nancy & Mary Music", then "a) Part 1", "b) Part 2", "c) Part 3"). These are no longer read as songs: a lettered part ("a)", "b.", "i.") with no position, under a track that has one, belongs to that track and adds its length to a track that had none, as a "- Piece" line already did.

## Artists' details for CRATE (version 1.21.0)

On an artist's page on Rate Your Music, the add-on notes what the page lists beside the name: born or formed, died or disbanded, members (with their roles), member of, and also known as. CRATE asks for these (as it does tracklists), and its artist page's "Fill from RYM" adds them: the artist's type, the dates, members, the bands it was in, and its other names as aliases. Kept in this browser (`rymArtists`, up to 3,000 artists); the same Options switch as genre descriptions turns it off.

**1.24.0** — tells CRATE on arrival that it can find a release's RYM page by its artist and title, so releases you add without a RYM link get looked up straight away (CRATE used to wait to learn that from a finished update).
