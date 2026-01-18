// 뽀모도로 타이머 백그라운드 서비스 워커

// 기본 설정값
const DEFAULT_SETTINGS = {
  workTime: 25,
  shortBreak: 5,
  longBreak: 15,
  cyclesBeforeLongBreak: 4,
  soundEnabled: true,
  notificationEnabled: true,
  autoStartEnabled: false
};

// 타이머 상태
let timerState = {
  mode: 'work', // 'work', 'shortBreak', 'longBreak'
  timeRemaining: DEFAULT_SETTINGS.workTime * 60, // 초 단위
  totalTime: DEFAULT_SETTINGS.workTime * 60, // 전체 시간 (진행률 계산용)
  isRunning: false,
  completedCycles: 0,
  settings: { ...DEFAULT_SETTINGS }
};

// 세션 통계
let statistics = {
  todayCompletedCycles: 0,
  todayWorkMinutes: 0,
  lastDate: new Date().toDateString()
};

// 타이머 인터벌 ID
let timerInterval = null;

// 저장 쓰로틀링
let saveTimeout = null;
const SAVE_THROTTLE_MS = 5000;

// 설정 불러오기
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings', 'timerState', 'statistics']);
  if (result.settings) {
    timerState.settings = { ...DEFAULT_SETTINGS, ...result.settings };
  }
  if (result.timerState) {
    timerState = { ...timerState, ...result.timerState, settings: timerState.settings };
  } else {
    timerState.timeRemaining = timerState.settings.workTime * 60;
    timerState.totalTime = timerState.settings.workTime * 60;
  }
  if (result.statistics) {
    statistics = { ...statistics, ...result.statistics };
    // 날짜가 바뀌었으면 오늘 통계 리셋
    if (statistics.lastDate !== new Date().toDateString()) {
      statistics.todayCompletedCycles = 0;
      statistics.todayWorkMinutes = 0;
      statistics.lastDate = new Date().toDateString();
    }
  }
}

// 상태 저장 (쓰로틀링 적용)
function saveState() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(async () => {
    await chrome.storage.local.set({ timerState, statistics });
    saveTimeout = null;
  }, SAVE_THROTTLE_MS);
}

// 상태 즉시 저장 (중요한 상태 변경 시)
async function saveStateImmediate() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  await chrome.storage.local.set({ timerState, statistics });
}

// 설정 저장
async function saveSettings(settings) {
  timerState.settings = { ...DEFAULT_SETTINGS, ...settings };
  await chrome.storage.local.set({ settings: timerState.settings });
}

// 타이머 시작
function startTimer() {
  if (timerState.isRunning) return;

  timerState.isRunning = true;
  saveStateImmediate();

  // 기존 interval 정리 (중복 실행 방지)
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // setInterval 사용 (1초마다)
  timerInterval = setInterval(() => {
    timerTick();
  }, 1000);

  // 서비스 워커 유지를 위한 keep-alive
  keepAlive();
}

// 타이머 틱 처리
function timerTick() {
  if (!timerState.isRunning) return;

  timerState.timeRemaining--;

  // 작업 모드일 때 작업 시간 통계 업데이트
  if (timerState.mode === 'work') {
    statistics.todayWorkMinutes += 1 / 60;
  }

  if (timerState.timeRemaining <= 0) {
    // 모드 변경 전에 현재 모드 저장
    const completedMode = timerState.mode;

    // 작업 모드 완료 시 통계 업데이트
    if (completedMode === 'work') {
      statistics.todayCompletedCycles++;
    }

    switchMode();

    // 알림은 완료된 모드 기준으로 표시
    showNotification(completedMode);

    // 팝업에 타이머 완료 알림
    chrome.runtime.sendMessage({
      action: 'timerComplete',
      state: timerState,
      statistics: statistics
    }).catch(() => {});
  } else {
    saveState();
    // 팝업에 상태 업데이트 전송
    chrome.runtime.sendMessage({
      action: 'tick',
      state: timerState,
      statistics: statistics
    }).catch(() => {});
  }
}

// 서비스 워커 keep-alive
function keepAlive() {
  // 25초마다 자신에게 메시지를 보내 서비스 워커 활성 유지
  if (timerState.isRunning) {
    setTimeout(() => {
      if (timerState.isRunning) {
        chrome.runtime.sendMessage({ action: 'keepAlive' }).catch(() => {});
        keepAlive();
      }
    }, 25000);
  }
}

// 타이머 일시정지
function pauseTimer() {
  timerState.isRunning = false;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  saveStateImmediate();
}

// 타이머 리셋
function resetTimer() {
  timerState.isRunning = false;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerState.timeRemaining = getModeTime(timerState.mode);
  timerState.totalTime = getModeTime(timerState.mode);
  saveStateImmediate();
}

