const LANGUAGE_CONFIG = {
  en: {
    label: 'English',
    recognition: ['en-US', 'en-GB', 'en'],
    synthesis: ['en-US', 'en-GB', 'en'],
  },
  ur: {
    label: 'Urdu',
    recognition: ['ur-PK', 'ur-IN', 'ur'],
    synthesis: ['ur-PK', 'ur-IN', 'ur'],
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
  recognition.lang = getLanguageConfig(language).recognition[0];
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  return recognition;
}

function pickMatchingVoice(voices, language) {
  const candidates = getLanguageConfig(language).synthesis.map((value) => value.toLowerCase());

  return voices.find((voice) => candidates.includes(voice.lang?.toLowerCase()))
    || voices.find((voice) => candidates.some((candidate) => voice.lang?.toLowerCase().startsWith(candidate)))
    || null;
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
  utterance.lang = getLanguageConfig(language).synthesis[0];
  utterance.rate = language === 'ur' ? 0.9 : 1;
  utterance.pitch = 1;

  if (typeof options.onEnd === 'function') {
    utterance.onend = options.onEnd;
  }
  if (typeof options.onError === 'function') {
    utterance.onerror = options.onError;
  }

  let didSpeak = false;
  const speakOnce = () => {
    if (didSpeak) {
      return;
    }
    didSpeak = true;

    const voices = window.speechSynthesis.getVoices();
    const matchingVoice = pickMatchingVoice(voices, language);
    if (matchingVoice) {
      utterance.voice = matchingVoice;
      utterance.lang = matchingVoice.lang;
    }

    window.speechSynthesis.speak(utterance);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length) {
    speakOnce();
    return true;
  }

  const handleVoicesChanged = () => {
    window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
    speakOnce();
  };

  window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
  window.setTimeout(speakOnce, 250);
  return true;
}
