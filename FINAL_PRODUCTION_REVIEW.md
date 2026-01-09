# 최종 확정 산출물 검토 결과

## 📋 검토 목표
GPT가 제시한 최종 확정 산출물(Final Production Version)의 적절성 검토 및 현재 문서와의 일치성 확인

---

## 🔍 주요 변경사항 검토

### 1. SSOT 선언부 추가 ✅ **적절함**

**GPT 제안**:
- 두 문서 모두 맨 앞에 SSOT 선언 추가
- 4줄 핵심 규칙 + 5줄 전역 정합성 규칙

**검토 결과**: ✅ **적절함**
- 현재 문서에 SSOT 선언이 없어서 추가 필요
- 규칙들이 논리적으로 일관됨
- 특히 "활성화 가능 여부 판정"에 주문 귀속 검증 포함이 적절함

---

### 2. order_item_units 유니크 제약 변경 ⚠️ **부분 수정 필요**

**GPT 제안**:
```sql
UNIQUE(stock_unit_id, active_lock)
active_lock = CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered', 'partial_shipped', 'partial_delivered', 'exchange_pending') THEN 1 ELSE NULL END
```

**현재 문서 상태**:
- `IMPLEMENTATION_PLAN_FINAL.md` 292줄: `ENUM('reserved', 'shipped', 'delivered', 'refunded')`
- `UNIQUE(order_item_id, unit_seq)`만 있음

**문제점 발견**:

1. **상태 집합 불일치** ⚠️
   - GPT 제안: `partial_shipped`, `partial_delivered`, `exchange_pending` 포함
   - 현재 문서: 이 상태들이 ENUM에 없음
   - **해결**: ENUM 정의를 확장하거나, active_lock 정의를 현재 ENUM에 맞춰야 함

2. **refunded 처리** ⚠️
   - GPT 제안: active_lock 정의에 `refunded` 언급 없음
   - 논리적으로: `refunded`는 active가 아니므로 NULL이어야 함
   - **해결**: active_lock 정의에 `refunded`는 명시적으로 제외해야 함

3. **재판매 가능성** ✅
   - GPT 제안: `refunded` 상태는 active_lock에서 NULL이므로, 재판매 시 같은 stock_unit_id 재사용 가능
   - 이는 재판매 설계와 일치함

**수정 제안**:

```sql
-- active_lock 정의 (현재 ENUM 기준)
active_lock INT GENERATED ALWAYS AS (
  CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered') THEN 1 ELSE NULL END
) VIRTUAL;

-- 또는 ENUM 확장 후
active_lock INT GENERATED ALWAYS AS (
  CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered', 'partial_shipped', 'partial_delivered', 'exchange_pending') THEN 1 ELSE NULL END
) VIRTUAL;
```

**결론**: ✅ **개념은 적절하나, ENUM 정의와 동기화 필요**

---

### 3. 토큰 체계 (Landing → Cookie → Redirect) ✅ **적절함**

**GPT 제안**:
- 이메일 링크 최초 유입 시 URL Query 포함 허용
- 서버는 토큰 검증 즉시 httpOnly Cookie로 굽고, 토큰이 제거된 깨끗한 URL로 302 Redirect

**검토 결과**: ✅ **적절함**

**이유**:
1. **현실적**: 이메일 링크는 URL에 토큰이 포함될 수밖에 없음
2. **보안**: 즉시 Cookie로 변환하고 URL에서 제거하는 것이 안전
3. **사용자 경험**: Redirect 후 깨끗한 URL로 유지

**구현 예시**:
```javascript
// GET /api/guest/orders/:orderId?token=xxx
router.get('/guest/orders/:orderId', async (req, res) => {
  const { token } = req.query;
  const { orderId } = req.params;
  
  // 1. 토큰 검증
  const [tokens] = await connection.execute(
    'SELECT * FROM guest_order_access_tokens WHERE token = ? AND order_id = ? AND revoked_at IS NULL AND expires_at > NOW()',
    [token, orderId]
  );
  
  if (tokens.length === 0) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  // 2. httpOnly Cookie로 설정
  res.cookie('guest_order_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 90 * 24 * 60 * 60 * 1000 // 90일
  });
  
  // 3. 토큰 제거된 깨끗한 URL로 Redirect
  res.redirect(302, `/guest/orders/${orderId}`);
});
```

**결론**: ✅ **GPT 제안 채택 권장**

