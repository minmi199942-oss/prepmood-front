# 비회원 토큰 체계 검토 결과

## 📋 검토 목표
GPT의 제안(guest_order_access_token 만료 정책, claim_token 발급 시점)이 우리 구현 흐름과 적절한지 검토

---

## 🔍 현재 문서 상태 확인

### 1. guest_order_access_token 만료 정책

**현재 문서 (`SYSTEM_FLOW_DETAILED.md` 78줄)**:
```markdown
- 주문 완료 시 `guest_order_access_token` 발급 (90일 유효)
```

**현재 문서 (`SYSTEM_FLOW_DETAILED.md` 273줄)**:
```markdown
- `guest_order_access_token` 회수 (revoked_at 설정)
```

**현재 문서 (`FINAL_EXECUTION_SPEC_REVIEW.md` 1223줄)**:
```javascript
expires_in: 90 * 24 * 60 * 60 * 1000, // 90일
revoke_on_claim: true // claim 시 자동 회수
```

**결론**: ✅ **현재 문서는 이미 GPT 제안과 일치**
- 90일 만료 정책 있음
- Claim 완료 시 revoke 정책 있음

---

### 2. claim_token 발급 시점

**현재 문서 (`SYSTEM_FLOW_DETAILED.md` 264-267줄)**:
```markdown
3. 비회원이면 "내 계정에 연동하기" 버튼 표시
4. 사용자가 "내 계정에 연동하기" 버튼 클릭
5. 로그인/회원가입 요구
6. 로그인 후 claim 처리 (`POST /api/orders/:orderId/claim`)
```

**문제 발견**: ⚠️ **일부 문서에서 혼용 발견**

**`COMPREHENSIVE_SPEC_ANALYSIS.md` 173-178줄**:
```javascript
// claim_token 생성
const claimToken = generateRandomToken();
await connection.execute(
  'INSERT INTO claim_tokens (order_id, token, expires_at) VALUES (?, ?, ?)',
  [orderId, claimToken, new Date(Date.now() + 15 * 60 * 1000)] // 15분
);
```
→ **주문 생성 시 미리 발급** (B안과 충돌!)

**`DETAILED_SPEC_COMPARISON.md` 676-681줄**:
```javascript
// claim_token 생성
const claimToken = generateRandomToken();
await connection.execute(
  'INSERT INTO claim_tokens (order_id, token, expires_at) VALUES (?, ?, ?)',
  [orderId, claimToken, new Date(Date.now() + 15 * 60 * 1000)] // 15분
);
```
→ **주문 생성 시 미리 발급** (B안과 충돌!)

**결론**: ⚠️ **문서 간 불일치 존재**
- `SYSTEM_FLOW_DETAILED.md`: 로그인 후 claim 처리 (B안과 일치)
- 일부 분석 문서: 주문 생성 시 미리 발급 (B안과 충돌)

---

## ✅ GPT 제안 검토 결과

### 1. guest_order_access_token 90일 제한

**GPT 제안**: "90일 고정 필요 없지만, 만료는 필요. Claim 완료 시 revoke"

**검토 결과**: ✅ **적절함**

**이유**:
1. **현재 문서와 일치**: 이미 90일 정책이 있음
2. **운영상 합리적**: 무제한은 보안/CS 관점에서 위험
3. **Claim 완료 시 revoke**: 이미 문서에 명시됨 (273줄)

**추가 제안 (GPT의 "하이브리드" 방식)**:
- Claim 완료 후 조회는 로그인 기반으로 전환
- guest 토큰은 자동 revoke
- 이렇게 하면 "비회원인 동안만 이메일 링크가 의미가 있고, 회원이 되면 계정으로 흡수"

**결론**: ✅ **GPT 제안 채택 권장**
- 90일 정책 유지 (또는 90~180일 범위로 유연하게)
- Claim 완료 시 revoke 명시
- Claim 완료 후 조회는 로그인 기반으로 전환 명시

---

### 2. claim_token 발급 시점

**GPT 제안**: "버튼 클릭 → 로그인 요구 → 로그인 성공 후 claim_token 발급"

**검토 결과**: ✅ **적절함 (단, 문서 정리 필요)**

**이유**:
1. **B안의 핵심**: claim_token은 "로그인한 user_id에 바인딩"되어야 함
2. **보안상 필수**: 로그인 없이 claim_token 발급하면 user_id 바인딩 불가
3. **현재 흐름과 일치**: `SYSTEM_FLOW_DETAILED.md`는 이미 이 흐름

**문제점**:
- 일부 문서에서 "주문 생성 시 미리 발급"으로 혼용
- 이는 B안과 정면 충돌

**수정 필요**:
```markdown
기존(혼선): "주문 생성 시 claim_token 미리 발급"
수정(명확): "버튼 클릭 시 로그인 플로우를 시작하고, 로그인 성공 후 claim_token 발급"
```

