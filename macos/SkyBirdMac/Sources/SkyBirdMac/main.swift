import SwiftUI
import WebKit

private let defaultGameURL = URL(string: "https://norat02.github.io/sky/")!

@main
struct SkyBirdMacApp: App {
    var body: some Scene {
        WindowGroup("Sky Bird") {
            SkyBirdMacRootView()
                .frame(minWidth: 960, minHeight: 640)
                .preferredColorScheme(.dark)
        }
        .commands {
            CommandGroup(replacing: .appInfo) {
                Button("About Sky Bird") {}
            }
        }
    }
}

struct SkyBirdMacRootView: View {
    @State private var isLoading = true
    @State private var loadError: String?

    var body: some View {
        ZStack {
            Color(red: 0.03, green: 0.07, blue: 0.12)
                .ignoresSafeArea()
            SkyBirdWebView(
                url: configuredGameURL,
                isLoading: $isLoading,
                loadError: $loadError
            )
            if isLoading {
                ProgressView("Loading Sky Bird…")
                    .tint(.cyan)
                    .foregroundStyle(.white)
                    .padding(24)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
            }
            if let loadError {
                VStack(spacing: 12) {
                    Text("Unable to load Sky Bird")
                        .font(.headline)
                    Text(loadError)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                    Button("Retry") { self.loadError = nil }
                }
                .padding(24)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18))
            }
        }
    }

    private var configuredGameURL: URL {
        if let value = ProcessInfo.processInfo.environment["SKY_BIRD_WEB_URL"],
           let url = URL(string: value), url.scheme != nil {
            return url
        }
        return defaultGameURL
    }
}

struct SkyBirdWebView: NSViewRepresentable {
    let url: URL
    @Binding var isLoading: Bool
    @Binding var loadError: String?

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        private let parent: SkyBirdWebView
        init(_ parent: SkyBirdWebView) { self.parent = parent }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            DispatchQueue.main.async { self.parent.isLoading = true; self.parent.loadError = nil }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            DispatchQueue.main.async { self.parent.isLoading = false }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            DispatchQueue.main.async {
                self.parent.isLoading = false
                self.parent.loadError = error.localizedDescription
            }
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            DispatchQueue.main.async {
                self.parent.isLoading = false
                self.parent.loadError = error.localizedDescription
            }
        }
    }
}
