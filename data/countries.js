/* 국가 데이터
   - gfp / rank: Global Firepower 2026 PwrIndx 와 세계 순위 (출처: config.js SOURCES)
   - score: 최강국 PwrIndx ÷ 각국 PwrIndx × 100 (중국 = 100)
   - 그 밖의 수치는 게임 밸런스용 보정값(초안)이며 실제 전력 평가가 아니다.
*/
window.COUNTRIES = {
  KR: {
    id: "KR", name: "한국", short: "한", color: "#4C8DF6", dark: "#2A5FB8",
    gfp: 0.1642, rank: 5, nuclear: false, bloc: "west",
    forces: 170, garrison: 34, navy: 55, air: 60, reinf: 18,
    supply: 75, morale: 75, economy: 75,
    landBonus: 1.1, firstStrike: 1.0,
    strengths: "지상군·방공, 미군 증원",
    weakness: "선제공격하면 미군 증원이 약해짐",
    flagNote: "파랑",
  },
  CN: {
    id: "CN", name: "중국", short: "중", color: "#E5534B", dark: "#A83229",
    gfp: 0.0919, rank: 3, nuclear: true, bloc: "east",
    forces: 300, garrison: 40, navy: 100, air: 100, reinf: 30,
    supply: 80, morale: 70, economy: 80,
    landBonus: 1.0, firstStrike: 1.0, seaSupplyLong: true,
    strengths: "병력·규모 최대",
    weakness: "해상 보급선이 길고, 봉쇄 시 무역 피해가 큼",
    flagNote: "빨강",
  },
  JP: {
    id: "JP", name: "일본", short: "일", color: "#F2F2F2", dark: "#9AA0A6",
    gfp: 0.1876, rank: 7, nuclear: false, bloc: "west",
    forces: 120, garrison: 32, navy: 85, air: 70, reinf: 14,
    supply: 72, morale: 70, economy: 85,
    landBonus: 0.9, firstStrike: 1.0, preemptPenalty: true,
    strengths: "해군·공군, 해상 방어",
    weakness: "지상 병력이 약하고, 선제공격 시 정치 부담이 큼",
    flagNote: "흰색",
  },
  KP: {
    id: "KP", name: "북한", short: "북", color: "#B07CE8", dark: "#7346A8",
    gfp: 0.5933, rank: 31, nuclear: true, bloc: "east",
    forces: 150, garrison: 48, navy: 12, air: 12, reinf: 8,
    supply: 48, morale: 82, economy: 20,
    landBonus: 1.15, firstStrike: 1.35, sanctionedStart: true,
    strengths: "미사일·기습 포격, 핵 조건부 사용",
    weakness: "경제제재를 받는 상태로 시작, 보급이 약함",
    flagNote: "보라",
  },
  TW: {
    id: "TW", name: "대만", short: "대", color: "#3CC28A", dark: "#22875E",
    gfp: 0.3927, rank: 22, nuclear: false, bloc: "west",
    forces: 80, garrison: 44, navy: 32, air: 38, reinf: 9,
    supply: 72, morale: 76, economy: 72,
    landBonus: 1.0, firstStrike: 1.0, straitDefense: 1.35,
    strengths: "해협 방어, 지원 이벤트",
    weakness: "병력 규모가 작고 증원 시점에 크게 의존",
    flagNote: "초록",
  },
};

/* 화면에 쓰는 순서 */
window.COUNTRY_ORDER = ["KR", "CN", "JP", "KP", "TW"];
