import UIKit
import AVFoundation

// CRATE for iPhone: the CRATE web page (tirantbacon23.github.io/CRATE) in a full-screen web view, as an app that iOS lets keep
// playing music with the phone locked. Everything CRATE does still comes from the page, so the app updates when the page does.
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // "Playback": the app's sound keeps going with the phone locked or muted (with UIBackgroundModes audio in Info.plist).
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = UIColor(red: 0x12 / 255.0, green: 0x16 / 255.0, blue: 0x1C / 255.0, alpha: 1)
        window.rootViewController = WebViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
