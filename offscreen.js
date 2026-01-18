// Offscreen document for audio playback

let audioContext = null;

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'playSound') {
    playNotificationSound();
    sendResponse({ success: true });
  }
  return true;
});

// 알림 소리 재생
async function playNotificationSound() {
  try {
    // AudioContext 생성 (한 번만)
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    // AudioContext가 suspended 상태면 resume
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    // 첫 번째 비프음
    playBeep(880, 0); // A5 음

    // 두 번째 비프음 (200ms 후)
    setTimeout(() => {
      playBeep(1046.5, 0); // C6 음
    }, 200);

  } catch (error) {
    console.error('소리 재생 실패:', error);
  }
}

// 비프음 재생 함수
function playBeep(frequency, delay) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + delay);

  gainNode.gain.setValueAtTime(0.5, audioContext.currentTime + delay);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + delay + 0.5);

  oscillator.start(audioContext.currentTime + delay);
  oscillator.stop(audioContext.currentTime + delay + 0.5);
}
