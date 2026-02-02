import { useCallback, useRef } from "react";

interface BarcodeScannerConfig {
  /** Minimum characters for barcode detection (default: 4) */
  minBarcodeLength?: number;
  /** Maximum time between keystrokes in ms to be considered scanner input (default: 50ms) */
  maxKeystrokeInterval?: number;
  /** Debounce delay before showing dropdown for manual typing (default: 300ms) */
  dropdownDebounceDelay?: number;
}

interface BarcodeScannerResult {
  /** Whether current input pattern looks like a barcode scanner */
  isScannerInput: boolean;
  /** Record keystroke timing */
  recordKeystroke: () => void;
  /** Reset detection state */
  reset: () => void;
  /** Check if input is likely from scanner based on timing and content */
  detectScannerInput: (value: string, timeSinceLastKeystroke: number) => boolean;
}

/**
 * Hook to detect barcode scanner input vs manual typing
 * 
 * Barcode scanners typically:
 * - Input very fast (< 50ms between keystrokes)
 * - Input numeric or alphanumeric strings
 * - End with Enter key
 * 
 * Manual typing is slower with variable pauses.
 */
export function useBarcodeScanner(config: BarcodeScannerConfig = {}): BarcodeScannerResult {
  const {
    minBarcodeLength = 4,
    maxKeystrokeInterval = 50,
  } = config;

  // Track keystroke timings
  const lastKeystrokeTime = useRef<number>(0);
  const keystrokeIntervals = useRef<number[]>([]);
  const inputStartTime = useRef<number>(0);

  const recordKeystroke = useCallback(() => {
    const now = Date.now();
    
    if (lastKeystrokeTime.current > 0) {
      const interval = now - lastKeystrokeTime.current;
      keystrokeIntervals.current.push(interval);
      
      // Keep only last 20 intervals
      if (keystrokeIntervals.current.length > 20) {
        keystrokeIntervals.current.shift();
      }
    } else {
      inputStartTime.current = now;
    }
    
    lastKeystrokeTime.current = now;
  }, []);

  const reset = useCallback(() => {
    lastKeystrokeTime.current = 0;
    keystrokeIntervals.current = [];
    inputStartTime.current = 0;
  }, []);

  /**
   * Detect if input pattern matches barcode scanner characteristics:
   * 1. Fast consecutive keystrokes (< 50ms average)
   * 2. Minimum length requirement
   * 3. Total input time is very short
   */
  const detectScannerInput = useCallback((value: string, timeSinceLastKeystroke: number): boolean => {
    // Not enough characters for barcode
    if (value.length < minBarcodeLength) {
      return false;
    }

    // Check if last keystroke was fast (typical for scanner)
    if (timeSinceLastKeystroke > maxKeystrokeInterval) {
      return false;
    }

    // Check average keystroke interval
    if (keystrokeIntervals.current.length >= 3) {
      const avgInterval = keystrokeIntervals.current.reduce((a, b) => a + b, 0) / keystrokeIntervals.current.length;
      
      // Scanner typically has < 30ms average interval
      if (avgInterval < 50) {
        return true;
      }
    }

    // Fast input for the entire string (total time / characters < 100ms per char)
    const totalInputTime = Date.now() - inputStartTime.current;
    const msPerChar = totalInputTime / value.length;
    
    if (value.length >= 8 && msPerChar < 100) {
      return true;
    }

    return false;
  }, [minBarcodeLength, maxKeystrokeInterval]);

  // Determine if current accumulated input looks like scanner input
  const isScannerInput = keystrokeIntervals.current.length >= 3 &&
    (keystrokeIntervals.current.reduce((a, b) => a + b, 0) / keystrokeIntervals.current.length) < 50;

  return {
    isScannerInput,
    recordKeystroke,
    reset,
    detectScannerInput,
  };
}
