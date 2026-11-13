/* 의견 보내기: 「먼저 온 답장」과 같은 방식
   - 보낼 때만 익명 로그인한다(이름·이메일을 받지 않음)
   - Firestore feedback 컬렉션에 쓰기만 된다. 읽기는 Firebase 콘솔에서 만든 사람만 (firestore.rules)
   - 한 기기에서 1분에 한 번만 보낼 수 있다(rate 문서를 같은 묶음에 함께 써야 규칙을 통과) */
import { app } from "./firebase.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const auth = getAuth(app);
const db = getFirestore(app);

let uidP = null;
const uid = () => uidP || (uidP = new Promise((resolve, reject) => {
  const off = onAuthStateChanged(auth, async (u) => {
    if (u) { off(); resolve(u.uid); return; }
    try { await signInAnonymously(auth); } catch (e) { off(); uidP = null; reject(e); }
  });
}));

// 욕설·비하·광고만 거른다. 연락처는 답장을 받으려는 사람이 적을 수 있으니 막지 않는다.
const ABUSE = ["시발", "씨발", "씨바", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "븅신", "좆", "좃같", "개새끼", "개새", "지랄", "ㅈㄹ", "꺼져", "느금", "니애미",
  "애미", "애비뒤", "창녀", "걸레년", "썅", "쌍년", "쌍놈", "미친년", "미친놈", "한남충", "김치녀", "된장녀", "틀딱", "급식충", "맘충", "짱깨", "쪽바리",
  "깜둥이", "똥남아", "전라디언", "장애인같", "정신병자", "섹스", "야동", "강간"];
const ADS = [/대출\s*(상담|문의|가능|승인|해\s*드)/, /도박|바카라|카지노|토토|슬롯/, /수익\s*보장|고수익|부업\s*문의|재택\s*알바|투자\s*리딩|리딩방/, /무료\s*상담|최저가|할인\s*코드|쿠폰\s*코드/];
const squash = (s) => String(s).toLowerCase().replace(/[\s.\-_*~!?,]/g, "");
function blocked(t) {
  if (ABUSE.some((w) => squash(t).includes(w))) return L("욕설이나 비하 표현이 들어 있어 보낼 수 없어요.");
  if (ADS.some((re) => re.test(t))) return L("광고로 보이는 글은 보낼 수 없어요.");
  if (/(.)\1{9,}/.test(t)) return L("같은 글자가 너무 많이 반복돼요.");
  return null;
}

window.sendFeedback = async (raw, meta) => {
  const text = String(raw || "").trim().slice(0, 1000);
  if (text.length < 2) return { error: L("내용을 적어 주세요.") };
  const bad = blocked(text);
  if (bad) return { error: bad };
  try {
    const u = await uid();
    const batch = writeBatch(db);
    batch.set(doc(collection(db, "feedback")), { text, ver: String((meta && meta.ver) || "").slice(0, 20), at: serverTimestamp() });
    batch.set(doc(db, "rate", u + "_fb"), { t: serverTimestamp() }); // 1분에 한 번만
    await batch.commit();
    return { ok: true };
  } catch (e) {
    return { error: e.code === "permission-denied" ? L("잠시 뒤에 다시 보내 주세요. 1분에 한 번 보낼 수 있어요.") : L("보내지 못했어요. 잠시 뒤 다시 해 주세요.") };
  }
};
