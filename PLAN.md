# NewsArticleStudyBot — 구현 플랜

뉴스 기사 본문을 붙여넣으면 문단별로 음성을 스트리밍 재생해주는 따라읽기 서비스.

---

## 확정 사양

| 항목 | 결정 | 비고 |
|------|------|------|
| TTS 모델 | Kokoro-82M | Apache 2.0 라이선스 |
| 추론 디바이스 | CPU | 실측 MPS보다 빠름 (15.2x vs 10.2x 실시간) |
| 기사 입력 | textarea 붙여넣기 | `\n\n` 기준으로 문단 분리 |
| 재생 단위 | 문단별 스트리밍 | 문단 하나씩 `/tts/stream` 요청 |
| 문단 전환 | 자동 연속 재생 | 문단 끝나면 자동으로 다음 문단 |
| 일시정지 | AbortController + AudioContext.close() | 즉시 정지 (예약된 버퍼까지 차단) |
| 하이라이트 | 문단 단위 | 현재 재생 중인 문단 강조 |
| 재생 속도 | 1.0x 고정 | 추후 필요시 추가 가능 |
| 보이스 | 드롭다운 선택 UI | `/voices` API 연동, App 레벨 상태 관리 |
| 프론트엔드 | React (Vite) | GitHub Pages 배포, 커스텀 도메인 `article-bot.matildabc.com` |
| 백엔드 | FastAPI (로컬 실행) | Cloudflare Tunnel (`article.matildabc.com`)로 외부 노출 |
| 접근 보안 | Cloudflare Access | 프론트+백엔드 동일 Application, 이메일 화이트리스트 |

---

## 아키텍처

```
[사용자 브라우저]
      │
      │ HTTPS → Cloudflare Access 이메일 인증
      ▼
[GitHub Pages]               ← article-bot.matildabc.com (Cloudflare Proxied)
      │
      │ POST /tts/stream + credentials: include (Access 쿠키 전달)
      ▼
[Cloudflare Access]          ← 프론트+백엔드 동일 Application으로 쿠키 공유
      │
      │ Cloudflare Tunnel (cloudflared)
      ▼
[내 맥: FastAPI :8000]       ← article.matildabc.com → localhost:8000
```

---

## 도메인 구조

| 서브도메인 | 용도 | DNS |
|-----------|------|-----|
| `article-bot.matildabc.com` | 프론트 (GitHub Pages) | CNAME → `pattern1116.github.io` |
| `article.matildabc.com` | 백엔드 API (Cloudflare Tunnel) | Tunnel 라우트 → `localhost:8000` |

---

## 폴더 구조

```
NewsArticleStudyBot/
├── PLAN.md
├── backend/
│   ├── main.py           # FastAPI 앱
│   ├── requirements.txt
│   └── .venv/
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── components/
    │   │   ├── ArticleInput.jsx    # textarea 입력
    │   │   ├── ParagraphList.jsx   # 문단 목록 + 하이라이트
    │   │   ├── PlayerControls.jsx  # 재생/정지 + 보이스 선택
    │   │   └── FloatingPlayer.jsx  # 재생 중 하단 플로팅 바
    │   └── hooks/
    │       └── useTTS.js           # 스트리밍 재생 로직
    ├── public/
    │   └── CNAME                   # article-bot.matildabc.com
    ├── .env                        # VITE_API_URL=http://localhost:8000
    ├── .env.production             # VITE_API_URL=https://article.matildabc.com
    └── vite.config.js
```

---

## Phase 1 — 백엔드 (FastAPI 스트리밍 API)

**목표:** 문단 텍스트를 받아 WAV 오디오를 청크 스트리밍하는 FastAPI 서버

- ✅ **1-1.** `backend/requirements.txt` 작성 (`fastapi`, `uvicorn`, `kokoro`, `soundfile`, `numpy`)
- ✅ **1-2.** `.venv` 생성 및 의존성 설치 (Python 3.11 필수 — kokoro가 3.9 미지원)
- ✅ **1-3.** `backend/main.py`: 앱 시작 시 Kokoro 파이프라인 1회 로드 (`device='cpu'`, `lifespan` 사용)
- ✅ **1-4.** `GET /voices`: 사용 가능한 보이스 목록 반환
- ✅ **1-5.** `POST /tts/stream`: 텍스트 받아 WAV 헤더 + PCM 청크 스트리밍 (`StreamingResponse`)
  - Kokoro가 numpy가 아닌 PyTorch 텐서를 반환 → `.numpy()` 변환 후 int16 인코딩
- ✅ **1-6.** CORS 미들웨어 설정 (`allow_credentials=True`, 프론트 도메인 명시)
- ✅ **1-7.** `curl`로 스트리밍 응답 검증

**완료 기준:** `curl -X POST /tts/stream` 시 오디오 청크가 실시간으로 내려옴 ✅

---

## Phase 2 — 프론트엔드 (React + Vite)

**목표:** 기사 붙여넣기 → 문단 분리 → 문단별 재생/정지/하이라이트

