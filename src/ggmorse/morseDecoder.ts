/**
 * Morse Code Decoder
 *
 * Converts dot/dash sequences to text using a trie-based approach.
 *
 * Morse->text table is derived at module load from the canonical MORSE_CODE
 * in const.ts, plus extra punctuation chars not covered by the encoder's
 * table (e.g. &, :, ;, @, etc.) so the decoder can handle any morse input.
 */
import { MORSE_CODE as TEXT_TO_MORSE } from "../const";

// Derive morse->text from canonical table
const MORSE_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(TEXT_TO_MORSE).map(([char, morse]) => [morse, char])
);

// Augment with extra punctuation chars the encoder doesn't use
const EXTRA_CHARS: Record<string, string> = {
  ".-...": "&",
  "---...": ":",
  "-.-.-.": ";",
  ".-.-.": "+",
  "..--.-": "_",
  ".-..-.": '"',
  "...-..-": "$",
  ".--.-.": "@",
  ".----.": "'",
  "-.-.--": "!",
};
for (const [morse, char] of Object.entries(EXTRA_CHARS)) {
  MORSE_CODE[morse] = char;
}

class MorseTrieNode {
  children: Map<string, MorseTrieNode> = new Map();
  isEndOfWord: boolean = false;
  character: string = "";
}

class MorseTrie {
  private root: MorseTrieNode = new MorseTrieNode();

  constructor() {
    for (const [morse, char] of Object.entries(MORSE_CODE)) {
      this.insert(morse, char);
    }
  }

  private insert(morse: string, char: string): void {
    let node = this.root;
    for (const symbol of morse) {
      if (!node.children.has(symbol)) {
        node.children.set(symbol, new MorseTrieNode());
      }
      node = node.children.get(symbol)!;
    }
    node.isEndOfWord = true;
    node.character = char;
  }

  findByPrefix(morse: string): { morse: string; char: string }[] {
    const results: { morse: string; char: string }[] = [];
    let node = this.root;

    for (const symbol of morse) {
      if (!node.children.has(symbol)) {
        return results;
      }
      node = node.children.get(symbol)!;
    }

    this.collectAllWords(node, morse, results);
    return results;
  }

  private collectAllWords(
    node: MorseTrieNode,
    current: string,
    results: { morse: string; char: string }[]
  ): void {
    if (node.isEndOfWord) {
      results.push({ morse: current, char: node.character });
    }
    for (const [symbol, child] of node.children) {
      this.collectAllWords(child, current + symbol, results);
    }
  }

  decode(morse: string): string | null {
    let node = this.root;
    for (const symbol of morse) {
      if (!node.children.has(symbol)) {
        return null;
      }
      node = node.children.get(symbol)!;
    }
    return node.isEndOfWord ? node.character : null;
  }
}

const morseTrie = new MorseTrie();

export interface DecodedCharacter {
  character: string;
  confidence: number;
  morseCode: string;
}

export interface DecodeState {
  currentMorse: string;
  decodedText: string;
  decodedChars: DecodedCharacter[];
  isActive: boolean;
  lastToneTime: number;
  lastToneDuration: number;
}

export class MorseDecoder {
  private sampleRate: number;
  private dotDuration!: number;
  private interCharSpace!: number;
  private wordSpace!: number;

  private morseBuffer: string = "";
  private decodedText: string = "";
  private decodedChars: DecodedCharacter[] = [];
  private lastOnTime: number = 0;
  private lastOffTime: number = 0;
  private lastToneDuration: number = 0;
  private isReceiving: boolean = false;
  private pendingSpace: boolean = false;
  private recentDurations: number[] = [];

  constructor(sampleRate: number, wpm: number = 20) {
    this.sampleRate = sampleRate;
    this.updateTiming(wpm);
  }

  updateTiming(wpm: number): void {
    const unitMs = 1200 / wpm;

    this.dotDuration = Math.round((this.sampleRate * unitMs) / 1000);
    this.interCharSpace = Math.round((3 * this.sampleRate * unitMs) / 1000);
    this.wordSpace = Math.round((7 * this.sampleRate * unitMs) / 1000);
  }

  processTone(isOn: boolean, sampleIndex: number): string {
    const currentTime = sampleIndex;

    if (isOn) {
      this.lastOnTime = currentTime;
      this.isReceiving = true;

      if (this.pendingSpace) {
        this.decodeCurrentMorse();
        this.pendingSpace = false;
      }
    } else {
      this.lastOffTime = currentTime;
      this.lastToneDuration = currentTime - this.lastOnTime;
      this.isReceiving = false;

      const symbol = this.classifyTone(this.lastToneDuration);
      this.morseBuffer += symbol;
      this.updateAdaptiveTiming(this.lastToneDuration);
      this.pendingSpace = true;
    }

    return this.decodedText;
  }

  private classifyTone(duration: number): string {
    const threshold = this.recentDurations.length >= 4
      ? this.computeAdaptiveThreshold()
      : this.dotDuration * 1.5;

    return duration < threshold ? "." : "-";
  }

  private updateAdaptiveTiming(duration: number): void {
    this.recentDurations.push(duration);
    if (this.recentDurations.length > 10) {
      this.recentDurations.shift();
    }
  }

  private computeAdaptiveThreshold(): number {
    if (this.recentDurations.length < 2) {
      return this.dotDuration * 1.5;
    }

    const minDuration = Math.min(...this.recentDurations);
    return minDuration * 1.5;
  }

  checkForSpace(sampleIndex: number): void {
    if (!this.pendingSpace) return;

    const silenceDuration = sampleIndex - this.lastOffTime;

    if (silenceDuration >= this.wordSpace) {
      this.decodeCurrentMorse();
      this.decodedText += " ";
      this.pendingSpace = false;
    } else if (silenceDuration >= this.interCharSpace) {
      this.decodeCurrentMorse();
      this.pendingSpace = false;
    }
  }

  private decodeCurrentMorse(): void {
    if (this.morseBuffer.length === 0) return;

    const result = morseTrie.decode(this.morseBuffer);
    if (result) {
      this.decodedText += result;
      this.decodedChars.push({
        character: result,
        confidence: 1.0,
        morseCode: this.morseBuffer,
      });
    }

    this.morseBuffer = "";
  }

  flush(): string {
    this.decodeCurrentMorse();
    return this.decodedText;
  }

  getText(): string {
    return this.decodedText;
  }

  getDecodedChars(): DecodedCharacter[] {
    return this.decodedChars;
  }

  reset(): void {
    this.morseBuffer = "";
    this.decodedText = "";
    this.decodedChars = [];
    this.lastOnTime = 0;
    this.lastOffTime = 0;
    this.lastToneDuration = 0;
    this.isReceiving = false;
    this.pendingSpace = false;
    this.recentDurations = [];
  }

  getState(): DecodeState {
    return {
      currentMorse: this.morseBuffer,
      decodedText: this.decodedText,
      decodedChars: [...this.decodedChars],
      isActive: this.isReceiving,
      lastToneTime: this.lastOnTime,
      lastToneDuration: this.lastToneDuration,
    };
  }

  get wpm(): number {
    return Math.round(1200 / (this.dotDuration / this.sampleRate * 1000));
  }
}

export function decodeMorse(morse: string): string {
  const words = morse.trim().split("       ");
  return words
    .map((word) =>
      word
        .split("   ")
        .map((char) => morseTrie.decode(char) || "?")
        .join("")
    )
    .join(" ");
}
