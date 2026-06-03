import { useState } from "react";
import ArticleInput from "./components/ArticleInput";
import ParagraphList from "./components/ParagraphList";
import PlayerControls from "./components/PlayerControls";
import FloatingPlayer from "./components/FloatingPlayer";
import { useTTS } from "./hooks/useTTS";
import "./App.css";

export default function App() {
  const [paragraphs, setParagraphs] = useState([]);
  const [voice, setVoice] = useState("af_heart");
  const { currentIndex, isPlaying, playFrom, stop } = useTTS();

  function handleParse(parsed) {
    stop();
    setParagraphs(parsed);
  }

  function handlePlay(selectedVoice) {
    setVoice(selectedVoice);
    playFrom(paragraphs, 0, selectedVoice);
  }

  function handleClickParagraph(index) {
    playFrom(paragraphs, index, voice, index + 1);
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="header-brand">
            <span className="header-icon">🎙️</span>
            <div>
              <h1 className="header-title">News Study Bot</h1>
              <p className="header-sub">뉴스 기사 따라읽기</p>
            </div>
          </div>
        </div>
      </header>

      <main className="main">
        <section className="card">
          <h2 className="section-title">기사 입력</h2>
          <ArticleInput onParse={handleParse} disabled={isPlaying} />
        </section>

        <section className="card player-card">
          <PlayerControls
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onStop={stop}
            disabled={paragraphs.length === 0}
            paragraphCount={paragraphs.length}
            currentIndex={currentIndex}
            voice={voice}
            onVoiceChange={setVoice}
          />
        </section>

        {paragraphs.length > 0 && (
          <section className="card">
            <h2 className="section-title">
              문단 목록
              <span className="badge">{paragraphs.length}개</span>
            </h2>
            <ParagraphList
              paragraphs={paragraphs}
              currentIndex={currentIndex}
              onClickParagraph={handleClickParagraph}
              isPlaying={isPlaying}
            />
          </section>
        )}
      </main>

      <FloatingPlayer
        isPlaying={isPlaying}
        currentParagraph={currentIndex != null ? paragraphs[currentIndex] : null}
        currentIndex={currentIndex}
        total={paragraphs.length}
        onStop={stop}
      />
    </div>
  );
}
