import UIKit
import WebKit
import AVFoundation
import MediaPlayer

// The CRATE page, full screen. What the app adds to it (all of it because iOS gives a web page in Safari none of these):
//  - music keeps playing with the phone locked: background audio (Info.plist), the page's process kept running, and the
//    scripts in CrateScripts.swift, which stop YouTube's player learning the app was hidden and start it again if iOS pauses it;
//  - YouTube and SoundCloud start without a tap on their own player (no "user action" needed for playback here);
//  - the lock screen's song, artist, cover, play / pause and previous / next, from what the page reports ("nowPlaying");
//  - Google's sign-in window, alerts and confirmations, and links to other apps (Spotify, YouTube, Rate Your Music …).
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    static let home = URL(string: "https://tirantbacon23.github.io/CRATE/")!
    /// Pages that open inside the app: CRATE and the sign-in pages it sends you to. Any other page opens in its own app or Safari.
    static let inAppHosts: Set<String> = ["tirantbacon23.github.io", "accounts.google.com", "accounts.spotify.com", "www.last.fm", "last.fm"]
    static let background = UIColor(red: 0x12 / 255.0, green: 0x16 / 255.0, blue: 0x1C / 255.0, alpha: 1)
    static let accent = UIColor(red: 0xD6 / 255.0, green: 0xA2 / 255.0, blue: 0x4C / 255.0, alpha: 1)

    private var webView: WKWebView!
    private var popup: WKWebView?
    private var popupBar: UIView?
    private var artworkURL = ""
    private var artwork: MPMediaItemArtwork?

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []          // the page may start music itself (Safari wants a tap on the player)
        config.allowsPictureInPictureMediaPlayback = true
        config.websiteDataStore = .default()                          // sign-ins and settings are kept between launches
        // Reads as Safari to the sites CRATE uses (Google refuses to sign in inside an app's web view that says otherwise).
        let major = UIDevice.current.systemVersion.split(separator: ".").first.map(String.init) ?? "17"
        config.applicationNameForUserAgent = "Version/\(major).0 Mobile/15E148 Safari/604.1"
        // Keeps the page's process running at full speed in the background, so CRATE can move on to the next song with the
        // phone locked. WebKit's own setting, not a published one: only called where this iOS has it.
        let keepRunning = NSSelectorFromString("_setAlwaysRunsAtForegroundPriority:")
        if config.responds(to: keepRunning) {
            typealias SetBool = @convention(c) (AnyObject, Selector, Bool) -> Void
            unsafeBitCast(config.method(for: keepRunning), to: SetBool.self)(config, keepRunning, true)
        }

        let content = WKUserContentController()
        content.addUserScript(WKUserScript(source: CrateScripts.everyFrame, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        content.addUserScript(WKUserScript(source: CrateScripts.mainFrame, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.add(WeakScriptHandler(self), name: "crate")
        config.userContentController = content

        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = Self.background
        web.scrollView.backgroundColor = Self.background
        web.scrollView.contentInsetAdjustmentBehavior = .never   // the page keeps clear of the notch and home indicator itself
        web.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, *) { web.isInspectable = true }   // Safari's Web Inspector on a Mac can look inside

        let root = UIView()
        root.backgroundColor = Self.background
        web.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: root.topAnchor),
            web.bottomAnchor.constraint(equalTo: root.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: root.trailingAnchor),
        ])
        webView = web
        view = root
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: Self.home))
        setUpRemoteCommands()
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(willEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    @objc private func didEnterBackground() { webView.evaluateJavaScript("window.__crateApp && window.__crateApp.setBackground(true)", completionHandler: nil) }
    @objc private func willEnterForeground() { webView.evaluateJavaScript("window.__crateApp && window.__crateApp.setBackground(false)", completionHandler: nil) }

    // MARK: Where links go

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.allow); return }
        let scheme = (url.scheme ?? "").lowercased()
        if !["http", "https", "about", "blob", "data"].contains(scheme) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)   // spotify:, youtube:, mailto: …: their own app
            decisionHandler(.cancel)
            return
        }
        // Frames inside the page (YouTube, SoundCloud, Google's sign-in button) load whatever they load, as does the sign-in window.
        if navigationAction.targetFrame?.isMainFrame == false || webView === popup || scheme != "http" && scheme != "https" {
            decisionHandler(.allow)
            return
        }
        if Self.inAppHosts.contains((url.host ?? "").lowercased()) {
            decisionHandler(.allow)
            return
        }
        UIApplication.shared.open(url, options: [:], completionHandler: nil)       // any other page: its own app, or Safari
        decisionHandler(.cancel)
    }

    // A new window: Google's sign-in opens over CRATE (it reports back to CRATE and closes itself); anything else (Spotify,
    // Rate Your Music, "Play in the YouTube app" …) goes to its own app, or Safari.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let url = navigationAction.request.url
        let host = (url?.host ?? "").lowercased()
        if url == nil || url?.absoluteString == "about:blank" || host == "accounts.google.com" {
            return openPopup(configuration)
        }
        if let url = url { UIApplication.shared.open(url, options: [:], completionHandler: nil) }
        return nil
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView === popup { closePopup() }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === self.webView { webView.reload() }   // iOS reclaimed the page's memory: start it again
    }

    private func openPopup(_ configuration: WKWebViewConfiguration) -> WKWebView {
        closePopup()
        let bar = UIView()
        bar.backgroundColor = Self.background
        let close = UIButton(type: .system)
        close.setTitle("Close", for: .normal)
        close.tintColor = Self.accent
        close.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        close.addTarget(self, action: #selector(closePopupTapped), for: .touchUpInside)
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.uiDelegate = self
        for v in [bar, web] as [UIView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(v)
        }
        close.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(close)
        NSLayoutConstraint.activate([
            bar.topAnchor.constraint(equalTo: view.topAnchor),
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 44),
            close.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -16),
            close.bottomAnchor.constraint(equalTo: bar.bottomAnchor, constant: -6),
            web.topAnchor.constraint(equalTo: bar.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        popup = web
        popupBar = bar
        return web
    }

    @objc private func closePopupTapped() { closePopup() }

    private func closePopup() {
        popup?.removeFromSuperview()
        popupBar?.removeFromSuperview()
        popup = nil
        popupBar = nil
    }

    // MARK: alert(), confirm() and prompt() (a web view shows none of them by itself, and confirm() would answer "no")

    private func show(_ alert: UIAlertController, otherwise: () -> Void) {
        guard presentedViewController == nil, view.window != nil else { otherwise(); return }
        present(alert, animated: true, completion: nil)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        show(alert) { completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        show(alert) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in completionHandler(alert?.textFields?.first?.text ?? "") })
        show(alert) { completionHandler(nil) }
    }

    // MARK: Lock screen and Control Center

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        if type == "nowPlaying" { updateNowPlaying(body) }
    }

    private func updateNowPlaying(_ info: [String: Any]) {
        let center = MPNowPlayingInfoCenter.default()
        let title = info["title"] as? String ?? ""
        if title.isEmpty { center.nowPlayingInfo = nil; return }
        let playing = info["playing"] as? Bool ?? false
        if playing { try? AVAudioSession.sharedInstance().setActive(true, options: []) }
        var now: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: info["artist"] as? String ?? "",
            MPMediaItemPropertyAlbumTitle: info["album"] as? String ?? "",
            MPNowPlayingInfoPropertyPlaybackRate: playing ? 1.0 : 0.0,
        ]
        if let duration = info["duration"] as? Double, duration > 0 { now[MPMediaItemPropertyPlaybackDuration] = duration }
        if let position = info["position"] as? Double, position >= 0 { now[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position }
        let art = info["art"] as? String ?? ""
        if art == artworkURL, let artwork = artwork { now[MPMediaItemPropertyArtwork] = artwork }
        center.nowPlayingInfo = now
        if art != artworkURL {
            artworkURL = art
            artwork = nil
            loadArtwork(art)
        }
    }

    private func loadArtwork(_ address: String) {
        guard let url = URL(string: address), (url.scheme ?? "").hasPrefix("http") else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let data = data, let image = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                guard let self = self, self.artworkURL == address else { return }
                let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                self.artwork = artwork
                var now = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                now[MPMediaItemPropertyArtwork] = artwork
                MPNowPlayingInfoCenter.default().nowPlayingInfo = now
            }
        }.resume()
    }

    private func setUpRemoteCommands() {
        let commands = MPRemoteCommandCenter.shared()
        let pairs: [(MPRemoteCommand, String)] = [
            (commands.playCommand, "play"), (commands.pauseCommand, "pause"), (commands.togglePlayPauseCommand, "toggle"),
            (commands.nextTrackCommand, "next"), (commands.previousTrackCommand, "previous"),
        ]
        for (command, action) in pairs {
            command.isEnabled = true
            command.addTarget { [weak self] _ in
                self?.webView.evaluateJavaScript("window.__crateApp && window.__crateApp.remote('\(action)')", completionHandler: nil)
                return .success
            }
        }
        UIApplication.shared.beginReceivingRemoteControlEvents()
    }
}

/// WKUserContentController holds its message handlers strongly; this keeps it from holding the view controller.
final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
