/**
 * Preset Manager
 * Manages user callsigns, encoder presets, and decoder configurations
 */

export interface CallsignPreset {
  id: string;
  callsign: string;
  name?: string;
  isDefault?: boolean;
}

export interface EncoderPreset {
  id: string;
  name: string;
  wpm: number;
  farnsworth: number;
  toneHz: number;
  isDefault?: boolean;
}

export interface DecoderPreset {
  id: string;
  name: string;
  filterBandwidth: number;
  gain: number;
  isDefault?: boolean;
}

// Default callsign presets (user can customize)
const DEFAULT_CALLSIGNS: CallsignPreset[] = [
  { id: "bh4duf", callsign: "BH4DUF", name: "Primary" },
  { id: "by4cwy", callsign: "BY4CWY", name: "Secondary" },
];

// Default encoder presets
const DEFAULT_ENCODER_PRESETS: EncoderPreset[] = [
  { id: "slow", name: "Slow Practice", wpm: 10, farnsworth: 1.0, toneHz: 700, isDefault: true },
  { id: "normal", name: "Normal", wpm: 20, farnsworth: 1.0, toneHz: 700 },
  { id: "fast", name: "Fast", wpm: 30, farnsworth: 1.0, toneHz: 700 },
  { id: "contest", name: "Contest", wpm: 25, farnsworth: 1.5, toneHz: 750 },
];

// Default decoder presets
const DEFAULT_DECODER_PRESETS: DecoderPreset[] = [
  { id: "default", name: "Default", filterBandwidth: 250, gain: 0, isDefault: true },
  { id: "narrow", name: "Narrow", filterBandwidth: 100, gain: 0 },
  { id: "loud", name: "High Gain", filterBandwidth: 250, gain: 20 },
];

// Storage keys
const STORAGE_KEYS = {
  CALLSIGNS: "cwmaster_callsigns",
  ENCODER_PRESETS: "cwmaster_encoder_presets",
  DECODER_PRESETS: "cwmaster_decoder_presets",
  SELECTED_CALLSIGN: "cwmaster_selected_callsign",
  SELECTED_ENCODER: "cwmaster_selected_encoder",
  SELECTED_DECODER: "cwmaster_selected_decoder",
} as const;

class PresetManager {
  private callsigns: CallsignPreset[] = [];
  private encoderPresets: EncoderPreset[] = [];
  private decoderPresets: DecoderPreset[] = [];
  private selectedCallsignId: string = "";
  private selectedEncoderId: string = "";
  private selectedDecoderId: string = "";

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      // Load callsigns
      const storedCallsigns = localStorage.getItem(STORAGE_KEYS.CALLSIGNS);
      if (storedCallsigns) {
        this.callsigns = JSON.parse(storedCallsigns);
      } else {
        this.callsigns = [...DEFAULT_CALLSIGNS];
        this.saveCallsigns();
      }

      // Load encoder presets
      const storedEncoder = localStorage.getItem(STORAGE_KEYS.ENCODER_PRESETS);
      if (storedEncoder) {
        this.encoderPresets = JSON.parse(storedEncoder);
      } else {
        this.encoderPresets = [...DEFAULT_ENCODER_PRESETS];
        this.saveEncoderPresets();
      }

      // Load decoder presets
      const storedDecoder = localStorage.getItem(STORAGE_KEYS.DECODER_PRESETS);
      if (storedDecoder) {
        this.decoderPresets = JSON.parse(storedDecoder);
      } else {
        this.decoderPresets = [...DEFAULT_DECODER_PRESETS];
        this.saveDecoderPresets();
      }

