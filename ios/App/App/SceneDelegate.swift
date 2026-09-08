import UIKit
import SwiftUI
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let rootView = SkyBirdSwiftUIRootView()
        let host = UIHostingController(rootView: rootView)
        let appWindow = UIWindow(windowScene: windowScene)
        appWindow.rootViewController = host
        appWindow.makeKeyAndVisible()
        window = appWindow

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// SwiftUI shell cho iPhone/iPad; game và auth vẫn dùng bundle web chung với Android/PC.
struct SkyBirdSwiftUIRootView: View {
    var body: some View {
        ZStack {
            Color(red: 0.03, green: 0.07, blue: 0.12)
                .ignoresSafeArea()
            CapacitorBridgeViewController()
                .ignoresSafeArea()
        }
        .preferredColorScheme(.dark)
    }
}

struct CapacitorBridgeViewController: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> CAPBridgeViewController {
        CAPBridgeViewController()
    }

    func updateUIViewController(_ viewController: CAPBridgeViewController, context: Context) {}
}

#Preview {
    SkyBirdSwiftUIRootView()
}
