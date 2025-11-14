"use strict";

// ---- ストレージキー ----
const STORAGE_KEY_STEPS = "ttsStepTimer_steps_v1";
const STORAGE_KEY_LOGS = "ttsStepTimer_logs_v1";
const STORAGE_KEY_PRESETS = "ttsStepTimer_presets_v1";
const STORAGE_KEY_REPEAT = "ttsStepTimer_repeatCount_v1";

// ステート
let steps = [];          // UI上の「1セット分」のステップ
let logs = [];
let presets = [];
let runSteps = [];       // 実際に再生する展開済みステップ（steps × セット数）
let repeatCount = 1;     // セット数
let currentStepIndex = -1;
let remainingSeconds = 0;
let timerIntervalId = null;

// TTS
let voices = [];
let ttsSupported = "speechSynthesis" in window;

// DOM取得
const currentStepTitleEl = document.getElementById("current-step-title");
const currentStepStatusEl = document.getElementById("current-step-status");
const timerDisplayEl = document.getElementById("timer-display");
const timerLabelEl = document.getElementById("timer-label");
const ttsWarningEl = document.getElementById("tts-support-warning");

const startBtn = document.getElementById("start-btn");
const pauseBtn = document.getElementById("pause-btn");
const resetBtn = document.getElementById("reset-btn");
const skipBtn = document.getElementById("skip-btn");
const testVoiceBtn = document.getElementById("test-voice-btn");

const addStepForm = document.getElementById("add-step-form");
const stepNameInput = document.getElementById("step-name-input");
const stepSecondsInput = document.getElementById("step-seconds-input");
const stepsListEl = document.getElementById("steps-list");
const noStepsMessageEl = document.getElementById("no-steps-message");

const repeatCountInput = document.getElementById("repeat-count-input");

const savePresetForm = document.getElementById("save-preset-form");
const presetNameInput = document.getElementById("preset-name-input");
const presetsListEl = document.getElementById("presets-list");
const noPresetsMessageEl = document.getElementById("no-presets-message");

const logsListEl = document.getElementById("logs-list");
const noLogsMessageEl = document.getElementById("no-logs-message");
const clearLogsBtn = document.getElementById("clear-logs-btn");
const todayTotalEl = document.getElementById("today-total");

// ---- デフォルトプリセット（初回のみ） ----
const DEFAULT_PRESETS = [
  {
    id: "default-housework",
    name: "家事ルーティン",
    steps: [
      { name: "洗い物をする", seconds: 300 },
      { name: "机を片付ける", seconds: 180 },
      { name: "床を掃除する", seconds: 300 },
      { name: "ゴミをまとめる", seconds: 180 }
    ]
  },
  {
    id: "default-workout",
    name: "筋トレルーティン",
    steps: [
      { name: "スクワット", seconds: 60 },
      { name: "腕立て伏せ", seconds: 45 },
      { name: "プランク", seconds: 45 },
      { name: "ストレッチ", seconds: 120 }
    ]
  },
  {
    id: "default-study",
    name: "勉強ルーティン",
    steps: [
      { name: "集中勉強タイム", seconds: 1500 },
      { name: "休憩", seconds: 300 },
      { name: "復習タイム", seconds: 900 }
    ]
  }
];

