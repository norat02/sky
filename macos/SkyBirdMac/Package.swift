// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SkyBirdMac",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "SkyBirdMac", targets: ["SkyBirdMac"])
    ],
    targets: [
        .executableTarget(name: "SkyBirdMac")
    ]
)
