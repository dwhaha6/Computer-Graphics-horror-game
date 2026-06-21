# 개발 노트 — 6/19 GPU 작업 체크리스트

오늘(6/17~18) 비-GPU 환경에서 만든 토대 위에서, GPU가 확보되는 6/19부터 할 일.

## 현재 상태 (검증 완료)
- ✅ Vite + Three.js(WebGL2) 스캐폴드, `npm run build` 통과
- ✅ 실제 브라우저(headless Chrome/swiftshader)에서 구동 확인 — 크래시/셰이더 컴파일 에러 없음
- ✅ DDGI 셰이더 주입 컴파일·렌더 확인, **GI on/off 차이 육안 확인** (`docs/validation/`)
- ✅ 안전장치: `?nogi`로 DDGI 끄면 직접광만으로도 게임 구동 (0점 방지)

## 디버그 파라미터
- `?auto` — 시작 오버레이 스킵, 바로 렌더 (마우스 락 없음)
- `?debug` — 안개/포스트 OFF, 노출↑, 방 전체가 보이는 카메라 (GI 품질 확인용)
- `?nogi` — DDGI 비활성 (폴백/비교)
- 헤드리스 캡쳐: `node scripts/serve.mjs &` 후 `scripts/smoke.mjs` 또는 chrome `--headless --screenshot`

## 우선순위 (높은 → 낮은)

### A. DDGI 실 GPU 검증·튜닝 (반나절)
- [ ] 실 GPU에서 `?debug`로 열어 GI on/off 비교 — leaking/시각 아티팩트 확인
- [ ] `ProbeVolume.js` 상단 튜너블 조정:
  - `IRR_SAMPLES`/`DIST_SAMPLES` (품질 vs 비용), `UPDATES_PER_FRAME` (동적 반응 vs fps)
  - `setIntensity()` (현재 1.4 — 더 키워 바운스 강조)
  - `uDDGINormalBias`(0.25), `DIST_SHARPNESS`(50) — leaking/그림자 경계 튜닝
- [ ] 벽 알베도를 약간 올리면 바운스가 강해져 GI가 더 잘 보임 (`Room.js` PALETTE)
- [ ] FPS 측정 (stats.js 추가 권장). 60fps 목표, 미달 시 프로브 수/샘플 수 하향

### B. 리얼 에셋 적용 (반나절~하루) — 비주얼 "리얼 지향"
- CC0 출처: **Poly Haven**(텍스처/모델/HDRI), **ambientCG**(PBR 텍스처)
- [ ] 벽/바닥/천장: PBR 텍스처(map/normalMap/roughnessMap) → `Room.js` PALETTE 머티리얼에 주입
- [ ] 가구: 의자/식탁/문/램프/선반 모델(glTF) → `GLTFLoader`로 교체, 박스는 충돌용으로만 유지
- [ ] HDRI 환경맵으로 반사/앰비언트 보강 (`RGBELoader` + `PMREMGenerator`)
- [ ] **프록시는 저폴리 유지** — 리얼 모델을 프록시에 쓰지 말 것(프로브 비용 폭증)
- [ ] 텍스처 2K 상한 + KTX2(basis) 압축 권장

### C. 게임플레이 (하루)
- [ ] 인벤토리/상호작용(E키 레이캐스트 픽업) 시스템
- [ ] 퍼즐 2~3개 + 단서, 탈출 조건
- [ ] 납치범 복귀: 발소리 오디오 + 문틈 빛(captor 라이트 인텐시티 애니메이션) + 흔적복원 타이머
  - 추적 오브젝트 3~4개의 상태 머신(원위치/원상태 체크)
- [ ] 시간 제한 + 사망/체크포인트
- [ ] 사운드: 발소리·환경음·심장박동 (Web Audio / `THREE.Audio`)

### D. 폴리시 & 배포 (반나절)
- [ ] 포스트 강도 튜닝(`Post.js`), 톤매핑 노출
- [ ] GitHub Pages 배포: `npm run deploy` (또는 Actions). **base는 `./` 상대경로라 서브패스 OK**
- [ ] 배포 링크 실제로 열어 확인 (채점은 링크로만 진행 — 안 열리면 0점)
- [ ] 리포트(`report/REPORT.md`) 캡쳐 채우기 — 실 게임 캡쳐 필수

## 알려진 리스크 / 주의
- **HalfFloat 렌더 타깃**: 일부 GPU/드라이버에서 color-buffer-float 미지원 가능. 문제 시 콘솔 확인 → 최악의 경우 `?nogi`로 제출 가능하게 유지.
- **octahedral 타일 경계**: 거터 없이 interior 클램프로 처리 → 미세 시접 가능. 거슬리면 1px 보더 패스 추가.
- **멀티바운스**: 현재 1바운스(수집 시 이전 irradiance 미참조). 필요하면 프록시 머티리얼에 직전 irradiance를 ambient로 피드백.
- **동적 지오메트리**: 프록시가 정적이라 가구 이동은 GI에 반영 안 됨. 문 열림 등은 프록시도 같이 움직이게 하거나 무시.
- **포털 컬링 미구현**: 방+복도뿐이라 전부 렌더해도 가벼움. 확장 시 도입 검토.

## 배포 체크 (제출 전 필수)
- [ ] 빌드 후 `npm run preview`로 프로덕션 번들 동작 확인
- [ ] 배포 링크를 **다른 기기/브라우저**(특히 평범한 노트북)에서 열어 구동 확인
- [ ] KLAS 제출 링크 = 실제 동작 링크 (제출 후 변경 금지)
