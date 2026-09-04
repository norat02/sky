# Giải thích Idempotency và Transactional Outbox trong Sky Bird v2

## 1. Bối cảnh của bài toán

Endpoint `POST /api/runs/:runId/score` nhận kết quả sau khi người chơi kết thúc một ván. Đây là endpoint có side effect: nó đổi trạng thái game run, ghi một dòng vào bảng `scores`, tạo event cho message queue và có thể được client gọi lại sau timeout mạng.

Nếu request đầu tiên đã commit ở server nhưng response bị mất trên đường truyền, client không biết điểm đã được ghi hay chưa. Client thường retry. Nếu server xử lý retry như request mới, cùng một ván có thể tạo nhiều score, nhiều event và leaderboard bị sai. **Idempotency** giải quyết việc retry an toàn; **Transactional Outbox** giải quyết việc ghi dữ liệu nghiệp vụ và phát event không bị lệch nhau.

## 2. Idempotency hoạt động thế nào

Client phải gửi header:

```http
Idempotency-Key: run-score-001
```

Key này là định danh của một ý định nghiệp vụ, ở đây là ý định submit điểm. Trong source code, endpoint bắt buộc key ở `server/app.mjs:71-73`:

```js
const key = req.get('Idempotency-Key');
if (!key || key.length > 128) {
  return res.status(400).json({ error: 'idempotency_key_required' });
}
```

Key được giới hạn độ dài để tránh lạm dụng bộ nhớ/database. Key **không được dùng một mình**; nó được gắn với user hiện tại bằng primary key `(user_id, key)` trong migration:

```sql
CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
```

Cách gắn với user ngăn user A đoán được key của user B rồi lấy lại response của user B. Hai user có thể dùng cùng chuỗi key nhưng không đụng nhau.

### 2.1 Request hash

API validate payload trước, sau đó tạo SHA-256 hash:

```js
const input = scoreSchema.parse({ ...req.body, runId: req.params.runId });
const requestHash = crypto
  .createHash('sha256')
  .update(JSON.stringify(input))
  .digest('hex');
```

Hash ràng buộc key với nội dung request. Vì vậy, cùng `Idempotency-Key: run-score-001` chỉ hợp lệ khi gửi lại đúng `runId`, `playerName` và `score` ban đầu.

### 2.2 Đọc và khóa bản ghi idempotency

Toàn bộ phần submit nằm trong `withTransaction()` tại `server/db.mjs`. Query đầu tiên là:

```sql
SELECT request_hash, status_code, response
FROM idempotency_keys
WHERE user_id = $1 AND key = $2
FOR UPDATE
```

`FOR UPDATE` khóa hàng idempotency trong transaction hiện tại. Nếu hai request đồng thời cùng user và cùng key đến hai API instance khác nhau, một request được quyền xử lý trước; request còn lại phải chờ khóa được nhả.

Sau khi khóa, source code có ba trường hợp:

| Tình huống | Kết quả |
|---|---|
| Key chưa tồn tại | Insert bản ghi idempotency đang xử lý rồi tiếp tục submit |
| Key đã tồn tại và hash giống | Trả lại `status_code` và `response` đã lưu, không ghi score lần hai |
| Key đã tồn tại nhưng hash khác | Trả `409 idempotency_key_reused`, vì một key không được dùng cho hai payload |

Đoạn xử lý tương ứng ở `server/app.mjs:78-83`:

```js
if (existing.rows[0]) {
  if (existing.rows[0].request_hash !== requestHash) {
    const error = new Error('idempotency_key_reused');
    error.status = 409;
    throw error;
  }
  return {
    replay: true,
    statusCode: existing.rows[0].status_code,
    response: existing.rows[0].response
  };
}

await client.query(
  'INSERT INTO idempotency_keys(user_id, key, request_hash) VALUES ($1, $2, $3)',
  [req.user.sub, key, requestHash]
);
```

### 2.3 Vì sao phải insert idempotency record trong cùng transaction

Record idempotency được insert trước khi đổi trạng thái run. Nếu submit thất bại và transaction rollback, record idempotency cũng rollback. Client có thể retry cùng key và server sẽ xử lý lại từ đầu.

