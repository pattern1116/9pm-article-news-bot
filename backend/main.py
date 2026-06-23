from contextlib import asynccontextmanager
from io import BytesIO
from urllib.parse import urlencode, urlparse
from urllib.request import urlopen, Request
import hashlib
import hmac
import json
import os
import secrets
import struct
import time

from dotenv import load_dotenv

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import numpy as np
import soundfile as sf

from bs4 import BeautifulSoup

from kokoro import KPipeline

SAMPLE_RATE = 24000

# 기사를 추출할 수 있는 허용 도메인 (서버측 SSRF 방지 — 임의 URL fetch 차단).
ALLOWED_ARTICLE_HOSTS = ("bbc.com", "bbc.co.uk")

# --- Turnstile / session auth ---
# Load secrets from backend/.env (gitignored — never committed).
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Cloudflare Turnstile secret (server-side only, never shipped to the browser).
TURNSTILE_SECRET = os.environ.get("TURNSTILE_SECRET", "")
if not TURNSTILE_SECRET:
    raise RuntimeError("TURNSTILE_SECRET is not set (see backend/.env)")
# Signs short-lived session tokens. Random per-process unless pinned via env.
SESSION_SECRET = os.environ.get("SESSION_SECRET", secrets.token_hex(32))
SESSION_TTL = 60 * 60  # 1 hour
# Only accept Turnstile tokens solved on these exact hostnames.
TURNSTILE_HOSTNAMES = {"article-bot.matildabc.com", "localhost"}
# Local-dev only: when set, exposes /auth/dev to mint a session WITHOUT Turnstile.
# Never enable on the public/production deployment.
ALLOW_DEV_SESSION = os.environ.get("ALLOW_DEV_SESSION") == "1"


def issue_session() -> str:
    exp = int(time.time()) + SESSION_TTL
    sig = hmac.new(SESSION_SECRET.encode(), str(exp).encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def session_valid(token: str) -> bool:
    try:
        exp_str, sig = token.split(".", 1)
        expected = hmac.new(
            SESSION_SECRET.encode(), exp_str.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return False
        return int(exp_str) > time.time()
    except (ValueError, AttributeError):
        return False


def require_session(x_session_token: str | None = Header(default=None)) -> None:
    if not x_session_token or not session_valid(x_session_token):
        raise HTTPException(status_code=401, detail="invalid or missing session")

VOICES = [
    {"id": "af_heart",   "name": "Heart (US Female)"},
    {"id": "af_bella",   "name": "Bella (US Female)"},
    {"id": "af_sarah",   "name": "Sarah (US Female)"},
    {"id": "am_adam",    "name": "Adam (US Male)"},
    {"id": "am_michael", "name": "Michael (US Male)"},
    {"id": "bf_emma",    "name": "Emma (UK Female)"},
    {"id": "bm_george",  "name": "George (UK Male)"},
]

pipeline: KPipeline | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pipeline
    print("Loading Kokoro pipeline (CPU)...")
    pipeline = KPipeline(lang_code="a")
    print("Kokoro ready.")
    yield
    pipeline = None


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "http://localhost:8787",
        "https://article-bot.matildabc.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def make_wav_header(sample_rate: int, num_channels: int = 1, bits_per_sample: int = 16) -> bytes:
    """WAV 헤더 생성 (data chunk 크기는 스트리밍이라 0으로 설정)."""
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        0xFFFFFFFF,   # file size unknown
        b"WAVE",
        b"fmt ",
        16,           # PCM chunk size
        1,            # PCM format
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b"data",
        0xFFFFFFFF,   # data size unknown
    )
    return header


class TTSRequest(BaseModel):
    text: str
    voice: str = "af_heart"


class TurnstileRequest(BaseModel):
    token: str


class ExtractRequest(BaseModel):
    url: str


def _host_allowed(netloc: str) -> bool:
    host = netloc.split(":")[0].lower()
    return any(host == d or host.endswith("." + d) for d in ALLOWED_ARTICLE_HOSTS)


def extract_article(url: str) -> dict:
    """BBC 기사 URL에서 제목과 문단을 추출한다."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not _host_allowed(parsed.netloc):
        raise HTTPException(status_code=400, detail="BBC 기사 URL만 지원합니다.")

    req = Request(url, headers={"User-Agent": "Mozilla/5.0 (NewsStudyBot)"})
    try:
        with urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except Exception:
        raise HTTPException(status_code=502, detail="기사를 가져오지 못했습니다.")

    soup = BeautifulSoup(html, "html.parser")

    title_el = soup.find("h1")
    title = title_el.get_text(strip=True) if title_el else ""

    # BBC 본문은 data-component="text-block" 블록 안의 <p> 로 구성됨.
    blocks = soup.find_all(attrs={"data-component": "text-block"})
    paragraphs: list[str] = []
    if blocks:
        for block in blocks:
            for p in block.find_all("p"):
                text = p.get_text(" ", strip=True)
                if text:
                    paragraphs.append(text)
    else:
        # 폴백: <article> 안의 모든 <p>
        article = soup.find("article") or soup
        for p in article.find_all("p"):
            text = p.get_text(" ", strip=True)
            if text:
                paragraphs.append(text)

    if not paragraphs:
        raise HTTPException(status_code=422, detail="본문을 찾지 못했습니다.")

    return {"title": title, "paragraphs": paragraphs}


@app.post("/extract")
def extract(req: ExtractRequest, _: None = Depends(require_session)):
    return extract_article(req.url.strip())


@app.post("/auth/turnstile")
def auth_turnstile(req: TurnstileRequest):
    """Verify a Turnstile token with Cloudflare, then issue a session token."""
    data = urlencode({"secret": TURNSTILE_SECRET, "response": req.token}).encode()
    http_req = Request(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify", data=data
    )
    try:
        with urlopen(http_req, timeout=10) as resp:
            result = json.loads(resp.read().decode())
    except Exception:
        raise HTTPException(status_code=502, detail="turnstile verify failed")

    if not result.get("success"):
        raise HTTPException(status_code=403, detail="turnstile rejected")
    if result.get("hostname") not in TURNSTILE_HOSTNAMES:
        raise HTTPException(status_code=403, detail="hostname not allowed")

    return {"session": issue_session()}


@app.post("/auth/dev")
def auth_dev():
    """로컬 개발용: Turnstile 없이 세션을 발급한다 (ALLOW_DEV_SESSION=1 일 때만)."""
    if not ALLOW_DEV_SESSION:
        raise HTTPException(status_code=404, detail="not found")
    return {"session": issue_session()}


@app.get("/voices")
def get_voices(_: None = Depends(require_session)):
    return VOICES


@app.post("/tts/stream")
def tts_stream(req: TTSRequest, _: None = Depends(require_session)):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is empty")
    if pipeline is None:
        raise HTTPException(status_code=503, detail="pipeline not ready")

    def generate():
        yield make_wav_header(SAMPLE_RATE)
        for _, _, audio in pipeline(req.text, voice=req.voice, speed=1.0):
            pcm = (audio.numpy() * 32767).astype(np.int16).tobytes()
            yield pcm

    return StreamingResponse(generate(), media_type="audio/wav")