**구체적 플로우 (GPT 제안)**:
1. 사용자가 이메일의 주문 조회 링크로 들어옴 (guest_order_access_token으로 조회 OK)
2. 화면에 "내 계정에 연동하기" 버튼 표시
3. 버튼 클릭
4. 로그인 안 돼 있으면 로그인 페이지로 보냄 (redirect)
   - 이때 guest_order_access_token은 서버 세션/임시 저장/또는 return_url에 안전하게 전달
5. 로그인 성공 후, 서버가 claim_token을 발급 (이때 user_id가 확정되니까 바인딩 가능)
6. 클라이언트가 claim_token으로 Claim API 호출
7. 성공하면 guest_order_access_token은 revoke

**결론**: ✅ **GPT 제안 채택 권장**
- claim_token은 로그인 성공 후에만 발급
- 주문 생성 시 미리 발급하는 문서는 삭제/수정 필요

---

## 🎯 최종 정합성 고정 문구

### 1. guest_order_access_token 정책

```markdown
**guest_order_access_token**:
- 비회원 조회 전용 링크 토큰
- 만료: 90일 (또는 90~180일 범위, 정책 선택)
- Claim 완료 시 revoke (자동 회수)
- Claim 완료 후 조회는 로그인 기반으로 전환 (guest 토큰 불필요)
```

### 2. claim_token 정책

```markdown
**claim_token**:
- 연동(Claim) 전용 토큰
- 로그인한 user_id + order_id에 바인딩
- 발급 시점: "연동하기 버튼 클릭 → 로그인 성공 이후"
- 만료: 10~30분 (짧게 유지)
- Claim API는 claim_token만 허용 (guest_order_access_token으로 claim 금지)
```

### 3. Claim 플로우 (명확한 순서)

```markdown
**Claim 플로우**:
1. 사용자가 이메일의 주문 조회 링크로 들어옴 (guest_order_access_token으로 조회)
2. 화면에 "내 계정에 연동하기" 버튼 표시
3. 버튼 클릭
4. 로그인 안 돼 있으면 로그인 페이지로 redirect
   - guest_order_access_token은 서버 세션/임시 저장/또는 return_url에 안전하게 전달
5. 로그인 성공 후, 서버가 claim_token 발급 (user_id 확정 후 바인딩)
6. 클라이언트가 claim_token으로 Claim API 호출 (`POST /api/orders/:orderId/claim`)
7. 성공하면 guest_order_access_token은 revoke
```

---

## 📝 문서 수정 체크리스트

### SYSTEM_FLOW_DETAILED.md 수정 사항

- [x] 78줄: guest_order_access_token 90일 정책 유지 (이미 있음)
- [x] 273줄: Claim 완료 시 revoke 명시 (이미 있음)
- [ ] 264-267줄: Claim 플로우를 더 명확하게 수정
  - "버튼 클릭 → 로그인 요구 → 로그인 성공 후 claim_token 발급" 명시
- [ ] 3-1 섹션: 인보이스 링크에는 guest_order_access_token만 포함 명시
- [ ] 3-2 섹션: claim_token 발급 시점 명확히 명시

### FINAL_EXECUTION_SPEC_REVIEW.md 수정 사항

- [x] 1223줄: guest_order_access_token 정책 (이미 있음)
- [ ] claim_token 발급 시점 명시
- [ ] Claim API는 claim_token만 허용 명시

### 기타 문서 수정 사항

- [ ] `COMPREHENSIVE_SPEC_ANALYSIS.md`: 주문 생성 시 claim_token 미리 발급 삭제
- [ ] `DETAILED_SPEC_COMPARISON.md`: 주문 생성 시 claim_token 미리 발급 삭제

---

## ✅ 최종 결론

### GPT 제안 채택 권장 사항

1. **guest_order_access_token**:
   - ✅ 90일 정책 유지 (또는 90~180일 범위)
   - ✅ Claim 완료 시 revoke
   - ✅ Claim 완료 후 조회는 로그인 기반으로 전환

2. **claim_token**:
   - ✅ 로그인 성공 후에만 발급
   - ✅ user_id + order_id 바인딩 필수
   - ✅ Claim API는 claim_token만 허용

3. **Claim 플로우**:
   - ✅ 버튼 클릭 → 로그인 요구 → 로그인 성공 후 claim_token 발급
   - ✅ 주문 생성 시 미리 발급하지 않음

### 수정 필요 사항

1. **문서 정리**: 일부 문서에서 "주문 생성 시 claim_token 미리 발급" 삭제
2. **플로우 명확화**: Claim 플로우를 단계별로 명확히 명시
3. **API 명세**: claim_token 발급 API (`POST /api/orders/:orderId/claim-token`) 명시

---

## 💬 다음 단계

이 검토 결과를 바탕으로 문서 수정을 진행할까요?

"문서 수정 진행" (권장 ✅)
- SYSTEM_FLOW_DETAILED.md 수정
- FINAL_EXECUTION_SPEC_REVIEW.md 수정
- 기타 문서 정리

"추가 검토"
- 특정 부분 더 검토
