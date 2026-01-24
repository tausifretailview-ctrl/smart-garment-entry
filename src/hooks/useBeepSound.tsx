import { useCallback, useRef } from "react";

// Audio context singleton to avoid creating multiple contexts
let audioContextInstance: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContextInstance) {
    audioContextInstance = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContextInstance;
};

export const useBeepSound = () => {
  const isPlayingRef = useRef(false);

  const playBeep = useCallback((frequency: number, duration: number, type: OscillatorType = "sine") => {
    // Prevent overlapping sounds
    if (isPlayingRef.current) return;
    
    try {
      const audioContext = getAudioContext();
      
      // Resume audio context if suspended (browser autoplay policy)
      if (audioContext.state === "suspended") {
        audioContext.resume();
      }

      isPlayingRef.current = true;

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;

      // Fade in/out to prevent clicks
      const now = audioContext.currentTime;
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);

      oscillator.start(now);
      oscillator.stop(now + duration);

      oscillator.onended = () => {
        isPlayingRef.current = false;
      };
    } catch (error) {
      console.error("Error playing beep:", error);
      isPlayingRef.current = false;
    }
  }, []);

  const playSuccessBeep = useCallback(() => {
    // Pleasant high-pitched beep for success (similar to retail scanner)
    playBeep(1200, 0.15, "sine");
  }, [playBeep]);

  const playErrorBeep = useCallback(() => {
    // Lower, longer double beep for error
    const audioContext = getAudioContext();
    
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    try {
      const now = audioContext.currentTime;
      
      // First beep
      const osc1 = audioContext.createOscillator();
      const gain1 = audioContext.createGain();
      osc1.connect(gain1);
      gain1.connect(audioContext.destination);
      osc1.frequency.value = 400;
      osc1.type = "square";
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.2, now + 0.01);
      gain1.gain.linearRampToValueAtTime(0, now + 0.12);
      osc1.start(now);
      osc1.stop(now + 0.12);

      // Second beep (after short pause)
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.frequency.value = 400;
      osc2.type = "square";
      gain2.gain.setValueAtTime(0, now + 0.15);
      gain2.gain.linearRampToValueAtTime(0.2, now + 0.16);
      gain2.gain.linearRampToValueAtTime(0, now + 0.28);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.28);
    } catch (error) {
      console.error("Error playing error beep:", error);
    }
  }, []);

  return { playSuccessBeep, playErrorBeep };
};
