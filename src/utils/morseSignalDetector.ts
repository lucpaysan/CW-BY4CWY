import { SAMPLE_RATE, MIN_FREQ_HZ, MAX_FREQ_HZ, FFT_SIZE } from "../const";

/**
 * Detect Morse signal center frequency from spectrogram energy data.
 *
 * The AnalyserNode provides FFT data where:
 * - bins 0 to frequencyBinCount-1 cover 0 to sampleRate/2 (Nyquist)
 * - Each bin represents a frequency range of sampleRate / fftSize Hz
 *
 * We focus on the MIN_FREQ_HZ to MAX_FREQ_HZ range where CW signals live.
 *
 * Note: FFT_SIZE must match the AnalyserNode fftSize in useSpectrogramRenderer.
 */

/**
 * Compute bin index range for a given frequency range.
 */
function freqToBinRange(
  minFreq: number,
  maxFreq: number,
  fftSize: number,
  sampleRate: number
): { minBin: number; maxBin: number } {
  const nyquist = sampleRate / 2;
  const binCount = fftSize / 2;
  const minBin = Math.floor((minFreq / nyquist) * binCount);
  const maxBin = Math.min(
    binCount - 1,
    Math.floor((maxFreq / nyquist) * binCount)
  );
  return { minBin, maxBin };
}

/**
 * Cluster adjacent bins into signal regions.
 * Returns array of [startBin, endBin] for each cluster.
 */
function clusterBins(activeBins: number[]): [number, number][] {
  if (activeBins.length === 0) return [];

  const sorted = [...activeBins].sort((a, b) => a - b);
  const clusters: [number, number][] = [];
  let clusterStart = sorted[0];
  let clusterEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] <= clusterEnd + 2) {
      // merge adjacent bins (allow gap of 1-2 bins for noise tolerance)
      clusterEnd = sorted[i];
    } else {
      clusters.push([clusterStart, clusterEnd]);
      clusterStart = sorted[i];
      clusterEnd = sorted[i];
    }
  }
  clusters.push([clusterStart, clusterEnd]);
  return clusters;
}

/**
 * Check if a cluster looks like a Morse signal based on bandwidth.
 * Valid CW signals typically span 100-400 Hz (several bins at 4096 FFT).
 * Too wide = broadband noise. Too narrow = spurious.
 */
function isMorseLikeCluster(
  startBin: number,
  endBin: number,
  binBandwidthHz: number
): boolean {
  const bandwidthHz = (endBin - startBin + 1) * binBandwidthHz;
  // Valid CW bandwidth: roughly 50-500 Hz
  return bandwidthHz >= 50 && bandwidthHz <= 600;
}

export type DetectionResult = {
  frequency: number; // detected center frequency in Hz
  confidence: number;  // 0-1, based on signal-to-noise ratio
};

/**
 * Analyze FFT frequency data and detect Morse signal center frequency.
 *
 * @param frequencyData - Uint8Array from AnalyserNode.getByteFrequencyData()
 *                         Values are 0-255, already weighted by dB scale
 * @returns Detected center frequency in Hz, or null if no clear signal found
 */
export function detectMorseFrequency(
  frequencyData: Uint8Array
): DetectionResult | null {
  const binBandwidthHz = SAMPLE_RATE / FFT_SIZE; // ~0.78 Hz per bin
  const { minBin, maxBin } = freqToBinRange(
    MIN_FREQ_HZ,
    MAX_FREQ_HZ,
    FFT_SIZE,
    SAMPLE_RATE
  );

  // Step 1: Compute average energy per bin in the CW band
  const numBins = maxBin - minBin + 1;
  const binEnergies = new Float32Array(numBins);

  let globalMax = 0;
  let globalSum = 0;

  for (let i = 0; i < numBins; i++) {
    const energy = frequencyData[minBin + i];
    binEnergies[i] = energy;
    if (energy > globalMax) globalMax = energy;
    globalSum += energy;
  }

  const globalAvg = globalSum / numBins;

  // If max is not significantly above average, no strong signal
  if (globalMax < globalAvg * 2.5) {
    return null; // no clear peak
  }

  // Step 2: Adaptive threshold = above noise floor
  // Use a lower percentile as noise floor estimate
  const sortedEnergies = [...binEnergies].sort((a, b) => a - b);
  const noiseFloor = sortedEnergies[Math.floor(numBins * 0.3)]; // 30th percentile
  const threshold = Math.max(noiseFloor * 3, globalAvg * 2);

  // Step 3: Find bins above threshold
  const activeBins: number[] = [];
  for (let i = 0; i < numBins; i++) {
    if (binEnergies[i] >= threshold) {
      activeBins.push(i);
    }
  }

  if (activeBins.length === 0) {
    return null;
  }

  // Step 4: Cluster adjacent active bins
  const clusters = clusterBins(activeBins);
  if (clusters.length === 0) {
    return null;
  }

  // Step 5: Find the best Morse-like cluster (strongest, right bandwidth)
  let bestCluster: [number, number] | null = null;
  let bestScore = 0;

  for (const [start, end] of clusters) {
    if (!isMorseLikeCluster(start, end, binBandwidthHz)) {
      continue;
    }

    // Score = sum of energies in cluster, penalized if too wide
    let clusterEnergy = 0;
    for (let b = start; b <= end; b++) {
      clusterEnergy += binEnergies[b];
    }
    const bandwidthHz = (end - start + 1) * binBandwidthHz;
    // Prefer clusters closer to typical CW bandwidth (~200-300 Hz)
    const bandwidthScore = bandwidthHz >= 150 && bandwidthHz <= 400 ? 1.2 : 1.0;
    const score = clusterEnergy * bandwidthScore;

    if (score > bestScore) {
      bestScore = score;
      bestCluster = [start, end];
    }
  }

  // If no Morse-like cluster found, fall back to strongest cluster
  if (!bestCluster && clusters.length > 0) {
    let maxEnergy = 0;
    for (const [start, end] of clusters) {
      let energy = 0;
      for (let b = start; b <= end; b++) {
        energy += binEnergies[b];
      }
      if (energy > maxEnergy) {
        maxEnergy = energy;
        bestCluster = [start, end];
      }
    }
  }

  if (!bestCluster) {
    return null;
  }

  const [startBin, endBin] = bestCluster;
  const centerBin = Math.round((startBin + endBin) / 2);
  const centerFreqHz = (centerBin + minBin) * binBandwidthHz;

  // Clamp to valid range
  const clampedFreq = Math.max(
    MIN_FREQ_HZ,
    Math.min(MAX_FREQ_HZ, centerFreqHz)
  );

  // Confidence = how much louder than average
  const clusterEnergy = binEnergies
    .slice(startBin, endBin + 1)
    .reduce((a, b) => a + b, 0);
  const confidence = Math.min(1, clusterEnergy / (globalAvg * numBins * 0.5));

  return {
    frequency: Math.round(clampedFreq),
    confidence: Math.max(0.1, confidence),
  };
}
