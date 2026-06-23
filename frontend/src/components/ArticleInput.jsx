import { useState } from "react";

export default function ArticleInput({ onParse, onExtract, extracting, extractError, disabled }) {
  const [mode, setMode] = useState("url");
  const [url, setUrl] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || extracting) return;
    onExtract(trimmed);
  }

  function handlePaste(e) {
    const raw = e.target.value;
    const paragraphs = raw.split(/\n\n+/).filter((p) => p.trim());
    onParse(paragraphs);
  }

  return (
    <div className="article-input">
      <div className="input-tabs">
        <button
          type="button"
          className={`input-tab${mode === "url" ? " active" : ""}`}
          onClick={() => setMode("url")}
        >
          🔗 URL로 가져오기
        </button>
        <button
          type="button"
          className={`input-tab${mode === "paste" ? " active" : ""}`}
          onClick={() => setMode("paste")}
        >
          📋 붙여넣기
        </button>
      </div>

      {mode === "url" ? (
        <form className="url-form" onSubmit={handleSubmit}>
          <input
            type="url"
            className="url-field"
            placeholder="BBC 기사 URL을 붙여넣으세요 (예: https://www.bbc.com/news/...)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled || extracting}
          />
          <button
            type="submit"
            className="url-submit"
            disabled={disabled || extracting || !url.trim()}
          >
            {extracting ? "추출 중…" : "추출"}
          </button>
        </form>
      ) : (
        <textarea
          id="article"
          rows={10}
          placeholder="뉴스 기사 본문을 여기에 붙여넣으세요. 빈 줄을 기준으로 문단이 나뉩니다."
          onChange={handlePaste}
          disabled={disabled}
        />
      )}

      {extractError && <p className="input-error">⚠️ {extractError}</p>}
      {mode === "url" && (
        <p className="input-hint">현재 BBC(bbc.com / bbc.co.uk) 기사를 지원합니다.</p>
      )}
    </div>
  );
}
