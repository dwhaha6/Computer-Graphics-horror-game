# 할머니의 저녁식사 (Escape the Grandmother)

**방탈출 공포 게임**. Three.js(WebGL2) 위에서 동작하는 **실시간 DDGI(Dynamic Diffuse Global Illumination)** 를 직접 구현해 어두운 실내의 간접광·color bleeding으로 공포 분위기를 만든다.

> 컴퓨터그래픽스 최종 과제. GI 기술: **DDGI** (프로브 기반 동적 확산 전역조명).

## 빠른 실행
**주의**: Edge에서 제작한 Game이기에 Chrome에선 약간의 끊김현상이 있을 수 있습니다, Edge에서 play할 것을 권장드립니다.(Chrome에서도 플레이 자체에 지장은 없습니다.)

> https://dwhaha6.github.io/Computer-Graphics-horror-game/

## 실행

```bash
npm install2
npm run dev      # 개발 서버 (http://localhost:5173)
npm run build    # 정적 빌드 → dist/
npm run preview  # 빌드 결과 미리보기
npm run deploy   # gh-pages 브랜치로 배포
```

## 조작

- **WASD** 이동, **마우스** 시선, **Shift** 천천히 걷기
- **E** 상호작용 / 줍기
- **클릭** 으로 포인터 락 시작

## 구조

```
src/
  main.js                # 엔트리 · 게임 루프 · 시스템 연결
  core/                  # 렌더러, 입력, 에셋 로더
  player/                # 1인칭 컨트롤러
  world/                 # 방/인접공간 지오메트리, 인터랙션, 포털
  gi/ddgi/               # DDGI 구현 (프로브 볼륨, 옥타헤드럴 맵, 샘플링)
  post/                  # 포스트프로세싱 (비네팅/그레인/안개)
report/
  REPORT.md              # 제출용 리포트 (강의 내용 ↔ 구현 매핑, 캡쳐)
public/assets/           # 텍스처/모델/오디오 (CC0)
```

## GI 기술 요약

DDGI: 방 전체에 3D 프로브 그리드를 깔고, 각 프로브에서 (저폴리 프록시 씬에 대해) 주변 radiance와 거리를 옥타헤드럴 맵으로 수집한다. 셰이딩 시 표면 주변 8개 프로브를 trilinear + **Chebyshev 가시성 가중치**로 보간해 간접광을 적용한다. 프로브는 매 프레임 일부만 갱신(amortized)하여 동적 조명(깜빡이는 전구, 문틈 빛)에 실시간 반응한다.

자세한 내용은 [report/REPORT.md](report/REPORT.md) 참고.
