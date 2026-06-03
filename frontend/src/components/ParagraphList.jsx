import { useEffect, useRef } from "react";

export default function ParagraphList({ paragraphs, currentIndex, onClickParagraph, isPlaying }) {
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
        >
          <span className="paragraph-num">{i + 1}</span>
          <span className="paragraph-text">{p}</span>
        </li>
      ))}
    </ol>
  );
}
