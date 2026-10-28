# Cấu hình signing secrets cho GitHub Actions

Tài liệu này áp dụng cho repository `norat02/sky`, đặc biệt workflow `Release all platforms`.

> Không commit keystore, certificate, provisioning profile, private key hoặc file `.env` vào Git. Chỉ lưu nội dung đã mã hóa Base64 trong GitHub Actions Secrets.

## 0. Tóm tắt: vì sao release `v1.0.0` đang fail

Hai lần chạy workflow `Release all platforms` cho tag `v1.0.0` (ngày 2026-10-13 và
2026-10-17) đều **fail**, trong khi `Security Checks`, `Security TDD Gate`,
`Build shared platforms` và `Build Web and Android Release` đều **success**.

Kết quả theo job:

```text
success    prepare
success    security-gate / Security TDD F-2 to F-10 and regression
success    web
success    Desktop Windows
success    Desktop macOS
success    Desktop Linux
success    macos-swiftui
failure    android
failure    ios
skipped    github-release
```

Vị trí fail chính xác (theo step-level conclusion):

| Job | Step fail | Nguyên nhân |
|---|---|---|
| `android` | `Restore upload keystore` | `test -n "$KEYSTORE_BASE64"` fail ⇒ `secrets.ANDROID_KEYSTORE_BASE64` **rỗng** |
| `ios` | `Install Apple certificate` | `apple-actions/import-codesign-certs@v3` không nhận được `p12-file-base64` ⇒ `secrets.IOS_CERTIFICATE_P12_BASE64` **rỗng** |

Tức là toàn bộ lỗi nằm ở **Repository Secrets chưa được tạo**, không phải ở code build.
Sau khi tạo đủ 11 secret ở mục 3 và 4, chạy lại là build được.

## 1. Script tự động mã hóa Base64

Repository có script fail-closed để chuẩn bị các file secret mà không in nội dung nhạy cảm ra terminal:

```bash
chmod +x scripts/encode-signing-secrets.sh
scripts/encode-signing-secrets.sh \
  --android-keystore /path/to/sky-release.jks \
  --ios-p12 /path/to/distribution.p12 \
  --output-dir .signing-secrets
```

Thêm App Store Connect private key (`.p8`):

```bash
scripts/encode-signing-secrets.sh \
  --appstore-p8 /path/to/AuthKey_ABC123.p8 \
  --output-dir .signing-secrets
```

Script kiểm tra file đầu vào là file thường (từ chối symlink), tạo output với quyền `0600`
trong thư mục `0700`, giải mã ngược và so sánh byte để xác nhận Base64 hợp lệ.
Output nằm trong `.signing-secrets/`, thư mục đã được gitignore.

### 1.1 Ba chế độ mới

**`--check`** — liệt kê chính xác secret nào đang thiếu trong repository:

```bash
scripts/encode-signing-secrets.sh --check --repo norat02/sky
```

```text
Repository: norat02/sky

Required repository secrets:
  [present] ANDROID_KEYSTORE_BASE64
  [MISSING] ANDROID_KEYSTORE_PASSWORD
  ...

7 of 11 required secrets are missing.
```

Lệnh dùng `gh secret list`, chỉ in **tên** secret, không in giá trị. Exit code khác 0 khi
còn thiếu, nên dùng được trong CI.

**`--set-github-secrets`** — upload thẳng 3 secret dạng file lên GitHub, không cần copy-paste:

```bash
scripts/encode-signing-secrets.sh \
  --android-keystore /path/to/sky-release.jks \
  --ios-p12 /path/to/distribution.p12 \
  --appstore-p8 /path/to/AuthKey_ABC123.p8 \
  --output-dir .signing-secrets \
  --set-github-secrets
```

```text
Uploading file-backed secrets to norat02/sky
Uploaded ANDROID_KEYSTORE_BASE64 to norat02/sky
Uploaded IOS_CERTIFICATE_P12_BASE64 to norat02/sky
Uploaded APPSTORE_API_PRIVATE_KEY to norat02/sky

Remaining secrets to set by hand:
  ANDROID_KEYSTORE_PASSWORD
  ANDROID_KEY_ALIAS
  ...
```