---

### 4. claim_token 3-Factor Atomic Check ✅ **적절함**

**GPT 제안**:
```sql
UPDATE claim_tokens
SET used_at = NOW()
WHERE token = ?
  AND order_id = ?        -- 바인딩 확인
  AND used_at IS NULL     -- 1회성 확인
  AND expires_at > NOW(); -- 만료 확인
```

**검토 결과**: ✅ **적절함**

**이유**:
1. **원자성**: 하나의 UPDATE문으로 3가지 조건 모두 검증
2. **안전성**: `affectedRows=1` 확인으로 재사용 방지
3. **명확성**: 조건이 명시적이고 이해하기 쉬움

**구현 예시**:
```javascript
// POST /api/orders/:orderId/claim
router.post('/orders/:orderId/claim', authenticateToken, async (req, res) => {
  const { orderId } = req.params;
  const { claim_token } = req.body;
  const userId = req.user.userId;
  
  await connection.beginTransaction();
  try {
    // 3-Factor Atomic Check
    const [result] = await connection.execute(
      `UPDATE claim_tokens
       SET used_at = NOW()
       WHERE token = ?
         AND order_id = ?
         AND used_at IS NULL
         AND expires_at > NOW()`,
      [claim_token, orderId]
    );
    
    if (result.affectedRows !== 1) {
      throw new Error('Invalid or already used claim token');
    }
    
    // Claim 처리 계속...
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
});
```

**결론**: ✅ **GPT 제안 채택 권장**

---

### 5. stock_units.status = 'in_stock' 게이트키퍼 ✅ **적절함**

**GPT 제안**:
- 재판매 가능 여부의 최종 게이트는 `stock_units.status = 'in_stock'`
- Paid 트랜잭션은 오직 이 조건만 본다

**검토 결과**: ✅ **적절함**

**이유**:
1. **명확한 책임 경계**: 재고 상태가 재판매 가능 여부의 유일한 기준
2. **단순성**: 복잡한 조건 없이 단일 상태만 확인
3. **일관성**: 환불 처리 시 `in_stock` 복귀와 일치

**결론**: ✅ **GPT 제안 채택 권장**

---

## ⚠️ 발견된 문제점 및 수정 필요 사항

### 1. active_lock 상태 집합 불일치

**문제**: GPT 제안의 active_lock 정의에 포함된 상태들이 현재 ENUM 정의와 일치하지 않음

**현재 ENUM** (`IMPLEMENTATION_PLAN_FINAL.md` 292줄):
```sql
ENUM('reserved', 'shipped', 'delivered', 'refunded')
```

**GPT 제안 active_lock**:
```sql
CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered', 'partial_shipped', 'partial_delivered', 'exchange_pending') THEN 1 ELSE NULL END
```

**해결 방안**:

**옵션 A: ENUM 확장 (권장)**
```sql
-- order_item_units 테이블 생성 시
unit_status ENUM('reserved', 'shipped', 'delivered', 'partial_shipped', 'partial_delivered', 'exchange_pending', 'refunded') NOT NULL DEFAULT 'reserved'

-- active_lock 정의
active_lock INT GENERATED ALWAYS AS (
  CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered', 'partial_shipped', 'partial_delivered', 'exchange_pending') THEN 1 ELSE NULL END
) VIRTUAL;
```

**옵션 B: 현재 ENUM 기준으로 active_lock 정의**
```sql
-- active_lock 정의 (현재 ENUM 기준)
active_lock INT GENERATED ALWAYS AS (
  CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered') THEN 1 ELSE NULL END
) VIRTUAL;
```

**권장**: 옵션 A (ENUM 확장) - 향후 확장성 고려

---

### 2. active_lock 정의 동기화 규칙

**GPT 제안**: "실제 ENUM에 존재하는 상태만 정의에 포함. 상태 추가 시 정의 갱신 필수"

**검토 결과**: ✅ **적절함**

**추가 제안**: 문서에 명시적으로 규칙 추가
```markdown
**active_lock 동기화 규칙**:
- active_lock 정의는 반드시 실제 `unit_status` ENUM과 일치해야 함
- 새로운 상태가 ENUM에 추가되면, active_lock 정의도 함께 갱신해야 함
- active 상태 집합: `reserved`, `shipped`, `delivered`, `partial_shipped`, `partial_delivered`, `exchange_pending`
- inactive 상태 집합: `refunded` (재판매 가능)
```

