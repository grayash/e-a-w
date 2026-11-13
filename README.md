# 동아시아 전쟁 시뮬레이션 (e-a-w)

나라를 고르고 개전 조건과 전략을 선택하면 전황이 달라지는 모바일 도트 전략 게임입니다.

- 플레이: https://grayash.github.io/e-a-w/
- 의견·버그: [Issues](https://github.com/grayash/e-a-w/issues)

> 가상 시뮬레이션이며 실제 전황 예측이나 정치적 입장이 아닙니다. 개인 정보를 수집하지 않습니다.

## 구성
| 경로 | 내용 |
| --- | --- |
| `index.html`, `css/` | 화면 |
| `data/` | 국가·규칙·지도·지명 데이터 (수치 조정은 여기서) |
| `js/engine.js` | 전투·개입·핵·종료 판정 |
| `js/map.js` | 도트 지도 렌더러 |
| `js/report.js` | 실시간 전황 보고 문장 |
| `js/epilogue.js` | 종료 후 여파 도트 장면 |
| `js/ui.js` | 화면 흐름 |

## 출처
기본 군사력: Global Firepower 2026 PwrIndx (중국 = 100으로 환산). 그 밖의 능력치는 게임용 보정값입니다. 지도는 실제 경계를 단순화한 근사치입니다.