Giá trị được truyền qua **stdin** (`gh secret set NAME < file`), không nằm trong argv nên
không bị lộ qua `ps`.

**`--self-test`** — kiểm tra script bằng dữ liệu giả, chạy offline, không cần keystore thật:

```bash
scripts/encode-signing-secrets.sh --self-test
# Self-test OK: Base64 roundtrip, raw .p8 copy, and file modes verified.
```

CI đã chạy lệnh này ở workflow `Security TDD Gate` mỗi lần push/PR.

### 1.2 Ánh xạ tên file → tên secret

| File output | Secret | Ghi chú |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64.txt` | `ANDROID_KEYSTORE_BASE64` | Base64 của file `.jks` |
| `IOS_CERTIFICATE_P12_BASE64.txt` | `IOS_CERTIFICATE_P12_BASE64` | Base64 của file `.p12` |
| `APPSTORE_API_PRIVATE_KEY.txt` | `APPSTORE_API_PRIVATE_KEY` | **PEM gốc, KHÔNG Base64** |

> `.p8` được lưu **raw** vì `apple-actions/download-provisioning-profiles` nhận thẳng nội dung
> PEM. Chỉ `.jks` và `.p12` mới cần Base64. Script tự tạo file raw cho `.p8`, nên không còn
> bước giải mã thủ công nào.

### 1.3 Secret nào script không tạo được

Script **không** và không thể suy ra các giá trị này — phải tự nhập:

```text
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
IOS_CERTIFICATE_PASSWORD
IOS_TEAM_ID
IOS_BUNDLE_ID
APPSTORE_ISSUER_ID
APPSTORE_API_KEY_ID
```

## 2. Mở trang Repository Secrets

1. Mở repository `https://github.com/norat02/sky`.
2. Chọn **Settings**.
3. Chọn **Secrets and variables → Actions**.
4. Chọn tab **Secrets**.
5. Chọn **New repository secret**.
6. Nhập đúng **Name** và **Secret**.
7. Chọn **Add secret**.

Nên dùng **Repository secrets**, không dùng Variables, vì các giá trị này là credential riêng tư.

Cách nhanh hơn bằng CLI (giá trị truyền qua stdin, không nằm trong argv):

```bash
gh secret set ANDROID_KEYSTORE_BASE64 --repo norat02/sky < .signing-secrets/ANDROID_KEYSTORE_BASE64.txt
gh secret set IOS_CERTIFICATE_P12_BASE64 --repo norat02/sky < .signing-secrets/IOS_CERTIFICATE_P12_BASE64.txt
gh secret set APPSTORE_API_PRIVATE_KEY --repo norat02/sky < .signing-secrets/APPSTORE_API_PRIVATE_KEY.txt
```

---

## 3. Android Keystore

### 3.1 Secret nào được workflow đọc ở đâu

| Secret | Job | Step |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | `android` | `Restore upload keystore` → env `KEYSTORE_BASE64` |
| `ANDROID_KEYSTORE_PASSWORD` | `android` | `Build signed APK and AAB` |
| `ANDROID_KEY_ALIAS` | `android` | `Build signed APK and AAB` |
| `ANDROID_KEY_PASSWORD` | `android` | `Build signed APK and AAB` |

### 3.2 Tạo keystore một lần trên máy phát hành

Nếu đã có keystore release hiện tại thì dùng đúng keystore đó. Không tạo keystore mới cho
mỗi build, vì ứng dụng Android đã phát hành phải tiếp tục được ký bằng cùng upload key.

```bash
keytool -genkeypair \
  -v \
  -keystore sky-release.jks \
  -alias sky-upload \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000
```

Lưu lại an toàn ba giá trị:

- Keystore password.
- Key alias, ví dụ `sky-upload`.
- Key password.

Nếu dùng Play App Signing, `sky-release.jks` thường là **upload key**, không phải
app-signing key do Google giữ.

### 3.3 Chuyển keystore sang Base64

Cách được khuyến nghị — dùng script của repository:

```bash
scripts/encode-signing-secrets.sh \
  --android-keystore /path/to/sky-release.jks \
  --output-dir .signing-secrets
```

Hoặc làm thủ công:

Linux:

```bash
base64 -w 0 sky-release.jks > sky-release.jks.b64
```

