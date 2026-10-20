import { useEffect, useRef, useState, useCallback } from 'react';
import { sound } from '../utils/sound.js';

interface UseDictationOptions {
  onResult?: (_transcript: string) => void;
  onError?: (_error: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

interface UseDictationReturn {
  isListening: boolean;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  transcript: string;
  resetTranscript: () => void;
}

export function useDictation(options: UseDictationOptions = {}): UseDictationReturn {
  const {
    onResult,
    onError,
    onStart,
    onEnd,
    lang = 'en-US',
    continuous = true,
    interimResults = true,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRec) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);

    try {
      const recog = new SpeechRec();
      recog.continuous = continuous;
      recog.interimResults = interimResults;
      recog.lang = lang;

      recog.onresult = (event) => {
        let resultTranscript = '';
        for (let i = 0; i < event.results.length; i += 1) {
          resultTranscript += event.results[i][0].transcript;
        }
        if (resultTranscript.trim()) {
          setTranscript(resultTranscript);
          onResult?.(resultTranscript);
        }
      };

      recog.onerror = (event) => {
        setIsListening(false);
        const errorMsg = event?.error === 'not-allowed'
          ? 'Microphone access is blocked. Allow it in your browser settings.'
          : `Dictation error: ${event.error}`;
        onError?.(errorMsg);
      };

      recog.onend = () => {
        setIsListening(false);
        onEnd?.();
      };

      recog.onstart = () => {
        onStart?.();
      };

      recognitionRef.current = recog;
    } catch {
      recognitionRef.current = null;
      setIsSupported(false);
    }

    return () => {
      recognitionRef.current?.stop();
    };
  }, [continuous, interimResults, lang, onResult, onError, onStart, onEnd]);

  const start = useCallback(() => {
    const recog = recognitionRef.current;
    if (!recog) {
      onError?.('Speech recognition not available in this browser.');
      return;
    }
    try {
      recog.start();
      setIsListening(true);
      sound.apply();
    } catch {
      setIsListening(false);
      onError?.('Could not start microphone. Try again.');
    }
  }, [onError]);

  const stop = useCallback(() => {
    const recog = recognitionRef.current;
    if (recog) {
      recog.stop();
      setIsListening(false);
      sound.click();
    }
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  return {
    isListening,
    isSupported,
    start,
    stop,
    toggle,
    transcript,
    resetTranscript,
  };
}

export default useDictation;