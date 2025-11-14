"use strict";

// ---- ストレージキー ----
const STORAGE_KEY_STEPS = "ttsStepTimer_steps_v1";
const STORAGE_KEY_LOGS = "ttsStepTimer_logs_v1";
const STORAGE_KEY_PRESETS = "ttsStepTimer_presets_v1";

// ステート
let steps = [];
let logs = [];
let presets = [];
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

  window.speechSynthesis.cancel(); // 前の読み上げを止める
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
      // 初回はデフォルトプリセットをそのまま使う
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
}

function deleteStep(index) {
  steps.splice(index, 1);
  saveStepsToStorage();

  stopTimer();
  currentStepIndex = -1;
  remainingSeconds = 0;
  updateTimerDisplay();
  updateCurrentStepInfoIdle();
  renderSteps();
}

function updateCurrentStepInfoIdle() {
  if (steps.length === 0) {
    currentStepTitleEl.textContent = "まだ開始していません";
    currentStepStatusEl.textContent =
      "ステップを作成して、スタートを押してください。";
  } else {
    currentStepTitleEl.textContent = "準備完了";
    currentStepStatusEl.textContent = "スタートでステップ1から開始します。";
  }
}

function updateCurrentStepInfoRunning() {
  if (currentStepIndex < 0 || currentStepIndex >= steps.length) return;
  const step = steps[currentStepIndex];
  currentStepTitleEl.textContent = `ステップ ${currentStepIndex + 1}：${step.name}`;
  currentStepStatusEl.textContent = `残り ${remainingSeconds} 秒`;
}

function updateCurrentStepInfoFinished() {
  currentStepTitleEl.textContent = "完了";
  currentStepStatusEl.textContent = "全てのステップが終了しました。";
}

