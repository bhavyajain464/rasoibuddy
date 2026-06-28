import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: { length: number; 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type UseVoiceInputOptions = {
  onResult: (text: string) => void;
  lang?: string;
};

export function useVoiceInput({ onResult, lang = 'en-IN' }: UseVoiceInputOptions) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const webRecognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  // Native voice module shape varies by platform; keep ref loose for optional dependency.
  const nativeVoiceRef = useRef<{
    start: (locale: string) => Promise<unknown>;
    stop: () => Promise<unknown>;
    destroy: () => Promise<unknown>;
  } | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const w = window as Window & {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      };
      setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
      return;
    }

    let mounted = true;
    void (async () => {
      try {
        const Voice = (await import('@react-native-voice/voice')).default;
        if (!mounted) return;
        Voice.onSpeechResults = (event) => {
          const transcript = event.value?.[0]?.trim();
          if (transcript) onResultRef.current(transcript);
        };
        Voice.onSpeechError = () => {
          setError('Could not hear that. Try again.');
          setListening(false);
        };
        Voice.onSpeechEnd = () => {
          setListening(false);
        };
        nativeVoiceRef.current = Voice as unknown as NonNullable<typeof nativeVoiceRef.current>;
        const available = await Voice.isAvailable();
        setSupported(Boolean(available));
      } catch {
        if (mounted) setSupported(false);
      }
    })();

    return () => {
      mounted = false;
      void nativeVoiceRef.current?.destroy?.();
      nativeVoiceRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    if (Platform.OS === 'web') {
      webRecognitionRef.current?.stop();
      webRecognitionRef.current = null;
    } else {
      void nativeVoiceRef.current?.stop?.();
    }
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!supported) {
      setError('Voice input is not available on this device.');
      return;
    }

    if (Platform.OS === 'web') {
      const w = window as Window & {
        SpeechRecognition?: SpeechRecognitionCtor;
        webkitSpeechRecognition?: SpeechRecognitionCtor;
      };
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!SR) {
        setError('Voice input is not available in this browser.');
        return;
      }
      const recognition = new SR();
      recognition.lang = lang;
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim();
        if (transcript) onResultRef.current(transcript);
      };
      recognition.onerror = () => {
        setError('Could not hear that. Try again.');
        setListening(false);
      };
      recognition.onend = () => {
        setListening(false);
        webRecognitionRef.current = null;
      };
      webRecognitionRef.current = recognition;
      recognition.start();
      setListening(true);
      return;
    }

    try {
      await nativeVoiceRef.current?.start(lang);
      setListening(true);
    } catch {
      setError('Microphone permission is required for voice.');
      setListening(false);
    }
  }, [lang, supported]);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      void start();
    }
  }, [listening, start, stop]);

  return { listening, supported, error, start, stop, toggle };
}
