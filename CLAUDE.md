# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

뽀모도로 타이머 크롬 확장프로그램 (Chrome Extension Manifest V3)

## 아키텍처

### 핵심 파일 구조
- `manifest.json` - 확장프로그램 설정 (MV3)
- `background.js` - Service Worker, 타이머 로직 및 상태 관리
- `popup.js` / `popup.html` / `popup.css` - 팝업 UI
- `offscreen.js` / `offscreen.html` - 알림 소리 재생용 Offscreen Document
- `i18n.js` - 다국어 처리 유틸리티

### 상태 관리
- `background.js`가 타이머 상태의 Single Source of Truth
- `chrome.storage.local`에 상태 영속화
- `popup.js`는 메시지 통신으로 상태 요청/업데이트

### 메시지 프로토콜
popup → background 액션:
- `getState`, `start`, `pause`, `reset`, `setMode`, `saveSettings`, `getSettings`

background → popup 이벤트:
- `tick` (매초 상태 업데이트)
- `timerComplete` (타이머 완료)

### 다국어 (i18n)
- `_locales/{ko,en}/messages.json` - 번역 파일
- `i18n.js` - 런타임 언어 전환 지원 (chrome.i18n과 별도 구현)
- HTML 요소: `data-i18n`, `data-i18n-aria`, `data-i18n-placeholder`, `data-i18n-title` 속성 사용

## 개발

### 테스트 방법
1. `chrome://extensions/` 에서 개발자 모드 활성화
2. "압축해제된 확장 프로그램 로드"로 프로젝트 폴더 선택
3. 코드 수정 후 확장프로그램 새로고침

### 배포용 빌드
```bash
zip -r pomodoro-timer.zip . -x ".*" -x "__MACOSX" -x "*.zip"
```

## 키보드 단축키
- Space: 시작/일시정지
- R: 리셋
- 1/2/3: 작업/짧은휴식/긴휴식 모드 전환
