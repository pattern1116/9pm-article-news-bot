from contextlib import asynccontextmanager
from io import BytesIO
from urllib.parse import urlencode
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

from kokoro import KPipeline

SAMPLE_RATE = 24000

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
