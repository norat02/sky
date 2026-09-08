# Audit Supabase RLS cho `scores` và leaderboard

## Kết luận cấu hình hiện tại

`public.scores` và `public.score_runs` đã bật Row Level Security. Roles `anon` và `authenticated` bị revoke toàn bộ quyền trực tiếp. Vì vậy client web, Android, iOS và Electron không thể đọc/ghi bảng trực tiếp bằng Supabase publishable/anon key.

Leaderboard công khai đi qua `GET /api/leaderboard`. API dùng `SUPABASE_SERVICE_ROLE_KEY` ở server-side, chỉ trả về `player_name`, `score` và `created_at`. Service-role key không được đưa vào bundle client.

## Kiểm tra RLS bật

Chạy trong Supabase SQL Editor:

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('scores', 'score_runs');
```

Kết quả bắt buộc:

```text
scores     | true
score_runs | true
```

## Kiểm tra quyền table

```sql
select
  grantee,
  table_schema,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('scores', 'score_runs')
order by table_name, grantee, privilege_type;
```

Không được có quyền `SELECT`, `INSERT`, `UPDATE`, `DELETE` cho:

```text
anon
authenticated
```

`service_role` không nhất thiết xuất hiện trong `information_schema.role_table_grants` vì Supabase service role bypasses RLS.

## Kiểm tra policy

```sql
select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('scores', 'score_runs');
```

Thiết kế hiện tại cố ý **không có policy client**. Không có policy cộng với revoke privileges là deny-by-default.

Không tự thêm policy kiểu:

```sql
create policy "public can read scores"
```

nếu chưa có quyết định rõ ràng về việc cho client đọc trực tiếp. Leaderboard hiện đi qua API để giới hạn cột, cache, rate limit và tránh expose dữ liệu nội bộ.

## Kiểm tra sequence

Bảng `scores` dùng identity column. Sequence cũng đã revoke khỏi client roles:

```sql
select grantee, privilege_type
from information_schema.role_usage_grants
where object_schema = 'public'
  and object_name = 'scores_id_seq';
```

Không cấp `USAGE` hoặc `SELECT` cho `anon`/`authenticated`.

## Kiểm tra API leaderboard

Endpoint chỉ cho phép GET:

```bash
curl -i https://YOUR_DOMAIN/api/leaderboard
```

Phải trả JSON dạng:

```json
{"rows":[{"name":"...","score":123}]}
```

Các request POST/PUT/PATCH/DELETE phải trả:

```text
405 method_not_allowed
```

API không trả `user_id`, email, token hoặc admin fields.

## Kiểm tra API submit score

Client không được tự chọn `user_id`. Server phải lấy user từ Supabase Bearer token. Mỗi score phải có run ticket hợp lệ:

```text
POST /api/run-ticket  → signed ticket
POST /api/submit-score → verify bearer + ticket + ownership + one-time consume
```

Ticket phải bị consume bằng điều kiện:

```sql
run_id = requested_run_id
and user_id = authenticated_user_id
and submitted_at is null
```

## Secrets cần giữ server-side

Chỉ đặt trong Vercel/server environment:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SCORE_SIGNING_SECRET
ADMIN_EMAILS
ADMIN_USER_IDS
```

Không đặt trong:

```text
.env.local frontend
public/
dist/
APK
AAB
IPA
EXE
GitHub repository
```

## Cảnh báo khi thay đổi schema

Sau khi sửa `supabase/schema.sql`, chạy toàn bộ file trong Supabase SQL Editor. Kiểm tra lại RLS và grants bằng các câu lệnh trên. Không mở quyền `authenticated` chỉ để leaderboard hoạt động; hãy giữ leaderboard qua API.
