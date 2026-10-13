# Cấu hình signing secrets cho GitHub Actions

Tài liệu này áp dụng cho repository `norat02/sky`, đặc biệt workflow `Release all platforms`.

> Không commit keystore, certificate, provisioning profile, private key hoặc file `.env` vào Git. Chỉ lưu nội dung đã mã hóa Base64 trong GitHub Actions Secrets.

## Script tự động mã hóa Base64

Repository có script fail-closed để chuẩn bị các file secret mà không in nội dung nhạy cảm ra terminal:

```bash
chmod +x scripts/encode-signing-secrets.sh
scripts/encode-signing-secrets.sh \
  --android-keystore /path/to/sky-release.jks \
  --ios-p12 /path/to/distribution.p12 \
  --output-dir .signing-secrets
```

Nếu cần chuẩn bị thêm App Store Connect private key:

```bash
scripts/encode-signing-secrets.sh \
  --appstore-p8 /path/to/AuthKey_ABC123.p8 \
  --output-dir .signing-secrets
```

Script kiểm tra file đầu vào là file thường, tạo output với quyền `0600`, giải mã ngược và so sánh byte để xác nhận Base64 hợp lệ. Output nằm trong `.signing-secrets/`, thư mục đã được gitignore. Chỉ copy nội dung file vào GitHub Secret, không commit thư mục này.

Các file được tạo:

- `ANDROID_KEYSTORE_BASE64.txt` → secret `ANDROID_KEYSTORE_BASE64`.
- `IOS_CERTIFICATE_P12_BASE64.txt` → secret `IOS_CERTIFICATE_P12_BASE64`.
- `APPSTORE_API_PRIVATE_KEY_BASE64.txt` là bản Base64 tùy chọn; secret `APPSTORE_API_PRIVATE_KEY` cần **nội dung PEM gốc của `.p8`**, không phải chuỗi Base64. Có thể xem hướng dẫn xử lý `.p8` ở phần App Store Connect bên dưới.

## 1. Mở trang Repository Secrets

1. Mở repository `https://github.com/norat02/sky`.
2. Chọn **Settings**.
3. Chọn **Secrets and variables → Actions**.
4. Chọn tab **Secrets**.
5. Chọn **New repository secret**.
6. Nhập đúng **Name** và **Secret**.
7. Chọn **Add secret**.

Nên dùng **Repository secrets**, không dùng Variables, vì các giá trị này là credential riêng tư.

---

## 2. Android Keystore

### 2.1 Tạo keystore một lần trên máy phát hành

Nếu đã có keystore release hiện tại thì dùng đúng keystore đó. Không tạo keystore mới cho mỗi build, vì ứng dụng Android đã phát hành phải tiếp tục được ký bằng cùng upload key.

```bash
keytool -genkeypair \\
  -v \\
  -keystore sky-release.jks \\
  -alias sky-upload \\
  -keyalg RSA \\
  -keysize 4096 \\
  -validity 10000
```

Lưu lại an toàn ba giá trị:

- Keystore password.
- Key alias, ví dụ `sky-upload`.
- Key password.

Nếu dùng Play App Signing, `sky-release.jks` thường là **upload key**, không phải app-signing key do Google giữ.

### 2.2 Chuyển keystore sang Base64

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

### 2.3 Tạo Android Repository Secrets

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

Không in các secret ra log. GitHub sẽ mask secret, nhưng vẫn không được dùng `echo` để kiểm tra giá trị.

### 2.4 Kiểm tra Android release

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

Nếu workflow dùng `ANDROID_KEYSTORE_BASE64` rỗng, build release sẽ fail có chủ đích để tránh tạo artifact không thể phát hành.

---

## 3. iOS Signing

Job iOS của workflow release cần certificate `.p12`, App Store Connect API key và provisioning profile được lấy theo bundle ID.

### 3.1 Chuẩn bị Apple certificate `.p12`

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

### 3.2 Tạo App Store Connect API key

1. Đăng nhập [App Store Connect](https://appstoreconnect.apple.com/).
2. Mở **Users and Access → Integrations → App Store Connect API**.
3. Tạo key mới với quyền tối thiểu cần thiết cho workflow release.
4. Tải file `.p8` ngay sau khi tạo; Apple chỉ cho tải private key một lần.
5. Ghi lại:
   - Issuer ID.
   - Key ID.
   - Nội dung file `.p8`.

Không chia sẻ hoặc commit file `.p8`.

### 3.3 Tạo iOS Repository Secrets

Tạo đúng các secrets sau:

| Secret name | Giá trị |
|---|---|
| `IOS_CERTIFICATE_P12_BASE64` | Toàn bộ Base64 của file `.p12` |
| `IOS_CERTIFICATE_PASSWORD` | Mật khẩu export `.p12` |
| `IOS_TEAM_ID` | Apple Developer Team ID, thường 10 ký tự |
| `IOS_BUNDLE_ID` | Bundle ID đã đăng ký, ví dụ `com.norat02.skybird` |
| `APPSTORE_ISSUER_ID` | Issuer ID của App Store Connect API |
| `APPSTORE_API_KEY_ID` | Key ID của App Store Connect API |
| `APPSTORE_API_PRIVATE_KEY` | Toàn bộ nội dung file `.p8` |

Workflow sử dụng các secret này ở:

- `apple-actions/import-codesign-certs@v3`.
- `apple-actions/download-provisioning-profiles@v4`.
- `xcodebuild archive` và `xcodebuild -exportArchive`.

### 3.4 Điều kiện Apple phải khớp

Các giá trị sau phải cùng một ứng dụng/team:

- `IOS_TEAM_ID` phải thuộc Apple Developer account tạo certificate.
- `IOS_BUNDLE_ID` phải khớp Bundle Identifier trong Xcode và provisioning profile.
- Certificate `.p12` phải chứa private key tương ứng.
- API key phải thuộc đúng App Store Connect team.
- Provisioning profile phải còn hạn và hỗ trợ distribution method mà workflow sử dụng.

Nếu `IOS_CERTIFICATE_P12_BASE64` trống, workflow sẽ dừng tại `Install Apple certificate` với lỗi `At least one of p12-filepath or p12-file-base64 must be provided`.

---

## 4. Kiểm tra secrets mà không làm lộ giá trị

Có thể kiểm tra secret đã tồn tại bằng GitHub CLI; lệnh chỉ in tên, không in giá trị:

```bash
gh secret list --repo norat02/sky
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

## 5. Chạy lại release

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

## 6. Checklist bảo mật

- [ ] Keystore được backup offline an toàn.
- [ ] `.jks`, `.p12`, `.p8`, `.mobileprovision` không nằm trong Git.
- [ ] Không gửi secret qua chat hoặc issue.
- [ ] Repository secret được giới hạn ở repository cần dùng.
- [ ] App Store Connect API key có quyền tối thiểu.
- [ ] Đã kiểm tra expiry của certificate và provisioning profile.
- [ ] Đã kiểm tra APK/AAB/IPA bằng công cụ ký tương ứng.
- [ ] Đã thu hồi key cũ nếu từng bị lộ.
