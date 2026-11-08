// Scripts the app puts into the CRATE page (see WebViewController.loadView).
enum CrateScripts {
    /// Into every frame: CRATE's page and the YouTube / SoundCloud players inside it.
    ///  1. A page is never told the app went to the background (YouTube's player pauses itself when its page is hidden).
    ///  2. If iOS pauses the music as the app goes to the background, it is started again, unless it was paused on purpose
    ///     (the lock screen's pause, which tells every frame first: "userPause").
    /// The app's state reaches the frames as postMessage({ __crateApp: … }), passed down from CRATE's page frame by frame.
    static let everyFrame = #"""
    (function () {
      if (window.__crateKeepPlaying) return;
      window.__crateKeepPlaying = true;
      var always = function (name, value) {
        try { Object.defineProperty(Document.prototype, name, { configurable: true, get: function () { return value; } }); } catch (e) {}
      };
      always('hidden', false); always('webkitHidden', false);
      always('visibilityState', 'visible'); always('webkitVisibilityState', 'visible');
      ['visibilitychange', 'webkitvisibilitychange'].forEach(function (type) {
        var stop = function (e) { e.stopImmediatePropagation(); };
        document.addEventListener(type, stop, true);
        window.addEventListener(type, stop, true);
      });
      var background = false, pausedOnPurposeAt = 0;
      window.addEventListener('message', function (e) {
        var d = e.data;
        if (!d || typeof d !== 'object' || !d.__crateApp) return;
        if (d.__crateApp === 'background') background = !!d.on;
        if (d.__crateApp === 'userPause') pausedOnPurposeAt = Date.now();
        for (var i = 0; i < window.frames.length; i++) { try { window.frames[i].postMessage(d, '*'); } catch (err) {} }
      });
      document.addEventListener('pause', function (e) {
        var media = e.target;
        if (!(media instanceof HTMLMediaElement) || !background) return;
        setTimeout(function () {
          if (!background || !media.paused || media.ended || Date.now() - pausedOnPurposeAt < 2500) return;
          var p = media.play();
          if (p && p.catch) p.catch(function () {});
        }, 300);
      }, true);
    })();
    """#

    /// Into CRATE's page only: what the app calls (window.__crateApp). CRATE answers the lock screen's buttons with
    /// window.crateRemote, and reports what's playing to the app (js/39-phone-playback.js).
    static let mainFrame = #"""
    (function () {
      var tell = function (d) { try { window.postMessage(d, '*'); } catch (e) {} };
      window.__crateApp = {
        native: true,
        setBackground: function (on) { tell({ __crateApp: 'background', on: !!on }); },
        remote: function (action) {
          if (action === 'pause' || action === 'toggle') tell({ __crateApp: 'userPause' });
          if (typeof window.crateRemote === 'function') window.crateRemote(action);
        }
      };
    })();
    """#
}
