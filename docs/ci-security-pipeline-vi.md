# CI/CD security gate

Repository có một pipeline dùng chung để chặn build/release khi security TDD hoặc regression thất bại.

## Chạy local

```bash
npm run ci:security
```

Pipeline chạy tuần tự:

1. `npm run build`
2. `npm run verify`
3. `npm test`
4. `npm run test:mailer`
5. `npm run test:db:config`
6. Audit F-2 đến F-10
7. `npm run test:api`
8. `npm run test:api:integration`

GitHub Actions workflow là [`.github/workflows/security-gate.yml`](../.github/workflows/security-gate.yml). Workflow chạy khi push/PR vào `main`, có `workflow_dispatch`, và hỗ trợ `workflow_call` để workflow release gọi làm gate bắt buộc.

## Release gate

Workflow release phải gọi `Security TDD Gate` trước khi build hoặc upload artifact. Các job build/release dùng `needs` tới gate; nếu bất kỳ test hoặc audit nào fail thì artifact release không được tạo.

Pipeline cũng chạy:

- `npm audit --omit=dev --audit-level=high`
- Kiểm tra không có `.env`, keystore, certificate hoặc private key được track trong Git.

## Environment

Security gate không cần production secret. Các test dùng fixture an toàn và adapter MongoDB fail-closed khi thiếu runtime credentials. Public build variables chỉ được cấp ở workflow build/release cần tạo `dist`; không đưa server secrets vào `.env.local` của client.
