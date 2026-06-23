import { useEffect, useRef } from "react";

// 단어와 비단어(공백·문장부호)를 번갈아 토큰화한다.
function tokenize(text) {
  return text.split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/);
}

export default function ParagraphList({ paragraphs, currentIndex, onClickParagraph, onWordClick, isPlaying }) {
  const activeRef = useRef(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentIndex]);

  if (!paragraphs.length) return null;

  return (
    <ol className="paragraph-list">
      {paragraphs.map((p, i) => (
        <li
          key={i}
          ref={i === currentIndex ? activeRef : null}
          className={`paragraph-item${i === currentIndex ? " active" : ""}${isPlaying ? " disabled" : ""}`}
          onClick={() => !isPlaying && onClickParagraph(i)}
          title={isPlaying ? "" : "클릭하면 여기서부터 재생"}
        >
          <span className="paragraph-num">{i + 1}</span>
          <span className="paragraph-text">
            {tokenize(p).map((tok, j) =>
              /^[A-Za-z]/.test(tok) ? (
                <span
                  key={j}
                  className="word"
                  onClick={(e) => {
                    // 단어 클릭은 재생(문단 클릭)과 충돌하지 않도록 전파를 막는다.
                    e.stopPropagation();
                    onWordClick(tok.toLowerCase(), e);
                  }}
                >
                  {tok}
                </span>
              ) : (
                <span key={j}>{tok}</span>
              )
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
