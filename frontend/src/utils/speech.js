const LANGUAGE_CONFIG = {
  en: {
    label: 'English',
    recognition: 'en-US',
    synthesis: 'en-US',
  },
  ur: {
    label: 'Urdu',
    recognition: 'ur-PK',
    synthesis: 'ur-PK',
  },
};

export function getLanguageConfig(language = 'en') {
  return LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.en;
}

export function browserSupportsSpeechRecognition() {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function browserSupportsSpeechSynthesis() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function createSpeechRecognition(language = 'en') {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = getLanguageConfig(language).recognition;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  return recognition;
}

export function stopSpeaking() {
  if (browserSupportsSpeechSynthesis()) {
    window.speechSynthesis.cancel();
  }
}

export function speakText(text, language = 'en', options = {}) {
  if (!browserSupportsSpeechSynthesis() || !text?.trim()) {
    return false;
  }

  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = getLanguageConfig(language).synthesis;
  utterance.rate = language === 'ur' ? 0.9 : 1;
  utterance.pitch = 1;

  const voices = window.speechSynthesis.getVoices();
  const prefix = utterance.lang.toLowerCase().split('-')[0];
  const matchingVoice = voices.find((voice) =>
    voice.lang?.toLowerCase().startsWith(prefix)
  );
  if (matchingVoice) {
    utterance.voice = matchingVoice;
  }

  if (typeof options.onEnd === 'function') {
    utterance.onend = options.onEnd;
  }
  if (typeof options.onError === 'function') {
    utterance.onerror = options.onError;
  }

  window.speechSynthesis.speak(utterance);
  return true;
}
