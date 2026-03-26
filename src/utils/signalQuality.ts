import { SAMPLE_RATE } from "../const";
import { applyBandpassFilter } from "./audioFilters";

export interface SignalQualityMetrics {
  snrDb: number; // Signal-to-noise ratio in dB
  signalPower: number; // Relative signal power (0-1 normalized)
  noisePower: number; // Relative noise power
  confidence: number; // Model confidence (0-1)
}

/**
 * Estimate SNR from audio signal
 *
 * Uses spectral analysis to separate signal from noise:
 * 1. Apply bandpass filter to isolate CW signal band
 * 2. Calculate RMS power of filtered signal
 * 3. Estimate noise from unfiltered vs filtered difference
 * 4. SNR = 10 * log10(signal / noise)
 */
export function estimateSNR(
  audio: Float32Array,
  filterFreq: number | null,
  filterBandwidth: number,
): SignalQualityMetrics {
  const targetFreq = filterFreq ?? 700; // Default CW center frequency

  // Apply bandpass filter to isolate CW signal band
  const filtered = applyBandpassFilter(
    audio,
    SAMPLE_RATE,
    targetFreq,
    filterBandwidth,
  );

  // Calculate RMS power
  const signalPower = calculateRMSPower(filtered);
  const totalPower = calculateRMSPower(audio);

  // Estimate noise: noise = total - signal (ensure non-negative)
  const noisePower = Math.max(0.001, totalPower - signalPower);

  // SNR = 10 * log10(signal / noise)
  // Guard against NaN / Infinity from division by zero or log(0)
  let snrDb: number;
  if (!isFinite(signalPower) || !isFinite(noisePower) || noisePower === 0 || signalPower === 0) {
    snrDb = -10; // Worst case
  } else {
    const ratio = signalPower / noisePower;
    snrDb = 10 * Math.log10(ratio);
    if (!isFinite(snrDb)) {
      snrDb = -10;
    }
  }

  return {
    snrDb: Math.max(-10, Math.min(40, snrDb)), // Clamp to reasonable range
    signalPower: Math.min(1, signalPower * 10), // Normalize for display
    noisePower: Math.min(1, noisePower * 10),
    confidence: 0.5, // Placeholder - will be calculated from model output
  };
}

/**
 * Calculate RMS (root-mean-square) power of signal
 */
function calculateRMSPower(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  const sumSquares = samples.reduce((sum, x) => sum + x * x, 0);
  return sumSquares / samples.length;
}

/**
 * Calculate confidence from model output probabilities
 *
 * Uses entropy-based confidence measure:
 * - Low entropy (sharp peak) = high confidence
 * - High entropy (diffuse) = low confidence
 *
 * Simplified metric: average of max probability per timestep
 */
export function calculateModelConfidence(
  pred: Float32Array,
  timeSteps: number,
  numClasses: number,
): number {
  let totalMaxProb = 0;
  let count = 0;

  for (let t = 0; t < timeSteps; t++) {
    const offset = t * numClasses;
    let maxProb = -Infinity;

    for (let c = 0; c < numClasses; c++) {
      const prob = pred[offset + c];
      if (prob > maxProb) {
        maxProb = prob;
      }
    }

    totalMaxProb += maxProb;
    count++;
  }

  // Average max probability (proxy for confidence)
  const avgConfidence = count > 0 ? totalMaxProb / count : 0;
  return avgConfidence;
}

/**
 * Get SNR quality label and color for display
 */
export function getSNRLabel(
  snrDb: number,
): { label: string; color: string } {
  if (snrDb >= 20) return { label: "EXCELLENT", color: "green" };
  if (snrDb >= 10) return { label: "GOOD", color: "teal" };
  if (snrDb >= 3) return { label: "FAIR", color: "yellow" };
  if (snrDb >= 0) return { label: "POOR", color: "orange" };
  return { label: "VERY POOR", color: "red" };
}

/**
 * Get confidence label and color for display
 */
export function getConfidenceLabel(
  confidence: number,
): { label: string; color: string } {
  if (confidence >= 0.8) return { label: "HIGH", color: "green" };
  if (confidence >= 0.5) return { label: "MED", color: "yellow" };
  if (confidence >= 0.3) return { label: "LOW", color: "orange" };
  return { label: "VERY LOW", color: "red" };
}
