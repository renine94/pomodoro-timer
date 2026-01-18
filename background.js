// 뽀모도로 타이머 백그라운드 서비스 워커

// 기본 설정값
const DEFAULT_SETTINGS = {
  workTime: 25,
  shortBreak: 5,
  longBreak: 15,
  cyclesBeforeLongBreak: 4,
  soundEnabled: true,
  notificationEnabled: true
};

// 타이머 상태
let timerState = {
  mode: 'work', // 'work', 'shortBreak', 'longBreak'
  timeRemaining: DEFAULT_SETTINGS.workTime * 60, // 초 단위
  isRunning: false,
  completedCycles: 0,
  settings: { ...DEFAULT_SETTINGS }
};

// 설정 불러오기
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings', 'timerState']);
  if (result.settings) {
    timerState.settings = { ...DEFAULT_SETTINGS, ...result.settings };
  }
  if (result.timerState) {
    timerState = { ...timerState, ...result.timerState, settings: timerState.settings };
  } else {
    timerState.timeRemaining = timerState.settings.workTime * 60;
  }
}

// 상태 저장
async function saveState() {
  await chrome.storage.local.set({ timerState });
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
  saveState();

  // 1초마다 알람 생성
  chrome.alarms.create('pomodoroTick', { periodInMinutes: 1 / 60 });
}

// 타이머 일시정지
function pauseTimer() {
  timerState.isRunning = false;
  chrome.alarms.clear('pomodoroTick');
  saveState();
}

// 타이머 리셋
function resetTimer() {
  timerState.isRunning = false;
  chrome.alarms.clear('pomodoroTick');
  timerState.timeRemaining = getModeTime(timerState.mode);
  saveState();
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
  timerState.isRunning = false;
  chrome.alarms.clear('pomodoroTick');
  saveState();
}

// 모드 수동 변경
function setMode(mode) {
  timerState.mode = mode;
  timerState.timeRemaining = getModeTime(mode);
  timerState.isRunning = false;
  chrome.alarms.clear('pomodoroTick');
  saveState();
}

// 알림 표시
function showNotification() {
  if (!timerState.settings.notificationEnabled) return;

  let title, message;

  switch (timerState.mode) {
    case 'work':
      title = '작업 시간 종료!';
      message = '휴식을 취하세요.';
      break;
    case 'shortBreak':
      title = '짧은 휴식 종료!';
      message = '다시 작업을 시작하세요.';
      break;
    case 'longBreak':
      title = '긴 휴식 종료!';
      message = '새로운 사이클을 시작하세요.';
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

// 알람 이벤트 핸들러
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pomodoroTick' && timerState.isRunning) {
    timerState.timeRemaining--;

    if (timerState.timeRemaining <= 0) {
      showNotification();
      switchMode();
      // 팝업에 타이머 완료 알림
      chrome.runtime.sendMessage({ action: 'timerComplete', state: timerState }).catch(() => {});
    }

    saveState();
    // 팝업에 상태 업데이트 전송
    chrome.runtime.sendMessage({ action: 'tick', state: timerState }).catch(() => {});
  }
});

// 메시지 핸들러
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getState':
      sendResponse(timerState);
      break;

    case 'start':
      startTimer();
      sendResponse(timerState);
      break;

    case 'pause':
      pauseTimer();
      sendResponse(timerState);
      break;

    case 'reset':
      resetTimer();
      sendResponse(timerState);
      break;

    case 'setMode':
      setMode(message.mode);
      sendResponse(timerState);
      break;

    case 'saveSettings':
      saveSettings(message.settings);
      // 현재 모드의 시간도 업데이트
      if (!timerState.isRunning) {
        timerState.timeRemaining = getModeTime(timerState.mode);
      }
      saveState();
      sendResponse(timerState);
      break;

    case 'getSettings':
      sendResponse(timerState.settings);
      break;
  }

  return true; // 비동기 응답을 위해 true 반환
});

// 초기화
loadSettings();
