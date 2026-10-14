# Nâng cấp CodeQL Action lên v4

Workflow `.github/workflows/security.yml` đã được cập nhật:

```yaml
- uses: github/codeql-action/init@v4
  with:
    languages: javascript
- uses: github/codeql-action/analyze@v4
```

## Quyền workflow

Workflow giữ quyền tối thiểu cần thiết:

```yaml
permissions:
  contents: read
  security-events: write
  actions: read
```

- `contents: read`: checkout source.
- `security-events: write`: ghi kết quả CodeQL vào tab Security.
- `actions: read`: cho phép action đọc metadata cần thiết của workflow.

Không cần cấp `contents: write`, `packages: write` hoặc quyền quản trị repository.

## Kiểm tra sau nâng cấp

1. Chạy local các kiểm thử repository:

   ```bash
   npm run ci:security
   ```

2. Push branch/PR để GitHub chạy job `Dependency audit and CodeQL`.
3. Xác nhận log có các bước `Initialize CodeQL` và `CodeQL analysis` pass.
4. Xác nhận annotation không còn:

   ```text
   github/codeql-action/init@v3
   github/codeql-action/analyze@v3
   Node.js 20 is deprecated
   ```

5. Kiểm tra kết quả trong **Repository → Security → Code scanning**.

CodeQL v4 là nhánh được GitHub khuyến nghị thay thế v3 trước thời điểm v3 bị deprecate vào tháng 12/2026. `checkout`, `setup-node` và `upload-artifact` trong repository đã ở v7; project runtime dùng Node.js 24.
