# CRATE for iPhone

A small iPhone app that opens CRATE (https://tirantbacon23.github.io/CRATE/) full screen, and adds what a web page in Safari
can't have:

- **Music keeps playing with the phone locked**: it is an audio app to iOS, the page keeps running in the background (so the
  next song starts by itself), and YouTube's player isn't told the app went away, or is started again if iOS pauses it.
- **No "tap the video to start it"**: the app lets YouTube and SoundCloud start by themselves.
- **The lock screen** shows the song, artist and cover, with play / pause and previous / next.
- Google's sign-in window, CRATE's confirmations, and links to other apps (Spotify, YouTube, Rate Your Music) work as they
  should.

Everything else is the CRATE page itself, so the app picks up every change to the page by itself: it only needs rebuilding when
something in `ios/` changes.

## Getting the app

GitHub builds it on a Mac (`.github/workflows/ios.yml`, whenever `ios/` changes on `main`, or from the Actions tab → *iPhone
app* → *Run workflow*) and publishes **CRATE.ipa** on the [iPhone app release](https://github.com/tirantbacon23/CRATE/releases/tag/ios-app).
It is unsigned: the installer signs it with your Apple ID.

## Installing it from a Windows PC (free Apple ID)

With a free Apple ID an app you install yourself runs for **7 days**, then needs signing again (AltStore can do that by itself).

### Sideloadly (simplest)

1. On the PC, install **iTunes** and **iCloud** from Apple's website (not the Microsoft Store versions), then
   [Sideloadly](https://sideloadly.io).
2. Connect the iPhone with a cable and tap *Trust* on the phone.
3. Open Sideloadly, drag **CRATE.ipa** into it, enter your Apple ID, and press *Start*.
4. On the iPhone: *Settings → General → VPN & Device Management*, tap your Apple ID under *Developer App*, and *Trust* it.
   On iOS 16 and later also turn on *Settings → Privacy & Security → Developer Mode* (the phone restarts).
5. Every 7 days, do step 3 again (your settings and sign-ins are kept).

### AltStore (re-signs itself every few days)

1. Install **iTunes** and **iCloud** (as above) and **AltServer** from [altstore.io](https://altstore.io) on the PC.
2. From AltServer's icon in the taskbar, install AltStore onto the iPhone (cable connected, same Wi-Fi).
3. Download CRATE.ipa on the iPhone (from the release page), then in AltStore: *My Apps → +* and pick it.
4. Trust it and turn on Developer Mode as in step 4 above.
5. With AltServer running on the PC and both on the same Wi-Fi, AltStore refreshes CRATE before the 7 days run out.

## Things to know

- **Signing in with Google** happens in a window over CRATE. Google renews a sign-in quietly every hour in Safari; inside an
  app that may not work, in which case CRATE asks you to tap *Sign in with Google* again now and then.
- **Spotify** still plays through the Spotify app (Spotify's in-browser player doesn't run on phones), so Spotify releases
  behave as they do in Safari: they keep playing locked, from the Spotify app.
- **YouTube with the phone locked** is the part that can't be tested without an iPhone: iOS may still pause video in an app's
  web view in ways the app can't undo. If it does, say so, with what happens.

## Building it yourself on a Mac

```
brew install xcodegen
cd ios && xcodegen generate && open CRATE.xcodeproj
```

Choose your team under *Signing & Capabilities*, plug in the iPhone and press Run.
