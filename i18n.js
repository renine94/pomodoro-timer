// 다국어 처리 유틸리티 (사용자 언어 선택 지원)

const I18n = {
  messages: {},
  currentLocale: null,
  supportedLocales: ['ko', 'en'],
  defaultLocale: 'ko',

  // 초기화
  async init() {
    // 저장된 언어 설정 불러오기
    const result = await chrome.storage.local.get(['language']);

    if (result.language && this.supportedLocales.includes(result.language)) {
      this.currentLocale = result.language;
    } else {
      // 기본값: 브라우저 언어 따라가기
      const browserLang = chrome.i18n.getUILanguage().split('-')[0];
      this.currentLocale = this.supportedLocales.includes(browserLang)
        ? browserLang
        : this.defaultLocale;
    }

    // 메시지 파일 로드
    await this.loadMessages(this.currentLocale);

    // DOM에 적용
    this.applyI18n();
  },

  // 메시지 파일 로드
  async loadMessages(locale) {
    try {
      const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
      const response = await fetch(url);
      this.messages = await response.json();
    } catch (error) {
      console.error('메시지 로드 실패:', error);
      // 폴백: 기본 언어 로드
      if (locale !== this.defaultLocale) {
        await this.loadMessages(this.defaultLocale);
      }
    }
  },

  // 메시지 가져오기
  getMessage(key, substitutions = []) {
    const entry = this.messages[key];
    if (!entry) return key;

    let message = entry.message;

    // 플레이스홀더 치환
    if (substitutions.length > 0 && entry.placeholders) {
      Object.keys(entry.placeholders).forEach((name, index) => {
        const placeholder = entry.placeholders[name];
        const value = substitutions[parseInt(placeholder.content.replace('$', '')) - 1] || '';
        message = message.replace(new RegExp(`\\$${name}\\$`, 'gi'), value);
      });
    }

    return message;
  },

  // 언어 변경
  async setLocale(locale) {
    if (!this.supportedLocales.includes(locale)) return;

    this.currentLocale = locale;
    await chrome.storage.local.set({ language: locale });
    await this.loadMessages(locale);
    this.applyI18n();
  },

  // 현재 언어 가져오기
  getLocale() {
    return this.currentLocale;
  },

  // DOM에 i18n 적용
  applyI18n() {
    // data-i18n 속성이 있는 요소들 처리 (textContent)
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      // option 요소는 textContent 대신 text 사용
      if (el.tagName === 'OPTION') {
        el.text = this.getMessage(key);
      } else {
        el.textContent = this.getMessage(key);
      }
    });

    // data-i18n-placeholder 처리
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = this.getMessage(key);
    });

    // data-i18n-aria 처리
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      el.setAttribute('aria-label', this.getMessage(key));
    });

    // data-i18n-title 처리
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = this.getMessage(key);
    });
  }
};

// 전역 헬퍼 함수
function getMessage(key, substitutions) {
  return I18n.getMessage(key, substitutions);
}

// DOM 로드 시 자동 초기화
document.addEventListener('DOMContentLoaded', () => I18n.init());
