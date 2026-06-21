# 할머니 음성 생성 가이드 (ElevenLabs Voice Design)

목표: **늙고 음산한 한국 할머니** 음성으로 아래 12줄을 만들어
`public/assets/audio/` 에 정확한 파일명으로 저장하면 게임에 자동 적용된다.
(재생/위치음향/자막 연동은 이미 끝나 있음. 파일명만 맞추면 됨.)

## 1. ElevenLabs 보이스 만들기
1. https://elevenlabs.io 무료 가입 → **Voice Design**(Text to Voice) 진입.
2. **Voice description**(영어로 묘사하면 잘 나옴) 예시 붙여넣기:
   ```
   An elderly Korean woman in her late 70s. Frail, raspy, breathy voice with a
   slow, sing-song but deeply unsettling tone. Sounds gentle on the surface but
   sinister underneath — like a horror-game grandmother. Slightly trembling,
   wet mouth sounds, almost whispering.
   ```
3. 미리듣기 텍스트에 한국어 한 줄 넣고 생성 → 3개 중 맘에 드는 음색을 **Save to Voice Library**.

## 2. 12줄 음성 뽑기 (Text to Speech)
- **모델: Multilingual v2** (한국어 지원), 저장한 할머니 보이스 선택.
- 권장 설정: **Stability 낮게(~30%)**, **Style 높게**, **Speed 느리게** → 더 으스스/불안정.
- 각 줄을 붙여넣고 생성 → **mp3 다운로드** → 아래 파일명으로 저장.

| 파일명 (`public/assets/audio/`) | 대사 | 상황 |
|---|---|---|
| `vo_enter_1.mp3` | 어디 보자… 우리 착한 아이. | 입장 |
| `vo_enter_2.mp3` | 왜 아직도 밥을 안 먹었니? | 입장 |
| `vo_enter_3.mp3` | 벌레들이 그러더구나… 네가 돌아다녔다고. | 입장 |
| `vo_enter_4.mp3` | 쉬이— 가만히 있으렴. 곧 저녁이야. | 입장 |
| `vo_enter_5.mp3` | 엄마가 왔단다. 무서워 말렴. | 입장 |
| `vo_enter_6.mp3` | 이 냄새… 누가 등불을 만졌지? | 입장 |
| `vo_safe_1.mp3` | …착하구나. 그대로 있으렴. | 통과 |
| `vo_safe_2.mp3` | 그래. 얌전하구나. | 통과 |
| `vo_safe_3.mp3` | 좋아… 아주 좋아. | 통과 |
| `vo_caught_1.mp3` | 거짓말쟁이…! | 잡힘 |
| `vo_caught_2.mp3` | 움직였구나, 못된 것. | 잡힘 |
| `vo_caught_3.mp3` | 벌레들은 거짓말을 안 한단다. | 잡힘 |

## 3. 적용
- 위 파일들을 `public/assets/audio/` 에 저장(기존 edge-tts mp3를 같은 이름으로 덮어쓰면 됨).
- 이미 `AUDIO_MANIFEST`에 `vo_*`가 등록돼 있어 **새로고침 후 클릭하면 자동 로드** → 납치범 입장/통과/잡힘 때 재생.
- 대사 문구를 바꾸고 싶으면 `src/world/Captor.js`의 `ENCOUNTERS / SAFE_LINES / CAUGHT_LINES`에서 수정(파일명 `vo` 키만 맞추면 됨).

> 무료티어는 상업권리 없음(학교 제출은 OK) + 리포트/크레딧에 ElevenLabs 출처표기 권장.
