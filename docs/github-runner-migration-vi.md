# Cố định GitHub Actions trên Ubuntu 24.04

Toàn bộ workflow Linux của repository đã đổi từ `ubuntu-latest` sang `ubuntu-24.04` để không bị chuyển tự động sang Ubuntu 26 từ ngày 19/10/2026.

## Workflow đã cập nhật

- `.github/workflows/android.yml`
- `.github/workflows/platforms.yml`
- `.github/workflows/release.yml`
- `.github/workflows/security-gate.yml`
- `.github/workflows/security.yml`

Các runner Windows và macOS vẫn giữ nguyên `windows-latest` và `macos-latest`; thay đổi này chỉ cố định runner Ubuntu.

## Checklist sau chuyển đổi

- Node.js 24 qua `actions/setup-node@v7`.
- Java 21 qua `actions/setup-java@v6`.
- Android SDK được cài bằng `android-actions/setup-android@v4` và `sdkmanager`.
- Electron builder Linux chạy trên Ubuntu 24.04.
- CodeQL v4 chạy trên Ubuntu 24.04.
- Security TDD Gate và API smoke tests chạy trên Ubuntu 24.04.
- Không còn chuỗi `ubuntu-latest` trong `.github/workflows`.

## Kiểm tra khi GitHub runner image thay đổi

Nếu GitHub thay đổi preinstalled toolchain của Ubuntu 24.04, kiểm tra lại:

```bash
npm run ci:security
npx cap sync android
cd android && ./gradlew --version
```

Release Android cần thêm signing secrets; release iOS cần certificate và App Store Connect secrets theo `docs/release-signing-secrets-vi.md`.