---

### 3. UNIQUE 제약 명시

**GPT 제안**: `UNIQUE(stock_unit_id, active_lock)`

**검토 결과**: ✅ **개념 적절함**

**주의사항**:
- MySQL에서 GENERATED COLUMN에 UNIQUE 인덱스 생성 가능
- NULL 값은 UNIQUE 인덱스에서 여러 개 허용 (이것이 핵심!)
- `refunded` 상태는 active_lock이 NULL이므로, 재판매 시 같은 stock_unit_id 재사용 가능

**구현 예시**:
```sql
CREATE TABLE order_item_units (
    order_item_unit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_item_id INT NOT NULL,
    unit_seq INT NOT NULL,
    stock_unit_id BIGINT NULL,
    token_pk INT NOT NULL,
    unit_status ENUM('reserved', 'shipped', 'delivered', 'partial_shipped', 'partial_delivered', 'exchange_pending', 'refunded') NOT NULL DEFAULT 'reserved',
    active_lock INT GENERATED ALWAYS AS (
        CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered', 'partial_shipped', 'partial_delivered', 'exchange_pending') THEN 1 ELSE NULL END
    ) VIRTUAL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE RESTRICT,
    FOREIGN KEY (stock_unit_id) REFERENCES stock_units(stock_unit_id) ON DELETE SET NULL,
    FOREIGN KEY (token_pk) REFERENCES token_master(token_pk) ON DELETE RESTRICT,
    UNIQUE KEY uk_order_item_unit_seq (order_item_id, unit_seq),
    UNIQUE KEY uk_stock_unit_active (stock_unit_id, active_lock),  -- ✅ 추가
    INDEX idx_order_item_id (order_item_id),
    INDEX idx_stock_unit_id (stock_unit_id),
    INDEX idx_token_pk (token_pk),
    INDEX idx_unit_status (unit_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## ✅ 최종 검토 결론

### 채택 권장 사항

1. **SSOT 선언부 추가** ✅
2. **토큰 체계 (Landing → Cookie → Redirect)** ✅
3. **claim_token 3-Factor Atomic Check** ✅
4. **stock_units.status = 'in_stock' 게이트키퍼** ✅
5. **active_lock 패턴** ✅ (단, ENUM 동기화 필요)

### 수정 필요 사항

1. **ENUM 확장**: `unit_status`에 `partial_shipped`, `partial_delivered`, `exchange_pending` 추가
2. **active_lock 정의**: ENUM과 일치하도록 명시
3. **동기화 규칙**: 문서에 명시적으로 추가

---

## 📝 문서 반영 체크리스트

### SYSTEM_FLOW_DETAILED.md 수정 사항

- [ ] 맨 앞에 SSOT 선언부 추가
- [ ] 3-1 섹션: 토큰 체계 (Landing → Cookie → Redirect) 명시
- [ ] 3-2 섹션: claim_token 3-Factor Atomic Check 명시
- [ ] 2-1 섹션: 락 순서 수정 (stock_units → orders → warranties → invoices)
- [ ] 6-2 섹션: stock_units.status = 'in_stock' 게이트키퍼 명시
- [ ] 7-1 섹션: active_lock 활용 명시

### FINAL_EXECUTION_SPEC_REVIEW.md 수정 사항

- [ ] 맨 앞에 SSOT 선언부 추가
- [ ] 토큰 체계 표 추가 (Landing → Cookie → Redirect)
- [ ] order_item_units 유니크 제약 수정 (`UNIQUE(stock_unit_id, active_lock)`)
- [ ] active_lock 정의 및 동기화 규칙 명시
- [ ] ENUM 확장 (`partial_shipped`, `partial_delivered`, `exchange_pending`)

### IMPLEMENTATION_PLAN_FINAL.md 수정 사항

- [ ] order_item_units 테이블 생성 시 ENUM 확장
- [ ] active_lock generated column 추가
- [ ] UNIQUE(stock_unit_id, active_lock) 제약 추가

---

## 💬 다음 단계

이 검토 결과를 바탕으로 문서 수정을 진행할까요?

"문서 수정 진행" (권장 ✅)
- SSOT 선언부 추가
- 토큰 체계 명시
- active_lock 패턴 반영 (ENUM 동기화 포함)

"추가 검토"
- 특정 부분 더 검토