Nếu score, idempotency record và trạng thái run được ghi bằng các transaction riêng, có thể xảy ra trạng thái nguy hiểm: idempotency record đã tồn tại nhưng score chưa được ghi do lỗi ở bước sau. Khi đó retry có thể bị trả response cũ không tồn tại hoặc bị chặn nhầm. Đặt tất cả vào một transaction giúp trạng thái thành công hoặc thất bại theo nguyên tắc **all-or-nothing**.

### 2.4 Lưu response và replay

Khi mọi thao tác thành công, server tạo response rồi lưu vào `idempotency_keys.response`:

```js
const response = { accepted: true, runId: input.runId, score: input.score };
await client.query(
  'UPDATE idempotency_keys SET status_code = 201, response = $1 WHERE user_id = $2 AND key = $3',
  [JSON.stringify(response), req.user.sub, key]
);
```

Sau đó response HTTP có thêm cờ:

```js
res.status(result.statusCode).json({
  ...result.response,
  idempotentReplay: result.replay
});
```

Request đầu tiên trả `idempotentReplay: false`. Retry cùng key và payload trả `idempotentReplay: true`, nhưng không insert thêm vào `scores`.

## 3. Transaction và concurrency control

Sau khi tạo idempotency record, API khóa game run thuộc đúng user:

```sql
SELECT id, status, version
FROM game_runs
WHERE id = $1 AND user_id = $2
FOR UPDATE
```

Điều kiện `user_id = $2` rất quan trọng: người chơi không thể submit vào run của user khác chỉ bằng cách đoán UUID. Điều kiện `status = 'started'` được kiểm tra trong JavaScript để ngăn submit lại một run đã `submitted`.

Tiếp theo API dùng optimistic version:

```sql
UPDATE game_runs
SET status = 'submitted',
    score = $1,
    version = version + 1,
    submitted_at = now()
WHERE id = $2 AND version = $3
RETURNING id
```

`version` ban đầu là `0`. Request hợp lệ đổi từ `0` sang `1`. Nếu một request khác đã đổi version trước đó, điều kiện `WHERE version = $3` không còn đúng và `rowCount` khác `1`; server trả lỗi `concurrent_run_update`.

Trong source hiện tại vừa có `FOR UPDATE` vừa có version check. `FOR UPDATE` xử lý tranh chấp tại database trong cùng run; version check là lớp bảo vệ bổ sung, hữu ích khi logic được mở rộng hoặc khi có các đường cập nhật khác.

## 4. Transactional Outbox Pattern hoạt động thế nào

Sau khi update `game_runs`, API ghi `scores` và ghi event vào `outbox_events` **trong cùng transaction**:

```js
await client.query(
  'INSERT INTO scores(run_id, user_id, player_name, score) VALUES ($1, $2, $3, $4)',
  [input.runId, req.user.sub, input.playerName, input.score]
);

await client.query(
  'INSERT INTO outbox_events(event_type, aggregate_id, payload) VALUES ($1, $2, $3)',
  [
    'score.submitted',
    input.runId,
    JSON.stringify({ runId: input.runId, userId: req.user.sub, score: input.score })
  ]
);
```

Bảng outbox có trạng thái `published_at`:

```sql
CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbox_pending_idx
  ON outbox_events(created_at)
  WHERE published_at IS NULL;
```

Nếu transaction submit rollback, `game_runs`, `scores`, `idempotency_keys` và `outbox_events` đều không tồn tại sau rollback. Nếu transaction commit, event chắc chắn nằm trong PostgreSQL ngay cả khi RabbitMQ đang tạm thời ngừng hoạt động. Đây là điểm cốt lõi: database là nguồn sự thật bền vững; queue chỉ là kênh phân phối bất đồng bộ.

## 5. Worker đọc outbox và publish RabbitMQ

`server/queue.mjs` mở một transaction riêng và lấy các event chưa publish:

```sql
SELECT id, event_type, payload
FROM outbox_events
WHERE published_at IS NULL
ORDER BY id
FOR UPDATE SKIP LOCKED
LIMIT $1
```

