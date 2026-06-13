import { useRef, useState, useCallback } from "react";
import { getSession, clearSession } from "../auth";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const SAMPLE_RATE = 24000;

export function useTTS() {
  const [currentIndex, setCurrentIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const abortRef = useRef(null);
  const audioCtxRef = useRef(null);

  function getAudioContext() {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    return audioCtxRef.current;
  }

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // 이미 예약된 Web Audio 버퍼까지 즉시 끊음
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setIsPlaying(false);
    setCurrentIndex(null);
  }, []);

  // endIndex 생략 시 끝까지, 지정 시 그 인덱스 직전까지만 재생
  const playFrom = useCallback(async (paragraphs, startIndex, voice, endIndex = null) => {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setIsPlaying(true);

    const limit = endIndex ?? paragraphs.length;

    for (let i = startIndex; i < limit; i++) {
      if (controller.signal.aborted) break;

      const text = paragraphs[i].trim();
      if (!text) continue;

      setCurrentIndex(i);

      try {
        await streamParagraph(text, voice, controller.signal);
      } catch (e) {
        if (e.name === "AbortError") break;
        console.error("TTS error:", e);
        break;
      }
    }

    if (!controller.signal.aborted) {
      setIsPlaying(false);
      setCurrentIndex(null);
    }
  }, []);

  async function streamParagraph(text, voice, signal) {
    const session = await getSession();
    const res = await fetch(`${API_URL}/tts/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Token": session,
      },
      body: JSON.stringify({ text, voice }),
      credentials: "include",
      signal,
    });

    if (res.status === 401) {
      clearSession();
      throw new Error("HTTP 401");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const ctx = getAudioContext();
    const reader = res.body.getReader();

    const WAV_HEADER_SIZE = 44;
    let headerSkipped = false;
    let accumBuf = new Uint8Array(0);  // 헤더 누적 or 홀수 바이트 캐리

    let startTime = ctx.currentTime;
    let scheduled = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      let pcm;

      if (!headerSkipped) {
        const merged = new Uint8Array(accumBuf.length + value.length);
        merged.set(accumBuf);
        merged.set(value, accumBuf.length);

        if (merged.length < WAV_HEADER_SIZE) {
          accumBuf = merged;
          continue;
        }

        pcm = merged.slice(WAV_HEADER_SIZE);
        headerSkipped = true;
        accumBuf = new Uint8Array(0);
      } else {
        // 이전 청크에서 남은 홀수 바이트가 있으면 앞에 붙임
        if (accumBuf.length > 0) {
          const merged = new Uint8Array(accumBuf.length + value.length);
          merged.set(accumBuf);
          merged.set(value, accumBuf.length);
          pcm = merged;
        } else {
          pcm = value;
        }
      }

      if (pcm.length < 2) {
        accumBuf = pcm;
        continue;
      }

      // int16은 2바이트 단위 — 홀수 바이트는 다음 청크로 넘김
      const usableLen = pcm.length - (pcm.length % 2);
      accumBuf = pcm.length % 2 === 1 ? pcm.slice(usableLen) : new Uint8Array(0);

      const int16 = new Int16Array(pcm.buffer, pcm.byteOffset, usableLen / 2);
      const float32 = Float32Array.from(int16, (v) => v / 32767);

      const audioBuffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
      audioBuffer.copyToChannel(float32, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      if (!scheduled) {
        startTime = ctx.currentTime + 0.05;
        scheduled = true;
      }

      source.start(startTime);
      startTime += audioBuffer.duration;
    }

    if (scheduled) {
      const remaining = (startTime - ctx.currentTime) * 1000;
      if (remaining > 0) {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, remaining + 100);
          signal.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
          });
        });
      }
    }
  }

  return { currentIndex, isPlaying, playFrom, stop };
}