- ✅ **2-1.** `frontend/` Vite + React 프로젝트 생성
- ✅ **2-2.** `ArticleInput.jsx`: textarea 입력 → `\n\n` 기준 문단 분리
- ✅ **2-3.** `ParagraphList.jsx`: 문단 리스트 렌더링, 현재 재생 문단 하이라이트, 클릭으로 해당 문단 단독 재생
  - 재생 중 다른 문단 클릭 비활성화 (음성 겹침 방지), 재생 중인 문단은 active 스타일 유지
- ✅ **2-4.** `PlayerControls.jsx`: 재생/정지 버튼 + 보이스 드롭다운 (`GET /voices` 호출)
  - 보이스 상태를 App 레벨로 올려 문단 클릭 시에도 선택 음성 반영
- ✅ **2-5.** `useTTS.js`: 핵심 스트리밍 로직
  - `fetch` + `ReadableStream` + Web Audio API로 청크 재생
  - PCM 청크 byte 정렬 처리 (홀수 바이트 캐리로 노이즈 제거)
  - `AbortController` + `AudioContext.close()`로 즉시 정지
  - `credentials: 'include'`로 Cloudflare Access 쿠키 전달
  - 문단 재생 완료 콜백 → 자동으로 다음 문단 트리거
- ✅ **2-6.** 자동 연속 재생: 현재 문단 인덱스 상태 관리, 끝나면 다음 인덱스로
- ✅ **2-7.** `.env` 파일에 `VITE_API_URL=http://localhost:8000`
- ✅ **2-8.** `.env.production`에 `VITE_API_URL=https://article.matildabc.com`
- ✅ **2-9.** UI 디자인: 고정 헤더, 카드 레이아웃, 재생 상태 표시, 마이크 파비콘
- ✅ **2-10.** `FloatingPlayer.jsx`: 재생 중 하단 플로팅 바 (현재 문단 + 즉시 정지 버튼)

**완료 기준:** 로컬에서 문단 클릭 시 ~1초 내 음성 시작, 정지, 자동 연속 재생, 하이라이트 이동 ✅

---

## Phase 3 — 로컬 통합 테스트

**목표:** 프론트 + 백엔드 end-to-end 전체 흐름 확인

- ✅ **3-1.** 백엔드 + 프론트 동시 실행
- ✅ **3-2.** 실제 뉴스 기사 붙여넣고 전체 흐름 테스트
  - 재생/정지/하이라이트/자동연속재생/플로팅바/음성변경 모두 확인
- ✅ **3-3.** 엣지 케이스 확인 완료

**완료 기준:** 기사 전체를 처음부터 끝까지 자동 재생 가능 ✅

---

## Phase 4 — 배포

**목표:** GitHub Pages(프론트) + Cloudflare Tunnel(백엔드)로 이메일 인증 후 접근 가능하게

- ✅ **4-1.** `cloudflared` 설치 → Zero Trust 대시보드에서 터널 생성 (`news-tts`)
  - `cloudflared tunnel login` 방식은 도메인 필요 → 대시보드 방식으로 변경
- ✅ **4-2.** Tunnel 라우트 설정: `article.matildabc.com` → `http://localhost:8000`
- ✅ **4-3.** Cloudflare Access Application 생성
  - `article-bot.matildabc.com` (프론트) + `article.matildabc.com` (백엔드) 동일 Application
  - 허용 이메일 등록
- ✅ **4-4.** `gh-pages` 패키지로 배포 스크립트 구성 (`npm run deploy`)
- ✅ **4-5.** GitHub Pages 커스텀 도메인 설정 (`article-bot.matildabc.com`)
- ✅ **4-6.** `public/CNAME` 파일 추가, `dist/` 배포 완료
- ✅ **4-7.** `article-bot` DNS 레코드 처리
  - DNS only(회색)로 GitHub DNS 검증 + HTTPS 인증서 발급 대기
  - 완료 후 Proxied(주황색)로 변경 → Cloudflare Access 활성화
- ✅ **4-8.** CORS 이슈 해결
  - 배포 후 `POST /tts/stream` 호출 시 OPTIONS 프리플라이트가 Cloudflare Access에 막히는 문제 발생
  - Cloudflare Access Application CORS Headers 설정으로 해결
    - Allow-Origin: `https://article-bot.matildabc.com`, Methods: GET/POST, Headers: Content-Type, Credentials: on
  - Cloudflare가 엣지에서 프리플라이트에 직접 응답 → 실제 요청은 여전히 Access 인증 통과
- ✅ **4-9.** 외부 접속 테스트 완료
  - `article-bot.matildabc.com` 접속 → 이메일 인증 → 보이스 목록 로드 → 음성 재생 확인

**완료 기준:** 외부에서 이메일 인증 후 음성 재생 성공 ✅

---

## 벤치마크 기록 (2026-06-02)

Apple Silicon Mac 기준 Kokoro-82M 추론 속도 실측값:

| device | 모델 로드 | 생성 시간 | RTF | 배속 |
|--------|----------|----------|-----|------|
| CPU | 2.75s | 4.10s | 0.066x | **15.2x 실시간** |
| MPS | 1.51s | 6.10s | 0.098x | 10.2x 실시간 |

> 62초 오디오 기준. CPU가 MPS보다 약 1.5배 빠름.
> 82M 소형 모델은 GPU 전송 오버헤드가 가속 이득을 초과함.
> → 백엔드는 CPU 사용 확정.
