/* 방문 통계: Google Analytics for Firebase
   익명 방문·게임 시작/종료 수만 집계한다. 이름·연락처 같은 개인 정보는 보내지 않는다. */
import { app } from "./firebase.js";
import { getAnalytics, logEvent, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

try {
  if (await isSupported()) {
    const analytics = getAnalytics(app);
    // 게임 화면에서 부르는 집계 함수 (실패해도 게임에는 영향 없음)
    window.track = (name, params) => { try { logEvent(analytics, name, params || {}); } catch (e) {} };
  }
} catch (e) { /* 통계를 쓸 수 없는 환경이면 조용히 넘어간다 */ }