`FOR UPDATE SKIP LOCKED` có hai tác dụng. `FOR UPDATE` bảo vệ các event đang được worker xử lý; `SKIP LOCKED` cho phép worker khác bỏ qua những event đã bị worker thứ nhất khóa và lấy event khác. Nhờ đó nhiều worker có thể chạy song song mà ít chờ nhau.

Worker publish event tới durable RabbitMQ topic exchange:

```js
await channel.assertExchange('sky.events', 'topic', { durable: true });
channel.publish(
  'sky.events',
  eventType,
  Buffer.from(JSON.stringify(payload)),
  { persistent: true, contentType: 'application/json' }
);
```

Chỉ khi `publishEvent()` trả thành công, worker mới đánh dấu:

```sql
UPDATE outbox_events
SET published_at = now()
WHERE id = $1
```

Nếu RabbitMQ không có hoặc publish thất bại, worker không đánh dấu `published_at`; event vẫn là pending và sẽ được thử lại ở vòng tiếp theo. `server/index.mjs` gọi flush mỗi 2 giây, còn `server/worker.mjs` gọi mỗi 1 giây.

## 6. Luồng hoàn chỉnh

```text
Client
  |
  | POST /api/runs/:runId/score
  | Authorization: Bearer JWT
  | Idempotency-Key: run-score-001
  v
API instance qua Nginx
  |
  | Validate payload + tạo request hash
  v
BEGIN transaction
  |
  | Lock idempotency key
  | Nếu replay: lấy response cũ và kết thúc
  | Nếu key mới: insert idempotency record
  | Lock game_run của đúng user
  | Kiểm tra status = started
  | Update status/score/version
  | Insert scores
  | Insert outbox_events
  | Lưu response idempotency
  v
COMMIT transaction
  |
  | HTTP 201 accepted
  v
Outbox worker
  |
  | SELECT pending FOR UPDATE SKIP LOCKED
  | Publish score.submitted tới RabbitMQ
  | UPDATE published_at
  v
Consumer downstream
  |
  | Xử lý analytics, achievement, notification...
```

## 7. Tình huống lỗi quan trọng

| Sự cố | Hành vi của hệ thống |
|---|---|
| Client timeout sau khi server commit | Client retry cùng key; server replay response, không tạo score thứ hai |
| Client đổi payload nhưng giữ key | Trả `409 idempotency_key_reused` |
| Hai request cùng key đồng thời | Một request giữ row lock; request còn lại chờ rồi replay hoặc nhận lỗi nhất quán |
| Hai request submit cùng run nhưng khác key | Row lock, status và version ngăn submit lần hai |
| PostgreSQL lỗi giữa các bước | Transaction rollback toàn bộ nghiệp vụ và outbox event |
| RabbitMQ tạm tắt sau khi database commit | Outbox vẫn pending; worker retry sau |
| API instance chết trước khi commit | Transaction bị rollback khi connection đóng; client retry an toàn |
| Worker chết sau khi publish nhưng trước khi đánh dấu | Event có thể được publish lại; consumer phải idempotent theo `event_id`/aggregate ID |

## 8. Giới hạn và khuyến nghị production

Source hiện tại thực hiện mô hình **at-least-once delivery** cho outbox. Có một cửa sổ nhỏ: RabbitMQ có thể nhận event nhưng worker chết trước khi `published_at` commit. Khi worker chạy lại, event có thể được gửi lần hai. Đây là đặc tính bình thường của outbox; consumer không nên giả định exactly-once. Consumer nên lưu `event_id` hoặc dùng khóa nghiệp vụ duy nhất để xử lý lặp an toàn.

Trong phiên bản production tiếp theo nên truyền cả `outbox_events.id` làm `eventId` trong payload/envelope, dùng publisher confirms của RabbitMQ, thêm retry backoff và dead-letter queue. Nên có job dọn `idempotency_keys` cũ theo retention policy, nhưng chỉ sau khoảng thời gian lớn hơn thời gian retry tối đa của client.

Ngoài ra, nên tách rõ API process và worker process. `server/index.mjs` hiện cũng flush outbox để local stack vẫn hoạt động khi chỉ chạy API; production nên để worker chuyên trách xử lý queue và để API tập trung vào request latency.