      // Load selections
      this.selectedCallsignId = localStorage.getItem(STORAGE_KEYS.SELECTED_CALLSIGN) || this.callsigns[0]?.id || "";
      this.selectedEncoderId = localStorage.getItem(STORAGE_KEYS.SELECTED_ENCODER) || this.getDefaultEncoderId();
      this.selectedDecoderId = localStorage.getItem(STORAGE_KEYS.SELECTED_DECODER) || this.getDefaultDecoderId();
    } catch {
      console.error("Failed to load presets from storage");
      this.callsigns = [...DEFAULT_CALLSIGNS];
      this.encoderPresets = [...DEFAULT_ENCODER_PRESETS];
      this.decoderPresets = [...DEFAULT_DECODER_PRESETS];
      this.selectedCallsignId = this.callsigns[0]?.id || "";
      this.selectedEncoderId = this.getDefaultEncoderId();
      this.selectedDecoderId = this.getDefaultDecoderId();
    }
  }

  private saveCallsigns() {
    localStorage.setItem(STORAGE_KEYS.CALLSIGNS, JSON.stringify(this.callsigns));
  }

  private saveEncoderPresets() {
    localStorage.setItem(STORAGE_KEYS.ENCODER_PRESETS, JSON.stringify(this.encoderPresets));
  }

  private saveDecoderPresets() {
    localStorage.setItem(STORAGE_KEYS.DECODER_PRESETS, JSON.stringify(this.decoderPresets));
  }

  private getDefaultEncoderId(): string {
    return this.encoderPresets.find(p => p.isDefault)?.id || this.encoderPresets[0]?.id || "";
  }

  private getDefaultDecoderId(): string {
    return this.decoderPresets.find(p => p.isDefault)?.id || this.decoderPresets[0]?.id || "";
  }

  // Callsign methods
  getCallsigns(): CallsignPreset[] {
    return [...this.callsigns];
  }

  getSelectedCallsign(): CallsignPreset | undefined {
    return this.callsigns.find(c => c.id === this.selectedCallsignId);
  }

  getSelectedCallsignValue(): string {
    return this.getSelectedCallsign()?.callsign || "";
  }

  selectCallsign(id: string) {
    if (this.callsigns.some(c => c.id === id)) {
      this.selectedCallsignId = id;
      localStorage.setItem(STORAGE_KEYS.SELECTED_CALLSIGN, id);
    }
  }

  addCallsign(callsign: string, name?: string): CallsignPreset {
    const id = callsign.toLowerCase().replace(/[^a-z0-9]/g, "");
    const newPreset: CallsignPreset = {
      id,
      callsign: callsign.toUpperCase(),
      name: name || id,
    };
    this.callsigns.push(newPreset);
    this.saveCallsigns();
    return newPreset;
  }

  updateCallsign(id: string, updates: Partial<CallsignPreset>) {
    const index = this.callsigns.findIndex(c => c.id === id);
    if (index !== -1) {
      if (updates.callsign) {
        this.callsigns[index].callsign = updates.callsign.toUpperCase();
      }
      if (updates.name !== undefined) {
        this.callsigns[index].name = updates.name;
      }
      this.saveCallsigns();
    }
  }

  removeCallsign(id: string) {
    this.callsigns = this.callsigns.filter(c => c.id !== id);
    if (this.selectedCallsignId === id) {
      this.selectedCallsignId = this.callsigns[0]?.id || "";
    }
    this.saveCallsigns();
  }

  // Encoder preset methods
  getEncoderPresets(): EncoderPreset[] {
    return [...this.encoderPresets];
  }

  getSelectedEncoder(): EncoderPreset | undefined {
    return this.encoderPresets.find(p => p.id === this.selectedEncoderId);
  }

  selectEncoder(id: string) {
    if (this.encoderPresets.some(p => p.id === id)) {
      this.selectedEncoderId = id;
      localStorage.setItem(STORAGE_KEYS.SELECTED_ENCODER, id);
    }
  }

  // Decoder preset methods
  getDecoderPresets(): DecoderPreset[] {
    return [...this.decoderPresets];
  }

  getSelectedDecoder(): DecoderPreset | undefined {
    return this.decoderPresets.find(p => p.id === this.selectedDecoderId);
  }

  selectDecoder(id: string) {
    if (this.decoderPresets.some(p => p.id === id)) {
      this.selectedDecoderId = id;
      localStorage.setItem(STORAGE_KEYS.SELECTED_DECODER, id);
    }
  }
}

/** Singleton instance */
export const presetManager = new PresetManager();
