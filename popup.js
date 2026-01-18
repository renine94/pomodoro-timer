// 뽀모도로 타이머 팝업 로직

// DOM 요소
const container = document.getElementById('container');
const mainScreen = document.getElementById('mainScreen');
const settingsScreen = document.getElementById('settingsScreen');
const minutesDisplay = document.getElementById('minutes');
const secondsDisplay = document.getElementById('seconds');
const cycleText = document.getElementById('cycleText');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const settingsBtn = document.getElementById('settingsBtn');
const backBtn = document.getElementById('backBtn');
const saveBtn = document.getElementById('saveBtn');
const modeTabsContainer = document.querySelector('.mode-tabs');
const progressCircle = document.querySelector('.progress-ring-circle');
const toast = document.getElementById('toast');

// 통계 요소
const todayCyclesDisplay = document.getElementById('todayCycles');
const todayMinutesDisplay = document.getElementById('todayMinutes');

// 설정 입력 요소
const languageSelect = document.getElementById('languageSelect');
const workTimeInput = document.getElementById('workTime');
const shortBreakInput = document.getElementById('shortBreak');
const longBreakInput = document.getElementById('longBreak');
const cyclesInput = document.getElementById('cycles');
const soundEnabledInput = document.getElementById('soundEnabled');
const notificationEnabledInput = document.getElementById('notificationEnabled');
const autoStartEnabledInput = document.getElementById('autoStartEnabled');

// 현재 상태
let currentState = null;
let currentStatistics = null;
let audioContext = null;

// 진행 바 상수
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 80; // 502.65

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  await getState();
  await loadSettings();
  setupEventListeners();
  setupKeyboardShortcuts();
});

// 백그라운드에서 상태 가져오기
async function getState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getState' });
    currentState = response.state;
    currentStatistics = response.statistics;
    updateUI();
    updateStatistics();
  } catch (error) {
    console.error('상태 가져오기 실패:', error);
  }
}

// 설정 불러오기
async function loadSettings() {
  try {
    const settings = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (settings) {
      workTimeInput.value = settings.workTime;
      shortBreakInput.value = settings.shortBreak;
      longBreakInput.value = settings.longBreak;
      cyclesInput.value = settings.cyclesBeforeLongBreak;
      soundEnabledInput.checked = settings.soundEnabled;
      notificationEnabledInput.checked = settings.notificationEnabled;
      autoStartEnabledInput.checked = settings.autoStartEnabled || false;
    }

    // 언어 설정 불러오기
    const result = await chrome.storage.local.get(['language']);
    languageSelect.value = result.language || 'auto';
  } catch (error) {
    console.error('설정 불러오기 실패:', error);
  }
}

// UI 업데이트
function updateUI() {
  if (!currentState) return;

  // 시간 표시 업데이트
  const minutes = Math.floor(currentState.timeRemaining / 60);
  const seconds = currentState.timeRemaining % 60;
  minutesDisplay.textContent = String(minutes).padStart(2, '0');
  secondsDisplay.textContent = String(seconds).padStart(2, '0');

  // 사이클 표시 업데이트
  cycleText.textContent = I18n.getMessage('cycleFormat', [
    String(currentState.completedCycles),
    String(currentState.settings.cyclesBeforeLongBreak)
  ]);

  // 버튼 상태 업데이트
  if (currentState.isRunning) {
    startBtn.textContent = I18n.getMessage('pause');
    startBtn.setAttribute('aria-label', I18n.getMessage('ariaPauseTimer'));
    document.querySelector('.timer-display').classList.add('running');
  } else {
    startBtn.textContent = I18n.getMessage('start');
    startBtn.setAttribute('aria-label', I18n.getMessage('ariaStartTimer'));
    document.querySelector('.timer-display').classList.remove('running');
  }

  // 모드 색상 및 탭 업데이트
  updateModeUI(currentState.mode);

  // 원형 진행 바 업데이트
  updateProgressRing();
}

// 통계 업데이트
function updateStatistics() {
  if (!currentStatistics) return;

  todayCyclesDisplay.textContent = I18n.getMessage('cycleCount', [
    String(currentStatistics.todayCompletedCycles)
  ]);
  todayMinutesDisplay.textContent = I18n.getMessage('minuteFormat', [
    String(Math.floor(currentStatistics.todayWorkMinutes))
  ]);
}

// 원형 진행 바 업데이트
function updateProgressRing() {
  if (!currentState || !progressCircle) return;

  const totalTime = currentState.totalTime || getModeTime(currentState.mode);
  const progress = currentState.timeRemaining / totalTime;
  const offset = CIRCLE_CIRCUMFERENCE * (1 - progress);

  progressCircle.style.strokeDashoffset = offset;
}

// 모드에 따른 시간 반환 (로컬 계산용)
function getModeTime(mode) {
  if (!currentState) return 25 * 60;
  switch (mode) {
    case 'work':
      return currentState.settings.workTime * 60;
    case 'shortBreak':
      return currentState.settings.shortBreak * 60;
    case 'longBreak':
      return currentState.settings.longBreak * 60;
    default:
      return currentState.settings.workTime * 60;
  }
}

// 모드 UI 업데이트
function updateModeUI(mode) {
  // 컨테이너 색상 변경
  container.className = 'container ' + mode + '-mode';

  // 모드 탭 활성화 (이벤트 위임으로 변경됨)
  const modeTabs = document.querySelectorAll('.mode-tab');
  modeTabs.forEach(tab => {
    if (tab.dataset.mode === mode) {
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
    } else {
      tab.classList.remove('active');
      tab.setAttribute('aria-selected', 'false');
    }
  });
}