macOS:

```bash
base64 < sky-release.jks | tr -d '\n' > sky-release.jks.b64
```

Kiểm tra giải mã cục bộ trước khi đưa lên GitHub:

```bash
base64 --decode sky-release.jks.b64 > sky-release-check.jks
keytool -list -keystore sky-release-check.jks -alias sky-upload
rm sky-release-check.jks
```

Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('.\sky-release.jks')) | Set-Content -NoNewline '.\sky-release.jks.b64'
```

### 3.4 Tạo Android Repository Secrets

Tạo đúng bốn secrets sau:

| Secret name | Giá trị |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Toàn bộ nội dung file `sky-release.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | Mật khẩu keystore |
| `ANDROID_KEY_ALIAS` | Alias đã chọn, ví dụ `sky-upload` |
| `ANDROID_KEY_PASSWORD` | Mật khẩu của key alias |

Workflow release sử dụng:

```yaml
env:
  ANDROID_KEYSTORE_PATH: ${{ runner.temp }}/sky-upload.jks
  ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
  ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
  ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
```

Không in các secret ra log. GitHub sẽ mask secret, nhưng vẫn không được dùng `echo` để
kiểm tra giá trị.

> **Ghi chú build cục bộ:** `android/app/build.gradle` đọc `ANDROID_KEYSTORE_PATH` hoặc
> `ANDROID_KEYSTORE_BASE64` từ biến môi trường, và fallback sang file `keystore.properties`
> nếu có. Biến môi trường được ưu tiên, nên không cần tạo `keystore.properties` trong CI.

### 3.5 Kiểm tra Android release

Sau khi tạo đủ secrets:

1. Vào **Actions → Release all platforms**.
2. Chọn workflow run của tag `v1.0.0`, hoặc chạy lại failed jobs.
3. Bước `Restore upload keystore` phải pass.
4. Bước `Build signed APK and AAB` phải pass.
5. Kiểm tra artifact bằng:

```bash
apksigner verify --verbose sky-bird-release.apk
```

Với AAB:

```bash
jarsigner -verify -verbose -certs sky-bird-release.aab
```

Nếu workflow dùng `ANDROID_KEYSTORE_BASE64` rỗng, build release sẽ fail có chủ đích để
tránh tạo artifact không thể phát hành.

---

## 4. iOS Signing

### 4.1 Secret nào được workflow đọc ở đâu

| Secret | Job | Step |
|---|---|---|
| `IOS_CERTIFICATE_P12_BASE64` | `ios` | `Install Apple certificate` → `p12-file-base64` |
| `IOS_CERTIFICATE_PASSWORD` | `ios` | `Install Apple certificate` → `p12-password` |
| `IOS_BUNDLE_ID` | `ios` | `Install provisioning profile` → `bundle-id` |
| `APPSTORE_ISSUER_ID` | `ios` | `Install provisioning profile` → `issuer-id` |
| `APPSTORE_API_KEY_ID` | `ios` | `Install provisioning profile` → `api-key-id` |
| `APPSTORE_API_PRIVATE_KEY` | `ios` | `Install provisioning profile` → `api-private-key` |
| `IOS_TEAM_ID` | `ios` | `Archive iOS app` + `Export IPA` → env `TEAM_ID` |

### 4.2 Chuẩn bị Apple certificate `.p12`

Trên macOS:

1. Mở **Keychain Access**.
2. Chọn certificate phân phối hoặc certificate dùng cho CI.
3. Export thành file `.p12`.
4. Đặt một mật khẩu export mạnh.

Chuyển thành Base64:

```bash
base64 < distribution.p12 | tr -d '\n' > distribution.p12.b64
```

Kiểm tra certificate trước khi upload:

```bash
security pkcs12 -in distribution.p12 -info -noout
```

Không commit `.p12` hoặc file Base64 vào repository.

### 4.3 Tạo App Store Connect API key