// 모드에 따른 시간 반환
function getModeTime(mode) {
  switch (mode) {
    case 'work':
      return timerState.settings.workTime * 60;
    case 'shortBreak':
      return timerState.settings.shortBreak * 60;
    case 'longBreak':
      return timerState.settings.longBreak * 60;
    default:
      return timerState.settings.workTime * 60;
  }
}

// 모드 전환
function switchMode() {
  if (timerState.mode === 'work') {
    timerState.completedCycles++;

    if (timerState.completedCycles >= timerState.settings.cyclesBeforeLongBreak) {
      timerState.mode = 'longBreak';
      timerState.completedCycles = 0;
    } else {
      timerState.mode = 'shortBreak';
    }
  } else {
    timerState.mode = 'work';
  }

  timerState.timeRemaining = getModeTime(timerState.mode);
  timerState.totalTime = getModeTime(timerState.mode);

  // 자동 시작이 활성화되어 있으면 타이머 자동 시작
  if (timerState.settings.autoStartEnabled) {
    timerState.isRunning = true;
    if (timerInterval) {
      clearInterval(timerInterval);
    }
    timerInterval = setInterval(() => {
      timerTick();
    }, 1000);
    keepAlive();
  } else {
    timerState.isRunning = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  saveStateImmediate();
}

// 모드 수동 변경
function setMode(mode) {
  timerState.mode = mode;
  timerState.timeRemaining = getModeTime(mode);
  timerState.totalTime = getModeTime(mode);
  timerState.isRunning = false;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  saveStateImmediate();
}

// 알림 표시
async function showNotification(completedMode) {
  // 소리 재생 (offscreen document 사용)
  if (timerState.settings.soundEnabled) {
    await playSound();
  }

  // 브라우저 알림 표시
  if (!timerState.settings.notificationEnabled) return;

  let title, message;

  switch (completedMode) {
    case 'work':
      title = chrome.i18n.getMessage('notifWorkEnd');
      message = chrome.i18n.getMessage('notifWorkEndMsg');
      break;
    case 'shortBreak':
      title = chrome.i18n.getMessage('notifShortBreakEnd');
      message = chrome.i18n.getMessage('notifShortBreakEndMsg');
      break;
    case 'longBreak':
      title = chrome.i18n.getMessage('notifLongBreakEnd');
      message = chrome.i18n.getMessage('notifLongBreakEndMsg');
      break;
  }

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
    priority: 2
  });
}

// Offscreen document를 통한 소리 재생
let creatingOffscreen = null;

async function setupOffscreenDocument() {
  const offscreenUrl = 'offscreen.html';

  // 이미 offscreen document가 있는지 확인
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(offscreenUrl)]
  });

  if (existingContexts.length > 0) {
    return;
  }

  // 이미 생성 중인 경우 대기
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  // Offscreen document 생성
  creatingOffscreen = chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: ['AUDIO_PLAYBACK'],
    justification: '타이머 완료 알림 소리 재생'
  });

  await creatingOffscreen;
  creatingOffscreen = null;
}

async function playSound() {
  try {
    await setupOffscreenDocument();
    await chrome.runtime.sendMessage({ action: 'playSound' });
  } catch (error) {
    console.error('소리 재생 실패:', error);
  }
}

// 메시지 핸들러
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getState':
      sendResponse({ state: timerState, statistics: statistics });
      break;

    case 'start':
      startTimer();
      sendResponse({ state: timerState, statistics: statistics });
      break;

    case 'pause':
      pauseTimer();
      sendResponse({ state: timerState, statistics: statistics });
      break;

    case 'reset':
      resetTimer();
      sendResponse({ state: timerState, statistics: statistics });
      break;

    case 'setMode':
      setMode(message.mode);
      sendResponse({ state: timerState, statistics: statistics });
      break;

    case 'saveSettings':
      saveSettings(message.settings);
      // 현재 모드의 시간도 업데이트
      if (!timerState.isRunning) {
        timerState.timeRemaining = getModeTime(timerState.mode);
        timerState.totalTime = getModeTime(timerState.mode);
      }
      saveStateImmediate();
      sendResponse({ state: timerState, statistics: statistics });
      break;

    case 'getSettings':
      sendResponse(timerState.settings);
      break;

    case 'keepAlive':
      // keep-alive 메시지 - 아무 작업 없음
      break;
  }

  return true; // 비동기 응답을 위해 true 반환
});

// 초기화
async function init() {
  await loadSettings();

  // 서비스 워커 재시작 시 타이머가 실행 중이었다면 interval 복원
  if (timerState.isRunning) {
    // 기존 interval 정리
    if (timerInterval) {
      clearInterval(timerInterval);
    }

    timerInterval = setInterval(() => {
      timerTick();
    }, 1000);

    keepAlive();
  }
}

init();
