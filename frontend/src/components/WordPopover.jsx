import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function WordPopover({ state, onClose }) {
  useEffect(() => {
    if (!state) return;
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, onClose]);

  if (!state) return null;

  // 화면 밖으로 나가지 않도록 위치를 보정한다.
  const width = 300;
  const left = Math.min(state.x, window.innerWidth - width - 12);
  const top = Math.min(state.y + 14, window.innerHeight - 120);

  const entry = state.entries?.[0];
  const phonetic =
    entry?.phonetic || entry?.phonetics?.find((p) => p.text)?.text || "";

  return createPortal(
    <>
      <div className="word-popover-backdrop" onClick={onClose} />
      <div
        className="word-popover"
        style={{ left, top, width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="word-popover-head">
          <span className="word-popover-word">{state.word}</span>
          {phonetic && <span className="word-popover-phonetic">{phonetic}</span>}
          <button className="word-popover-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {state.loading && <p className="word-popover-status">찾는 중…</p>}
        {state.error && (
          <p className="word-popover-status">정의를 찾지 못했습니다.</p>
        )}

        {entry && (
          <div className="word-popover-body">
            {entry.meanings?.slice(0, 3).map((m, i) => (
              <div key={i} className="word-meaning">
                <span className="word-pos">{m.partOfSpeech}</span>
                <p className="word-def">{m.definitions?.[0]?.definition}</p>
                {m.definitions?.[0]?.example && (
                  <p className="word-example">“{m.definitions[0].example}”</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