// 이벤트 리스너 설정
function setupEventListeners() {
  // 시작/일시정지 버튼
  startBtn.addEventListener('click', async () => {
    if (currentState.isRunning) {
      await chrome.runtime.sendMessage({ action: 'pause' });
    } else {
      await chrome.runtime.sendMessage({ action: 'start' });
    }
    await getState();
  });

  // 리셋 버튼
  resetBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'reset' });
    await getState();
  });

  // 모드 탭 클릭 - 이벤트 위임 사용
  modeTabsContainer.addEventListener('click', async (e) => {
    const tab = e.target.closest('.mode-tab');
    if (!tab) return;

    const mode = tab.dataset.mode;
    await chrome.runtime.sendMessage({ action: 'setMode', mode });
    await getState();
  });

  // 설정 버튼
  settingsBtn.addEventListener('click', () => {
    mainScreen.classList.add('hidden');
    settingsScreen.classList.remove('hidden');
  });

  // 뒤로가기 버튼
  backBtn.addEventListener('click', () => {
    settingsScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
  });

  // 언어 선택 변경 이벤트
  languageSelect.addEventListener('change', async () => {
    const selectedLang = languageSelect.value;
    if (selectedLang === 'auto') {
      // 자동 선택: 저장된 언어 설정 삭제
      await chrome.storage.local.remove(['language']);
      const browserLang = chrome.i18n.getUILanguage().split('-')[0];
      const locale = I18n.supportedLocales.includes(browserLang) ? browserLang : I18n.defaultLocale;
      await I18n.setLocale(locale);
    } else {
      await I18n.setLocale(selectedLang);
    }
    // 동적 텍스트 업데이트
    updateUI();
    updateStatistics();
  });

  // 저장 버튼
  saveBtn.addEventListener('click', async () => {
    const settings = {
      workTime: parseInt(workTimeInput.value) || 25,
      shortBreak: parseInt(shortBreakInput.value) || 5,
      longBreak: parseInt(longBreakInput.value) || 15,
      cyclesBeforeLongBreak: parseInt(cyclesInput.value) || 4,
      soundEnabled: soundEnabledInput.checked,
      notificationEnabled: notificationEnabledInput.checked,
      autoStartEnabled: autoStartEnabledInput.checked
    };

    await chrome.runtime.sendMessage({ action: 'saveSettings', settings });
    await getState();

    settingsScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');

    // 토스트 알림 표시
    showToast(I18n.getMessage('settingsSaved'));
  });
}

// 키보드 단축키 설정
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', async (e) => {
    // 설정 화면에서는 단축키 비활성화
    if (!settingsScreen.classList.contains('hidden')) return;

    // 입력 필드에서는 단축키 비활성화
    if (e.target.tagName === 'INPUT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (currentState.isRunning) {
          await chrome.runtime.sendMessage({ action: 'pause' });
        } else {
          await chrome.runtime.sendMessage({ action: 'start' });
        }
        await getState();
        break;

      case 'KeyR':
        e.preventDefault();
        await chrome.runtime.sendMessage({ action: 'reset' });
        await getState();
        break;

      case 'Digit1':
        e.preventDefault();
        await chrome.runtime.sendMessage({ action: 'setMode', mode: 'work' });
        await getState();
        break;

      case 'Digit2':
        e.preventDefault();
        await chrome.runtime.sendMessage({ action: 'setMode', mode: 'shortBreak' });
        await getState();
        break;

      case 'Digit3':
        e.preventDefault();
        await chrome.runtime.sendMessage({ action: 'setMode', mode: 'longBreak' });
        await getState();
        break;
    }
  });
}

// 토스트 메시지 표시
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 2000);
}

// 백그라운드에서 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'tick') {
    currentState = message.state;
    currentStatistics = message.statistics;
    updateUI();
    updateStatistics();
  } else if (message.action === 'timerComplete') {
    currentState = message.state;
    currentStatistics = message.statistics;
    updateUI();
    updateStatistics();
    playNotificationSound();
  }
});

// Web Audio API를 사용한 알림 소리 재생
async function playNotificationSound() {
  // 소리 설정 확인
  if (!currentState?.settings?.soundEnabled) return;

  try {
    // AudioContext 생성 (한 번만)
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // AudioContext가 suspended 상태면 resume
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // 오실레이터 생성
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // 연결
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // 소리 설정
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 음

    // 볼륨 페이드 아웃
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    // 재생
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    // 두 번째 비프음 (약간의 딜레이 후)
    setTimeout(async () => {
      // 다시 resume 체크
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const oscillator2 = audioContext.createOscillator();
      const gainNode2 = audioContext.createGain();

      oscillator2.connect(gainNode2);
      gainNode2.connect(audioContext.destination);

      oscillator2.type = 'sine';
      oscillator2.frequency.setValueAtTime(1046.5, audioContext.currentTime); // C6 음

      gainNode2.gain.setValueAtTime(0.5, audioContext.currentTime);
      gainNode2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator2.start(audioContext.currentTime);
      oscillator2.stop(audioContext.currentTime + 0.5);
    }, 200);

  } catch (error) {
    console.error('소리 재생 실패:', error);
  }
}

// 페이지 로드 시 초기 상태 설정
getState();
