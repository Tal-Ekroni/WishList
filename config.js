// ============================================================
//  Wishes — couple config
//  Edit this file once. Both of you use the same deployed app.
// ============================================================

// The two people. `key` must stay "her" and "him" (used in DB rules).
// `email` = the Google account each of you signs in with.
// `birthday` = "MM-DD" (month-day), used for the countdown.
export const PEOPLE = [
  { key: "her", name: "Ronny", email: "ronny6633@gmail.com", birthday: "11-24", emoji: "💝" },
  { key: "him", name: "Tal", email: "talekroni01@gmail.com", birthday: "06-18", emoji: "🎯" },
];

export const CURRENCY = "₪"; // shown next to prices

// Firebase web config. Leave `null` to run in LOCAL MODE
// (data stays on this device only, no sign-in — good for trying it out).
// To sync between your phones, follow README.md → "Setup (10 min)".
export const firebaseConfig = {
  apiKey: "AIzaSyBuDCQyRWXgRvljTcutpH7NURL3ABi0UbA",
  authDomain: "wishes-c473a.firebaseapp.com",
  projectId: "wishes-c473a",
  storageBucket: "wishes-c473a.firebasestorage.app",
  messagingSenderId: "597591229694",
  appId: "1:597591229694:web:d18bfbc8e5c4be556d11af",
};
/* Example:
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "wishes-xxxx.firebaseapp.com",
  projectId: "wishes-xxxx",
  storageBucket: "wishes-xxxx.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
};
*/
