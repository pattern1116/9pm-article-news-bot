import { useState, useEffect, useCallback, useRef } from "react";
import ArticleInput from "./components/ArticleInput";
import ParagraphList from "./components/ParagraphList";
import PlayerControls from "./components/PlayerControls";
import FloatingPlayer from "./components/FloatingPlayer";
import WordPopover from "./components/WordPopover";
import { useTTS } from "./hooks/useTTS";
import { extractArticle, lookupWord } from "./api";
import { groupParagraphs } from "./utils/groupParagraphs";
import "./App.css";

export default function App() {
  const [paragraphs, setParagraphs] = useState([]);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState(null);
  const [voice, setVoice] = useState("af_heart");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [popover, setPopover] = useState(null);
  const [toast, setToast] = useState("");
  const didMountExtract = useRef(false);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  }

  const { currentIndex, isPlaying, playFrom, stop } = useTTS();

  const runExtract = useCallback(
    async (url) => {
      setExtracting(true);
      setExtractError("");
      try {
        const data = await extractArticle(url);
        stop();
        setParagraphs(groupParagraphs(data.paragraphs));
        setTitle(data.title || "");
        setSourceUrl(url);
        const u = new URL(window.location.href);
        u.searchParams.set("url", url);
        window.history.replaceState({}, "", u);
      } catch (e) {
        setExtractError(e.message || "추출에 실패했습니다.");
      } finally {
        setExtracting(false);
      }
    },
    [stop]
  );

  // 공유 링크로 열렸을 때 ?url= 파라미터의 기사를 자동 추출한다.
  // (StrictMode가 dev에서 effect를 두 번 실행하므로 1회만 수행하도록 가드)
  useEffect(() => {
    if (didMountExtract.current) return;
    didMountExtract.current = true;
    const url = new URLSearchParams(window.location.search).get("url");
    if (url) runExtract(url);
  }, [runExtract]);

  function handleParse(parsed) {
    stop();
    setParagraphs(groupParagraphs(parsed));
    setTitle("");
    setSourceUrl(null);
  }

  function handlePlay(selectedVoice) {
    setVoice(selectedVoice);
    playFrom(paragraphs, 0, selectedVoice);
  }

  function handleClickParagraph(index) {
    playFrom(paragraphs, index, voice, index + 1);
  }

  const handleWordClick = useCallback(async (word, e) => {
    const x = e.clientX;
    const y = e.clientY;
    setPopover({ word, x, y, loading: true });
    try {
      const entries = await lookupWord(word);
      setPopover({ word, x, y, loading: false, entries });
    } catch {
      setPopover({ word, x, y, loading: false, error: true });
    }
  }, []);

  async function handleShare() {
    const shareUrl = `${window.location.origin}${window.location.pathname}?url=${encodeURIComponent(sourceUrl)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("✅ 공유 링크가 복사되었습니다");
    } catch {
      // 클립보드 API 실패 시 폴백: 프롬프트로 직접 복사하도록 노출
      window.prompt("아래 링크를 복사하세요:", shareUrl);
    }
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
          <ArticleInput
            onParse={handleParse}
            onExtract={runExtract}
            extracting={extracting}
            extractError={extractError}
            disabled={isPlaying}
          />
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
            {title && <h2 className="article-title">{title}</h2>}
            <div className="article-toolbar">
              <h2 className="section-title">
                문단 목록
                <span className="badge">{paragraphs.length}개</span>
              </h2>
              {sourceUrl && (
                <button className="share-btn" onClick={handleShare}>
                  🔗 공유하기
                </button>
              )}
            </div>
            <p className="article-hint">문단을 클릭하면 재생, 단어를 클릭하면 뜻을 볼 수 있어요.</p>
            <ParagraphList
              paragraphs={paragraphs}
              currentIndex={currentIndex}
              onClickParagraph={handleClickParagraph}
              onWordClick={handleWordClick}
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

      <WordPopover state={popover} onClose={() => setPopover(null)} />

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