1. Đăng nhập [App Store Connect](https://appstoreconnect.apple.com/).
2. Mở **Users and Access → Integrations → App Store Connect API**.
3. Tạo key mới với quyền tối thiểu cần thiết cho workflow release.
4. Tải file `.p8` ngay sau khi tạo; Apple chỉ cho tải private key một lần.
5. Ghi lại:
   - Issuer ID.
   - Key ID.
   - Nội dung file `.p8`.

Không chia sẻ hoặc commit file `.p8`.

### 4.4 Tạo iOS Repository Secrets

| Secret name | Giá trị |
|---|---|
| `IOS_CERTIFICATE_P12_BASE64` | Toàn bộ Base64 của file `.p12` |
| `IOS_CERTIFICATE_PASSWORD` | Mật khẩu export `.p12` |
| `IOS_TEAM_ID` | Apple Developer Team ID, thường 10 ký tự |
| `IOS_BUNDLE_ID` | Bundle ID đã đăng ký, ví dụ `com.norat02.skybird` |
| `APPSTORE_ISSUER_ID` | Issuer ID của App Store Connect API |
| `APPSTORE_API_KEY_ID` | Key ID của App Store Connect API |
| `APPSTORE_API_PRIVATE_KEY` | Toàn bộ nội dung file `.p8` (PEM gốc) |

Workflow sử dụng các secret này ở:

- `apple-actions/import-codesign-certs@v3`.
- `apple-actions/download-provisioning-profiles@v4`.
- `xcodebuild archive` và `xcodebuild -exportArchive`.

### 4.5 Điều kiện Apple phải khớp

Các giá trị sau phải cùng một ứng dụng/team:

- `IOS_TEAM_ID` phải thuộc Apple Developer account tạo certificate.
- `IOS_BUNDLE_ID` phải khớp Bundle Identifier trong Xcode và provisioning profile.
- Certificate `.p12` phải chứa private key tương ứng.
- API key phải thuộc đúng App Store Connect team.
- Provisioning profile phải còn hạn và hỗ trợ distribution method mà workflow sử dụng.

Nếu `IOS_CERTIFICATE_P12_BASE64` trống, workflow sẽ dừng tại `Install Apple certificate` với
lỗi `At least one of p12-filepath or p12-file-base64 must be provided`.

---

## 5. Kiểm tra secrets mà không làm lộ giá trị

Có thể kiểm tra secret đã tồn tại bằng GitHub CLI; lệnh chỉ in tên, không in giá trị:

```bash
gh secret list --repo norat02/sky
```

Hoặc dùng script để biết chính xác cái nào còn thiếu:

```bash
scripts/encode-signing-secrets.sh --check --repo norat02/sky
```

Các tên bắt buộc cho release:

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
IOS_CERTIFICATE_P12_BASE64
IOS_CERTIFICATE_PASSWORD
IOS_TEAM_ID
IOS_BUNDLE_ID
APPSTORE_ISSUER_ID
APPSTORE_API_KEY_ID
APPSTORE_API_PRIVATE_KEY
```

Không dùng:

```bash
gh secret list --json name,updatedAt
```

để thay thế việc kiểm tra giá trị; GitHub không cung cấp giá trị secret sau khi đã lưu.

---

## 6. Chạy lại release

Sau khi cấu hình xong:

1. Vào **Actions → Release all platforms**.
2. Chọn run tag `v1.0.0`.
3. Chọn **Re-run failed jobs**.
4. Nếu muốn chạy lại toàn bộ workflow, chọn **Re-run all jobs**.
5. Chỉ khi Android và iOS pass thì job `github-release` mới chạy.

Nếu muốn tạo tag phát hành mới sau khi đã cấu hình signing:

```bash
git tag -a v1.0.1 -m "Release v1.0.1"
git push origin v1.0.1
```

## 7. Checklist bảo mật

- [ ] Keystore được backup offline an toàn.
- [ ] `.jks`, `.p12`, `.p8`, `.mobileprovision` không nằm trong Git.
- [ ] Thư mục `.signing-secrets/` đã bị xoá sau khi upload.
- [ ] Không gửi secret qua chat hoặc issue.
- [ ] Repository secret được giới hạn ở repository cần dùng.
- [ ] App Store Connect API key có quyền tối thiểu.
- [ ] Đã kiểm tra expiry của certificate và provisioning profile.
- [ ] Đã kiểm tra APK/AAB/IPA bằng công cụ ký tương ứng.
- [ ] Đã thu hồi key cũ nếu từng bị lộ.
