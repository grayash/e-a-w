/* Firebase 공통 설정 (프로젝트 e-a-w-9eb1f). 아래 값은 공개용 식별자이며 비밀 키가 아니다.
   접근 제한은 firestore.rules 가 맡는다. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

export const firebaseConfig = {
  apiKey: "AIzaSyCHut4XdHUubDxLTB7rK8foJg-wYgEAMuE",
  authDomain: "e-a-w-9eb1f.firebaseapp.com",
  projectId: "e-a-w-9eb1f",
  storageBucket: "e-a-w-9eb1f.firebasestorage.app",
  messagingSenderId: "421349886522",
  appId: "1:421349886522:web:d27d872b30091c5d3b4303",
  measurementId: "G-4DLNWHFTBH",
};
export const app = initializeApp(firebaseConfig);