// -------- プリセット表示 --------
function renderPresets() {
  presetsListEl.innerHTML = "";

  if (!presets || presets.length === 0) {
    noPresetsMessageEl.classList.remove("hidden");
    return;
  }
  noPresetsMessageEl.classList.add("hidden");

  presets.forEach((preset) => {
    const li = document.createElement("li");
    li.className = "preset-item";

    const main = document.createElement("div");
    main.className = "preset-main";

    const title = document.createElement("div");
    title.className = "preset-title";
    title.textContent = preset.name;

    const totalSteps = preset.steps.length;
    const totalSeconds = preset.steps.reduce(
      (sum, s) => sum + (Number(s.seconds) || 0),
      0
    );

    const meta = document.createElement("div");
    meta.className = "preset-meta";
    meta.textContent = `${totalSteps}ステップ / 合計 ${formatSeconds(
      totalSeconds
    )}`;

    main.appendChild(title);
    main.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "preset-actions";

    const loadBtn = document.createElement("button");
    loadBtn.className = "preset-load-btn";
    loadBtn.textContent = "読込";
    loadBtn.addEventListener("click", () => {
      applyPreset(preset.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "preset-delete-btn";
    deleteBtn.textContent = "削除";
    deleteBtn.addEventListener("click", () => {
      deletePreset(preset.id);
    });

    actions.appendChild(loadBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(main);
    li.appendChild(actions);
    presetsListEl.appendChild(li);
  });
}

function applyPreset(presetId) {
  const preset = presets.find((p) => p.id === presetId);
  if (!preset) return;

  const ok = window.confirm(
    `"${preset.name}" の内容で現在のステップを上書きします。よろしいですか？`
  );
  if (!ok) return;

  stopTimer();
  if (ttsSupported) {
    window.speechSynthesis.cancel();
  }
  currentStepIndex = -1;
  remainingSeconds = 0;
  updateTimerDisplay();
  timerLabelEl.textContent = "残り時間";

  steps = preset.steps.map((s) => ({
    name: s.name,
    seconds: s.seconds
  }));

  saveStepsToStorage();
  renderSteps();
  updateCurrentStepInfoIdle();
}

function deletePreset(presetId) {
  const preset = presets.find((p) => p.id === presetId);
  if (!preset) return;

  const ok = window.confirm(
    `プリセット "${preset.name}" を削除します。よろしいですか？`
  );
  if (!ok) return;

  presets = presets.filter((p) => p.id !== presetId);
  savePresetsToStorage();
  renderPresets();
}

// -------- ログ表示／集計 --------
function renderLogs() {
  logsListEl.innerHTML = "";

  if (!logs || logs.length === 0) {
    noLogsMessageEl.classList.remove("hidden");
    updateTodayTotal();
    return;
  }
  noLogsMessageEl.classList.add("hidden");

  logs.forEach((log) => {
    const li = document.createElement("li");
    li.className = "log-item";

    const main = document.createElement("div");
    main.className = "log-main";

    const totalSec = Number(log.totalSeconds) || 0;
    const totalSteps = Number(log.totalSteps) || 0;
    const title = log.title || "ステップタイマー";

    main.textContent = `${title}（${totalSteps}ステップ / ${formatSeconds(
      totalSec
    )}）`;

    const meta = document.createElement("div");
    meta.className = "log-meta";

    const timePart = log.time || "";
    const memoPart =
      log.memo && log.memo.trim() ? `メモ：${log.memo.trim()}` : "";

    meta.textContent = memoPart ? `${timePart}　${memoPart}` : timePart;

    li.appendChild(main);
    li.appendChild(meta);
    logsListEl.appendChild(li);
  });

  updateTodayTotal();
}

function updateTodayTotal() {
  const todayISO = getTodayISO();
  if (!logs || logs.length === 0) {
    todayTotalEl.textContent = "今日の合計：0秒";
    return;
  }

  let totalSecondsToday = 0;
  let count = 0;
  logs.forEach((log) => {
    if (log.dateISO === todayISO) {
      totalSecondsToday += Number(log.totalSeconds) || 0;
      count += 1;
    }
  });

  if (count === 0) {
    todayTotalEl.textContent = "今日の合計：0秒";
  } else {
    todayTotalEl.textContent = `今日の合計：${formatDurationJa(
      totalSecondsToday
    )}（${count}セッション）`;
  }
}

function addLogEntry() {
  if (steps.length === 0) return;

  const totalSteps = steps.length;
  const totalSeconds = steps.reduce((sum, s) => sum + s.seconds, 0);
  const title = steps[0]?.name || "ステップタイマー";

  const now = new Date();
  const timeString = `${now.getFullYear()}/${pad2(
    now.getMonth() + 1
  )}/${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(
    now.getMinutes()
  )}`;

  // メモ入力（任意）
  const memo = window.prompt(
    "今回のセッションのメモを入力（任意・空欄可）：",
    ""
  );

  const entry = {
    title,
    totalSteps,
    totalSeconds,
    time: timeString,
    dateISO: getTodayISO(),
    memo: memo || ""
  };

  logs.unshift(entry);
  if (logs.length > 20) {
    logs = logs.slice(0, 20);
  }
  saveLogsToStorage();
  renderLogs();
}

// -------- タイマー処理 --------
function startCountdown() {
  stopTimer();
  timerLabelEl.textContent = "残り時間";
  timerIntervalId = window.setInterval(() => {
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      remainingSeconds = 0;
      updateTimerDisplay();
      stopTimer();
      goToNextStep();
    } else {
      updateTimerDisplay();
      updateCurrentStepInfoRunning();
    }
  }, 1000);
}

function stopTimer() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function startStep(index) {
  if (index < 0 || index >= steps.length) return;

  currentStepIndex = index;
  const step = steps[currentStepIndex];
  remainingSeconds = step.seconds;
  updateTimerDisplay();

  timerLabelEl.textContent = "読み上げ中...";
  updateCurrentStepInfoRunning();

  const message = `ステップ${currentStepIndex + 1}。${step.name}を開始します。時間は${step.seconds}秒です。`;

  speak(message, () => {
    if (currentStepIndex !== index || steps.length === 0) return;
    startCountdown();
  });
}

function goToNextStep() {
  const nextIndex = currentStepIndex + 1;
  if (nextIndex < steps.length) {
    startStep(nextIndex);
  } else {
    currentStepIndex = -1;
    timerLabelEl.textContent = "完了";
    updateCurrentStepInfoFinished();
    speak("全てのステップが完了しました。お疲れさまでした。");

    addLogEntry();
  }
}

// -------- イベントハンドラ --------
addStepForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = stepNameInput.value.trim();
  const seconds = Number(stepSecondsInput.value);

  if (!name) {
    alert("作業名を入力してください。");
    return;
  }
  if (!Number.isFinite(seconds) || seconds <= 0) {
    alert("時間は1秒以上で入力してください。");
    return;
  }

  steps.push({
    name,
    seconds: Math.floor(seconds)
  });

  stepNameInput.value = "";
  stepSecondsInput.value = "60";

  saveStepsToStorage();
  renderSteps();
  updateCurrentStepInfoIdle();
});

startBtn.addEventListener("click", () => {
  if (steps.length === 0) {
    alert(
      "まずステップを追加するか、プリセットから読み込んでください。"
    );
    return;
  }

  if (currentStepIndex >= 0 && remainingSeconds > 0 && timerIntervalId === null) {
    startCountdown();
    updateCurrentStepInfoRunning();
    return;
  }

  startStep(0);
});

pauseBtn.addEventListener("click", () => {
  stopTimer();
  if (ttsSupported) {
    window.speechSynthesis.cancel();
  }
  if (currentStepIndex >= 0 && currentStepIndex < steps.length) {
    currentStepStatusEl.textContent = "一時停止中";
  }
});

resetBtn.addEventListener("click", () => {
  stopTimer();
  if (ttsSupported) {
    window.speechSynthesis.cancel();
  }
  currentStepIndex = -1;
  remainingSeconds = 0;
  updateTimerDisplay();
  timerLabelEl.textContent = "残り時間";
  updateCurrentStepInfoIdle();
});

skipBtn.addEventListener("click", () => {
  if (steps.length === 0) return;
  if (currentStepIndex === -1) {
    startStep(0);
    return;
  }
  stopTimer();
  if (ttsSupported) {
    window.speechSynthesis.cancel();
  }
  goToNextStep();
});

testVoiceBtn.addEventListener("click", () => {
  const sampleText =
    "これはテストです。ステップ読み上げタイマーの音声確認を行っています。";
  speak(sampleText);
});

// プリセット保存
savePresetForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = presetNameInput.value.trim();
  if (!name) {
    alert("プリセット名を入力してください。");
    return;
  }
  if (steps.length === 0) {
    alert("保存するステップがありません。");
    return;
  }

  const existingIndex = presets.findIndex((p) => p.name === name);
  if (existingIndex >= 0) {
    const ok = window.confirm(
      `同じ名前のプリセット "${name}" が存在します。上書きしますか？`
    );
    if (!ok) return;

    presets[existingIndex].steps = steps.map((s) => ({
      name: s.name,
      seconds: s.seconds
    }));
  } else {
    const id = `user-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    presets.push({
      id,
      name,
      steps: steps.map((s) => ({
        name: s.name,
        seconds: s.seconds
      }))
    });
  }

  presetNameInput.value = "";
  savePresetsToStorage();
  renderPresets();
});

// 履歴削除
clearLogsBtn.addEventListener("click", () => {
  if (!logs || logs.length === 0) return;
  const ok = window.confirm("履歴をすべて削除します。よろしいですか？");
  if (!ok) return;
  logs = [];
  saveLogsToStorage();
  renderLogs();
});

// 初期化
window.addEventListener("load", () => {
  initVoices();
  steps = loadStepsFromStorage();
  logs = loadLogsFromStorage();
  presets = loadPresetsFromStorage();

  updateTimerDisplay();
  renderSteps();
  renderPresets();
  renderLogs();
  updateCurrentStepInfoIdle();
});
