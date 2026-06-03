import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export default function PlayerControls({ isPlaying, onPlay, onStop, disabled, paragraphCount, currentIndex, voice, onVoiceChange }) {
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/voices`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setVoices(data))
      .catch(() => {});
  }, []);

  const progressText = isPlaying && currentIndex != null
    ? `${currentIndex + 1} / ${paragraphCount} 문단 재생 중`
    : paragraphCount > 0
    ? `${paragraphCount}개 문단 준비됨`
    : "기사를 붙여넣으면 재생할 수 있어요";

  return (
    <div className="player-controls">
      <p className="player-info">
        {isPlaying
          ? <><strong>{currentIndex + 1}</strong> / {paragraphCount} 문단 재생 중</>
          : progressText
        }
      </p>

      <select
        className="voice-select"
        value={voice}
        onChange={(e) => onVoiceChange(e.target.value)}
        disabled={isPlaying}
      >
        {voices.map((v) => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>

      {isPlaying ? (
        <button className="btn-play stop" onClick={onStop}>
          ⏹ 정지
        </button>
      ) : (
        <button className="btn-play play" onClick={() => onPlay(voice)} disabled={disabled}>
          ▶ 재생
        </button>
      )}
    </div>
  );
}
