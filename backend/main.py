from contextlib import asynccontextmanager
from io import BytesIO
import struct

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import numpy as np
import soundfile as sf

from kokoro import KPipeline

SAMPLE_RATE = 24000

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


@app.get("/voices")
def get_voices():
    return VOICES


@app.post("/tts/stream")
def tts_stream(req: TTSRequest):
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
