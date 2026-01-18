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
const modeTabs = document.querySelectorAll('.mode-tab');

// 설정 입력 요소
const workTimeInput = document.getElementById('workTime');
const shortBreakInput = document.getElementById('shortBreak');
const longBreakInput = document.getElementById('longBreak');
const cyclesInput = document.getElementById('cycles');
const soundEnabledInput = document.getElementById('soundEnabled');
const notificationEnabledInput = document.getElementById('notificationEnabled');

// 현재 상태
let currentState = null;
let audioContext = null;

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  await getState();
  await loadSettings();
  setupEventListeners();
});

// 백그라운드에서 상태 가져오기
async function getState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getState' });
    currentState = response;
    updateUI();
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
    }
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
  cycleText.textContent = `사이클: ${currentState.completedCycles} / ${currentState.settings.cyclesBeforeLongBreak}`;

  // 버튼 상태 업데이트
  if (currentState.isRunning) {
    startBtn.textContent = '일시정지';
    document.querySelector('.timer-display').classList.add('running');
  } else {
    startBtn.textContent = '시작';
    document.querySelector('.timer-display').classList.remove('running');
  }

  // 모드 색상 및 탭 업데이트
  updateModeUI(currentState.mode);
}

// 모드 UI 업데이트
function updateModeUI(mode) {
  // 컨테이너 색상 변경
  container.className = 'container ' + mode + '-mode';

  // 모드 탭 활성화
  modeTabs.forEach(tab => {
    if (tab.dataset.mode === mode) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
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

  // 모드 탭 클릭
  modeTabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      const mode = tab.dataset.mode;
      await chrome.runtime.sendMessage({ action: 'setMode', mode });
      await getState();
    });
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

  // 저장 버튼
  saveBtn.addEventListener('click', async () => {
    const settings = {
      workTime: parseInt(workTimeInput.value) || 25,
      shortBreak: parseInt(shortBreakInput.value) || 5,
      longBreak: parseInt(longBreakInput.value) || 15,
      cyclesBeforeLongBreak: parseInt(cyclesInput.value) || 4,
      soundEnabled: soundEnabledInput.checked,
      notificationEnabled: notificationEnabledInput.checked
    };

    await chrome.runtime.sendMessage({ action: 'saveSettings', settings });
    await getState();

    settingsScreen.classList.add('hidden');
    mainScreen.classList.remove('hidden');
  });
}

// 백그라운드에서 메시지 수신
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'tick') {
    currentState = message.state;
    updateUI();
  } else if (message.action === 'timerComplete') {
    currentState = message.state;
    updateUI();
    playNotificationSound();
  }
});

// Web Audio API를 사용한 알림 소리 재생
function playNotificationSound() {
  // 소리 설정 확인
  if (!currentState?.settings?.soundEnabled) return;

  try {
    // AudioContext 생성 (한 번만)
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
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
    setTimeout(() => {
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
