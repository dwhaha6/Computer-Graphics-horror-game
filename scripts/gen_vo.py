# Generate the captor's Korean voice lines with edge-tts (free, MS neural TTS).
# Creepy grandmother tone via lowered pitch + slower rate. Outputs to
# public/assets/audio/<name>.mp3 — names match Captor.js / AUDIO_MANIFEST.
#
#   python -m pip install edge-tts
#   python scripts/gen_vo.py
import asyncio, os
import edge_tts

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'audio')
os.makedirs(OUT, exist_ok=True)

VOICE = "ko-KR-SunHiNeural"   # Korean female neural voice
PITCH = "-25Hz"               # lower => older/creepier
RATE = "-12%"                 # slower => more menacing

LINES = {
    "vo_enter_1": "어디 보자… 우리 착한 아이.",
    "vo_enter_2": "왜 아직도 밥을 안 먹었니?",
    "vo_enter_3": "벌레들이 그러더구나… 네가 돌아다녔다고.",
    "vo_enter_4": "쉬이— 가만히 있으렴. 곧 저녁이야.",
    "vo_enter_5": "엄마가 왔단다. 무서워 말렴.",
    "vo_enter_6": "이 냄새… 누가 등불을 만졌지?",
    "vo_safe_1": "…착하구나. 그대로 있으렴.",
    "vo_safe_2": "그래. 얌전하구나.",
    "vo_safe_3": "좋아… 아주 좋아.",
    "vo_caught_1": "거짓말쟁이…!",
    "vo_caught_2": "움직였구나, 못된 것.",
    "vo_caught_3": "벌레들은 거짓말을 안 한단다.",
}


async def one(name, text):
    comm = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH)
    await comm.save(os.path.join(OUT, name + ".mp3"))
    print("wrote", name + ".mp3")


async def main():
    for name, text in LINES.items():
        try:
            await one(name, text)
        except Exception as e:
            print("FAILED", name, "->", e)


if __name__ == "__main__":
    asyncio.run(main())
