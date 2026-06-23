import { getSession, clearSession } from "./auth";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// BBC 기사 URL을 백엔드로 보내 제목과 문단을 추출한다.
export async function extractArticle(url) {
  const session = await getSession();
  const res = await fetch(`${API_URL}/extract`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Token": session,
    },
    body: JSON.stringify({ url }),
    credentials: "include",
  });

  if (res.status === 401) clearSession();
  if (!res.ok) {
    let detail = `요청 실패 (HTTP ${res.status})`;
    try {
      const data = await res.json();
      if (data.detail) detail = data.detail;
    } catch {
      /* 본문 없음 */
    }
    throw new Error(detail);
  }
  return res.json();
}

// 무료 사전 API(dictionaryapi.dev)로 영어 단어의 뜻을 조회한다 (CORS 허용).
export async function lookupWord(word) {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  );
  if (!res.ok) throw new Error("정의를 찾지 못했습니다.");
  return res.json();
}
