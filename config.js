// ============================================================
//  Wishes — couple config
//  Edit this file once. Both of you use the same deployed app.
// ============================================================

// The two people. `key` must stay "her" and "him" (used in DB rules).
// `email` = the Google account each of you signs in with.
// `birthday` = "MM-DD" (month-day), used for the countdown.
export const PEOPLE = [
  { key: "her", name: "Wife", email: "HER_EMAIL@gmail.com", birthday: "01-01", emoji: "💝" },
  { key: "him", name: "Husband", email: "HIS_EMAIL@gmail.com", birthday: "01-01", emoji: "🎯" },
];

export const CURRENCY = "₪"; // shown next to prices

// Firebase web config. Leave `null` to run in LOCAL MODE
// (data stays on this device only, no sign-in — good for trying it out).
// To sync between your phones, follow README.md → "Setup (10 min)".
export const firebaseConfig = null;
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
