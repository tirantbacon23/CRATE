# CRATE tests

Automated checks of CRATE's own logic: reading pasted tracklists, what an update from Rate Your Music proposes, scenes as genres, the
crate file format and ratings spreadsheet, the update log, the Processing queue, and (when its folder sits beside CRATE's) the RYM
add-on's reading of release pages.

## Running them

From the folder that holds `index.html`:

```
python -m http.server 8790 --bind 127.0.0.1
```

then open <http://127.0.0.1:8790/tests/>. It starts CRATE in a hidden frame with 400 made-up releases and lists every check, with
what was expected and what came back for any that fail. A script can read the same results from `window.__testResults`
(`{ passed, failed, skipped, failures, done }`).

## Why only on this computer

`?crate-test` makes `index.html` load `tests/mock.js`, which fakes the Google sign-in, the back end, iTunes, Spotify and YouTube, and
puts made-up sign-in details in the browser's storage for that address. That would replace a real sign-in, so the hook and the runner
both refuse anywhere but `localhost` / `127.0.0.1`. Use a port you don't use CRATE on day to day (8790 above), since each address keeps
its own settings.

## Adding a check

Tests are plain functions in `crate.test.js` (or `addon.test.js`):

```js
suite('Tracklists', () => {
  test('lengths read and written', () => { eq(app('tlParseTime')('3:12'), 192000); });
});
```

`app('name')` is any function, `const` or `let` in the running app; `eq(actual, expected)` compares as JSON; `ok(cond)`; `skip(why)`.
Run them before every release.
