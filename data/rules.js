/* 게임 규칙 데이터 (모든 수치는 밸런스 테스트 전 초안)
   선택 → 결과 인과가 이 파일에 모여 있다. 엔진은 이 값만 읽는다.
*/
window.RULES = {
  hoursPerTurn: 12,          // 12시간마다 전략 선택
  gameMinPerRealSec: 3,      // 배율 1 기준: 현실 1분 = 게임 3시간
  speeds: [1, 2, 4, 6],      // 선택 가능한 배율 (기본 2배: 12시간 = 현실 2분)

  /* 기상: 다음 12시간 예보가 전략 화면에 나오고 전투에 반영된다 */
  weather: [
    { id: "clear", name: "맑음", w: 5, air: 1.0, sea: 1.0, flank: 1.0, note: "작전 제약 없음" },
    { id: "rain", name: "비", w: 2, air: 0.85, sea: 0.9, flank: 1.0, note: "공중 우세 −15%, 상륙 −10%" },
    { id: "fog", name: "짙은 안개", w: 2, air: 0.75, sea: 0.85, flank: 1.15, note: "공중 우세 −25%, 상륙 −15%, 우회 기습 +15%" },
    { id: "storm", name: "강풍·높은 파도", w: 1, air: 0.9, sea: 0.7, flank: 1.0, note: "상륙 −30%, 공중 우세 −10%" },
  ],

  /* 개전 조건 (공격 입장) */
  attackConditions: [
    { key: "method", title: "개전 방식", options: [
      { id: "preempt", label: "선제공격", gain: "첫 턴 전투력 +20%", cost: "여론 −20, 상대 지원국 개입 +1" },
      { id: "border", label: "국경 충돌 확전", gain: "정전 협상을 2턴부터 제안 가능", cost: "첫 턴 투입 병력 −30%" },
    ]},
    { key: "civil", title: "민간 피해 정책", options: [
      { id: "protect", label: "민간 보호 우선", gain: "사기 +10, 여론 +10, 점령지 저항 낮음", cost: "공격력 −8%" },
      { id: "limited", label: "군사 목표 한정", gain: "기본값", cost: "없음" },
      { id: "unlimited", label: "제한 없음", gain: "공격력 +12%", cost: "사기 −15, 여론 −30, 점령지 저항 높음, 상대 지원국 +1" },
    ]},
    { key: "sea", title: "해상로 차단", options: [
      { id: "none", label: "안 함", gain: "무역·중립국 관계 유지", cost: "상대 해상 보급 그대로" },
      { id: "partial", label: "부분 차단", gain: "상대 보급 매 턴 −4", cost: "내 경제 −5, 여론 −5" },
      { id: "full", label: "전면 봉쇄", gain: "상대 보급 매 턴 −8", cost: "내 경제 −15, 여론 −10, NATO 반응 +1" },
    ]},
    { key: "sanction", title: "경제제재", options: [
      { id: "impose", label: "가함", gain: "상대 보급 매 턴 −3", cost: "내 경제 −5" },
      { id: "none", label: "없음", gain: "기본값", cost: "없음" },
    ]},
  ],

  /* 방어 입장: 개전 방식 대신 대응 방식 */
  defenseResponse: { key: "method", title: "대응 방식", options: [
    { id: "counter", label: "즉시 반격", gain: "상대 첫 턴 보너스 +20% → +10%", cost: "보급 −5" },
    { id: "fortify", label: "방어선 구축", gain: "2턴 동안 방어력 +15%", cost: "국경 구역 1개를 먼저 잃고 시작" },
    { id: "talks", label: "정전 외교 우선", gain: "내 지원국 개입 +1, 정전 제안 1턴부터", cost: "첫 턴 방어력 −10%" },
  ]},

  /* 전략 카드 */
  cards: {
    frontal:  { name: "정면 돌파", icon: "⇒", offensive: true,  commit: 0.7, atk: 1.30, desc: "투입 병력이 많고 공격력이 높다. 방어 태세에 약하다.", cost: "보급 −8" },
    flank:    { name: "우회 기습", icon: "↷", offensive: true,  commit: 0.5, atk: 1.15, desc: "방어 태세를 우회한다. 공중 우세에 약하다.", cost: "보급 −12" },
    air:      { name: "공중 우세", icon: "✈", offensive: true,  commit: 0.5, atk: 1.0,  desc: "공군력만큼 공격력이 오르고 우회 기습을 막는다.", cost: "경제 −5" },
    interdict:{ name: "보급선 차단", icon: "⚓", offensive: true, commit: 0.3, atk: 0.9,  desc: "해상 통제를 높이고 상대 보급을 크게 깎는다.", cost: "공격은 약함" },
    drone:    { name: "드론 공세", icon: "◈", offensive: true, commit: 0.35, atk: 1.05, kind: "atk", desc: "자폭·정찰 드론 떼로 진지와 포대를 타격한다. 방어 태세에 강하고 공중 우세에 약하다.", cost: "보급 −4" },
    cyber:    { name: "사이버 공격", icon: "⌁", offensive: false, kind: "harass", desc: "지휘·통신망과 물류 전산을 마비시킨다. 상대 보급 −10, 사기 −3, 해군력 −20%.", cost: "경제 −3, 상대 여론 +5" },
    spy:      { name: "간첩·모략", icon: "◐", offensive: false, kind: "harass", desc: "공작원 침투와 허위 정보로 내부를 흔든다. 성공 약 60%: 상대 사기 −8, 국경 구역 수비 −30%.", cost: "실패 시 내 여론 −10" },
    defend:   { name: "방어 태세", icon: "▣", offensive: false, desc: "모든 구역 방어력 +40%, 사기·보급 회복.", cost: "이번 턴 공격 없음" },
    diplomacy:{ name: "외교 공세", icon: "✉", offensive: false, desc: "여론 +15, 내 지원국 개입 가능성.", cost: "상대 정면 돌파에 취약" },
    ceasefire:{ name: "정전 제안", icon: "☐", offensive: false, special: true, desc: "현재 전선에서 정전을 제안한다. 상대가 불리할수록 받아들인다.", cost: "거절되면 사기 −5" },
    nukeThreat:{ name: "핵 위협", icon: "☢", offensive: false, special: true, desc: "사용 없이 압박한다. 상대 사기를 크게 떨어뜨린다.", cost: "여론 −30, 상대 지원국 전원 +1" },
    nukeUse:  { name: "핵 사용 시도", icon: "☢", offensive: false, special: true, desc: "저지 판정을 거친다. 성공하면 전황과 무관하게 국제 고립 엔딩.", cost: "되돌릴 수 없음" },
  },
  cardOrder: ["frontal", "flank", "air", "drone", "interdict", "cyber", "spy", "defend", "diplomacy"],

  /* 상성: [내 카드][상대 카드] = 내 공격력 배수 */
  counters: {
    frontal: { defend: 0.7, diplomacy: 1.15 },
    flank:   { defend: 1.25, air: 0.7 },
    air:     {},
    drone:   { defend: 1.2, air: 0.75 },
    interdict: {},
  },
  counterReason: {
    "frontal>defend": "상대가 방어 태세를 택해 정면 돌파가 막혔다",
    "frontal>diplomacy": "상대가 외교에 몰두한 틈을 정면 돌파가 파고들었다",
    "flank>defend": "우회 기습이 상대 방어선을 비켜 갔다",
    "flank>air": "상대 공중 우세에 우회 부대가 노출됐다",
    "drone>defend": "드론 떼가 참호 속 진지를 위에서 타격했다",
    "drone>air": "상대 전투기와 방공망이 드론 떼를 요격했다",
  },

  combat: {
    garrisonLossK: 0.06,     // 시간당 수비 손실 = K × 공격력 × 비율
    attackerLossK: 0.035,
    defenderCommit: 0.25,    // 방어 시 야전군 투입 비율
    defendCommit: 0.5,       // 방어 태세일 때
    amphib: 0.6,             // 같은 바다 상륙
    amphibCap: 210,          // 상륙 시 투입 가능한 병력 상한(수송 한계)
    amphib2: 0.45,           // 인접 바다 경유 상륙
    contested: 0.75,         // 제해권 경합 시 추가 배수
    enemySea: 0.5,           // 상대 제해권 아래 강행 상륙 배수
    capitalDef: 1.6, coreDef: 1.3, fortDef: 1.2,
    occupyGarrison: 0.25,    // 점령 후 야전군의 몇 %를 주둔
  },

  turn: {
    supplyDecay: 3, offensiveSupply: 3, longWarAfter: 5, longWarDecay: 3,
    economyRecovery: 0.06,   // 보급 회복 = 경제 × 값
    moraleCapture: 6, moraleLose: 6, moraleCapital: 20,
    resistancePerRegion: 2,  // 제한 없음일 때 점령 구역당 보급 손실
  },

  end: {
    forcesFloor: 0.25, supplyFloor: 20, moraleFloor: 20,  // 셋 중 둘이면 전쟁 수행 불가
    safetyTurns: 12,         // 무한 진행 방지: 국제 중재(거의 발생하지 않음)
  },

  /* 외부 개입 효과 (지원하는 쪽 기준) */
  interventions: {
    US:   { name: "미국", max: 3, levels: ["관망", "정보·탄약 지원", "증원 전개·해상 지원", "직접 요격·해상 지원"] },
    NATO: { name: "NATO", max: 3, levels: ["관망", "성명·제재", "방산·사이버 지원", "해상 감시·통과"] },
    RU:   { name: "러시아", max: 2, levels: ["관망", "물자 지원", "극동 압박·유럽 견제"] },
    CNX:  { name: "중국(제3국)", max: 2, levels: ["관망", "물자 지원", "증원·중재 압박"] },
  },

  nuke: {
    unlockTurn: 3,
    threatMorale: 20, threatOpinion: 30,
    interceptBase: 0.1, interceptUS2: 0.4, interceptUS3: 0.6, interceptMissileDef: 0.15,
    mediateBase: 0.2, mediateCNX: 0.25, mediateOpinion: 0.1,
  },

  /* 에필로그 자막 문구 */
  epilogue: {
    civil: {
      protect: "민간 보호를 택해 도시 불빛 대부분이 살아남았다",
      limited: "군사 목표만 노렸지만 도시 곳곳이 어두워졌다",
      unlimited: "제한 없는 공격으로 도시가 어두워지고 피란 행렬이 길어졌다",
    },
    sea: {
      none: "해상로를 막지 않아 항구에 무역선이 돌아왔다",
      partial: "부분 차단의 여파로 항구가 절반쯤 비었다",
      full: "전면 봉쇄로 무역선이 끊겨 항구가 멈췄다",
    },
  },
};
