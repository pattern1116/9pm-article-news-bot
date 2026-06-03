export default function FloatingPlayer({ isPlaying, currentParagraph, currentIndex, total, onStop }) {
  if (!isPlaying || currentParagraph == null) return null;

  return (
    <div className="floating-player">
      <div className="floating-info">
        <span className="floating-badge">{currentIndex + 1} / {total}</span>
        <p className="floating-text">{currentParagraph}</p>
      </div>
      <button className="floating-stop" onClick={onStop}>⏹ 정지</button>
    </div>
  );
}
