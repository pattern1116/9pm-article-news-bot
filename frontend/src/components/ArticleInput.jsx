export default function ArticleInput({ onParse, disabled }) {
  function handleChange(e) {
    const raw = e.target.value;
    const paragraphs = raw.split(/\n\n+/).filter((p) => p.trim());
    onParse(paragraphs, raw);
  }

  return (
    <div className="article-input">
      <textarea
        id="article"
        rows={10}
        placeholder="뉴스 기사 본문을 여기에 붙여넣으세요. 빈 줄을 기준으로 문단이 나뉩니다."
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}
