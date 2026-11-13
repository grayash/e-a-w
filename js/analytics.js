/* 방문 통계: Google Analytics for Firebase (프로젝트 e-a-w-9eb1f)
   익명 방문·게임 시작/종료 수만 집계한다. 이름·이메일 같은 개인 정보는 보내지 않는다.
   아래 설정값은 공개용 식별자이며 비밀 키가 아니다. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, logEvent, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCHut4XdHUubDxLTB7rK8foJg-wYgEAMuE",
  authDomain: "e-a-w-9eb1f.firebaseapp.com",
  projectId: "e-a-w-9eb1f",
  storageBucket: "e-a-w-9eb1f.firebasestorage.app",
  messagingSenderId: "421349886522",
  appId: "1:421349886522:web:d27d872b30091c5d3b4303",
  measurementId: "G-4DLNWHFTBH",
};

try {
  if (await isSupported()) {
    const analytics = getAnalytics(initializeApp(firebaseConfig));
    // 게임 화면에서 부르는 집계 함수 (실패해도 게임에는 영향 없음)
    window.track = (name, params) => { try { logEvent(analytics, name, params || {}); } catch (e) {} };
  }
} catch (e) { /* 통계를 쓸 수 없는 환경이면 조용히 넘어간다 */ }