// -------- ユーティリティ --------
function pad2(n) {
  return n.toString().padStart(2, "0");
}

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function formatSeconds(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatDurationJa(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}時間`);
  if (m > 0) parts.push(`${m}分`);
  if (s > 0 || parts.length === 0) parts.push(`${s}秒`);
  return parts.join("");
}

// -------- TTS 関連 --------
function initVoices() {
  if (!ttsSupported) {
    ttsWarningEl.classList.remove("hidden");
    return;
  }
  voices = window.speechSynthesis.getVoices() || [];
  if (voices.length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      voices = window.speechSynthesis.getVoices() || [];
    };
  }
}

function getJapaneseVoice() {
  if (!ttsSupported) return null;
  if (!voices || voices.length === 0) {
    voices = window.speechSynthesis.getVoices() || [];
  }
  const jaVoice = voices.find(
    (v) => v.lang && v.lang.toLowerCase().startsWith("ja")
  );
  return jaVoice || null;
}

function speak(text, onEnd) {
  if (!ttsSupported) {
    if (typeof onEnd === "function") onEnd();
    return;
  }
  const utter = new SpeechSynthesisUtterance(text);
  const jaVoice = getJapaneseVoice();
  if (jaVoice) {
    utter.voice = jaVoice;
  }
  utter.rate = 1;
  utter.pitch = 1;
  utter.volume = 1;

  if (typeof onEnd === "function") {
    utter.onend = onEnd;
  }

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

// -------- localStorage 関連 --------
function saveStepsToStorage() {
  try {
    const data = JSON.stringify(steps);
    localStorage.setItem(STORAGE_KEY_STEPS, data);
  } catch (e) {
    console.warn("ステップの保存に失敗しました", e);
  }
}

function loadStepsFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_STEPS);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (s) =>
          s &&
          typeof s.name === "string" &&
          Number.isFinite(Number(s.seconds))
      )
      .map((s) => ({
        name: s.name,
        seconds: Math.max(1, Math.floor(Number(s.seconds)))
      }));
  } catch (e) {
    console.warn("ステップの読み込みに失敗しました", e);
    return [];
  }
}

function saveLogsToStorage() {
  try {
    const data = JSON.stringify(logs);
    localStorage.setItem(STORAGE_KEY_LOGS, data);
  } catch (e) {
    console.warn("ログの保存に失敗しました", e);
  }
}

function loadLogsFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_LOGS);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.warn("ログの読み込みに失敗しました", e);
    return [];
  }
}

function savePresetsToStorage() {
  try {
    const data = JSON.stringify(presets);
    localStorage.setItem(STORAGE_KEY_PRESETS, data);
  } catch (e) {
    console.warn("プリセットの保存に失敗しました", e);
  }
}

function loadPresetsFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_PRESETS);
    if (!data) {
      return DEFAULT_PRESETS.map((p) => ({
        id: p.id,
        name: p.name,
        steps: p.steps.map((s) => ({
          name: s.name,
          seconds: s.seconds
        }))
      }));
    }
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p) =>
          p &&
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          Array.isArray(p.steps)
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        steps: p.steps
          .filter(
            (s) =>
              s &&
              typeof s.name === "string" &&
              Number.isFinite(Number(s.seconds))
          )
          .map((s) => ({
            name: s.name,
            seconds: Math.max(1, Math.floor(Number(s.seconds)))
          }))
      }));
  } catch (e) {
    console.warn("プリセットの読み込みに失敗しました", e);
    return [];
  }
}

function saveRepeatCountToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY_REPEAT, String(repeatCount));
  } catch (e) {
    console.warn("セット数の保存に失敗しました", e);
  }
}

function loadRepeatCountFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REPEAT);
    if (!raw) return 1;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.min(20, Math.floor(n));
  } catch (e) {
    console.warn("セット数の読み込みに失敗しました", e);
    return 1;
  }
}

// -------- タイマー表示 --------
function updateTimerDisplay() {
  timerDisplayEl.textContent = formatSeconds(remainingSeconds);
}

// -------- ステップ制御 --------
function renderSteps() {
  stepsListEl.innerHTML = "";

  if (steps.length === 0) {
    noStepsMessageEl.classList.remove("hidden");
    return;
  }
  noStepsMessageEl.classList.add("hidden");

  steps.forEach((step, index) => {
    const li = document.createElement("li");
    li.className = "step-item";

    const indexBadge = document.createElement("div");
    indexBadge.className = "step-index-badge";
    indexBadge.textContent = index + 1;

    const main = document.createElement("div");
    main.className = "step-main";

    const title = document.createElement("div");
    title.className = "step-title";
    title.textContent = step.name;

    const meta = document.createElement("div");
    meta.className = "step-meta";
    meta.textContent = `${step.seconds} 秒`;

    main.appendChild(title);
    main.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "step-actions";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "step-delete-btn";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", () => {
      deleteStep(index);
    });

    actions.appendChild(deleteBtn);

    li.appendChild(indexBadge);
    li.appendChild(main);
    li.appendChild(actions);

    stepsListEl.appendChild(li);
  });
