/**
 * CW Phrase Library
 *
 * Common CW phrases and abbreviations used in amateur radio communication.
 * Organized by category for structured learning.
 */

export interface Phrase {
  id: string;
  text: string;
  morse: string;
  category: PhraseCategory;
  difficulty: "beginner" | "intermediate" | "advanced";
  description?: string;
}

export type PhraseCategory =
  | "greeting"      // Opening/closing phrases
  | "calls"         // CQ, callsign exchanges
  | "signal_report" // RST reports
  | "qso_info"      // QTH, name, etc.
  | "qsl"           // Acknowledgement
  | "contest"       // Contest exchanges
  | "abbreviation"  // Q-codes and abbreviations
  | "prosign"       // Prosigns
  | "qcode"         // Q-codes
  | "common"        // Common words
  | "technical"     // Equipment & technical terms
  | "organization"; // Ham radio organizations

import { MORSE_CODE } from "../const";

/**
 * Convert text to Morse code string
 */
export function textToMorse(text: string): string {
  const upper = text.toUpperCase();
  const morseParts: string[] = [];

  for (const char of upper) {
    if (char === " ") continue;
    if (MORSE_CODE[char]) {
      morseParts.push(MORSE_CODE[char]);
    }
  }

  return morseParts.join(" ");
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses Levenshtein distance
 */
export function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);

  // Quick check: if lengths differ by more than 30%, low similarity
  if (Math.abs(len1 - len2) / maxLen > 0.3) return 0;

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  return 1 - distance / maxLen;
}

/**
 * Match decoded text against phrase library
 * Returns the best matching phrase if similarity > threshold
 */
export function matchPhrase(
  decodedText: string,
  threshold: number = 0.7
): { matched: boolean; phrase: Phrase | null; similarity: number } {
  const upper = decodedText.toUpperCase().trim();

  let bestMatch: Phrase | null = null;
  let bestSimilarity = 0;

  for (const phrase of PHRASE_LIBRARY) {
    const similarity = stringSimilarity(upper, phrase.text);
    if (similarity > bestSimilarity && similarity >= threshold) {
      bestSimilarity = similarity;
      bestMatch = phrase;
    }
  }

  return {
    matched: bestMatch !== null && bestSimilarity >= threshold,
    phrase: bestMatch,
    similarity: bestSimilarity,
  };
}

// Pre-built phrase library
export const PHRASE_LIBRARY: Phrase[] = [
  // Greeting phrases
  {
    id: "cq",
    text: "CQ",
    morse: "-.-. --.-",
    category: "calls",
    difficulty: "beginner",
    description: "General call - anyone can respond"
  },
  {
    id: "qrz",
    text: "QRZ",
    morse: "--.- .-. --..",
    category: "calls",
    difficulty: "beginner",
    description: "Who is calling me?"
  },
  {
    id: "de",
    text: "DE",
    morse: "-.. .",
    category: "greeting",
    difficulty: "beginner",
    description: "From - used in callsign format"
  },
  {
    id: "k",
    text: "K",
    morse: "-.-",
    category: "greeting",
    difficulty: "beginner",
    description: "End of transmission, any station may transmit"
  },
  {
    id: "kn",
    text: "KN",
    morse: "-.-- -.",
    category: "greeting",
    difficulty: "intermediate",
    description: "End of transmission, only named station may transmit"
  },
  {
    id: "sk",
    text: "SK",
    morse: "... -.-",
    category: "greeting",
    difficulty: "intermediate",
    description: "End of contact / Silent key"
  },
  {
    id: "ar",
    text: "AR",
    morse: ".-.-",
    category: "greeting",
    difficulty: "intermediate",
    description: "End of message / Over"
  },
  {
    id: "cl",
    text: "CL",
    morse: "-.-.. -..",
    category: "greeting",
    difficulty: "intermediate",
    description: "Closing down station"
  },

  // Signal reports
  {
    id: "rst599",
    text: "599",
    morse: "..... ----. ----.",
    category: "signal_report",
    difficulty: "beginner",
    description: "Readability 5, Strength 9, Tone 9 - perfect signal"
  },
  {
    id: "rst579",
    text: "579",
    morse: "..... --... ----.",
    category: "signal_report",
    difficulty: "beginner",
    description: "Good signal, readable but difficult"
  },
  {
    id: "rst449",
    text: "449",
    morse: "....- ....- ----.",
    category: "signal_report",
    difficulty: "beginner",
    description: "Fair signal"
  },
  {
    id: "rst339",
    text: "339",
    morse: "...-- ...-- ----.",
    category: "signal_report",
    difficulty: "intermediate",
    description: "Barely readable, weak signal"
  },
  {
    id: "rst333",
    text: "333",
    morse: "...-- ...-- ...--",
    category: "signal_report",
    difficulty: "intermediate",
    description: "Fairly readable, moderate signal"
  },

  // QSO info
  {
    id: "name",
    text: "NAME",
    morse: "-. .- -- .",
    category: "qso_info",
    difficulty: "beginner",
    description: "What is your name?"
  },
  {
    id: "qth",
    text: "QTH",
    morse: "--.- - ....",
    category: "qso_info",
    difficulty: "beginner",
    description: "What is your location?"
  },
  {
    id: "qsl",
    text: "QSL",
    morse: "--.- ... .-..",
    category: "qsl",
    difficulty: "beginner",
    description: "I acknowledge receipt / Do you acknowledge?"
  },
  {
    id: "qso",
    text: "QSO",
    morse: "--.- ... ---",
    category: "qso_info",
    difficulty: "intermediate",
    description: "I can communicate with... / Communication"
  },
  {
    id: "wx",
    text: "WX",
    morse: ".-- -..-",
    category: "qso_info",
    difficulty: "beginner",
    description: "Weather report"
  },
  {
    id: "hr",
    text: "HR",
    morse: ".... .-. ",
    category: "qso_info",
    difficulty: "intermediate",
    description: "Here"
  },
  {
    id: "om",
    text: "OM",
    morse: "--- --",
    category: "greeting",
    difficulty: "beginner",
    description: "Old man - male operator"
  },
  {
    id: "yl",
    text: "YL",
    morse: "-.-- .-..",
    category: "greeting",
    difficulty: "beginner",
    description: "Young lady - female operator"
  },
  {
    id: "xylo",
    text: "XYL",
    morse: "-..- -.-- .-..",
    category: "qso_info",
    difficulty: "intermediate",
    description: "Wife"
  },
  {
    id: "es",
    text: "ES",
    morse: ". ...",
    category: "qso_info",
    difficulty: "beginner",
    description: "And"
  },

  // Numbers
  {
    id: "73",
    text: "73",
    morse: "--... ...--",
    category: "abbreviation",
    difficulty: "beginner",
    description: "Best regards"
  },
  {
    id: "88",
    text: "88",
    morse: "---.. ---..",
    category: "abbreviation",
    difficulty: "beginner",
    description: "Love and kisses"
  },
  {
    id: "55",
    text: "55",
    morse: "..... .....",
    category: "abbreviation",
    difficulty: "beginner",
    description: "Best wishes (ARRL field day)"
  },
  {
    id: "77",
    text: "77",
    morse: "--... --...",
    category: "abbreviation",
    difficulty: "intermediate",
    description: "Single wire marker"
  },

  // Contest exchanges
  {
    id: "serial",
    text: "001",
    morse: "----- ----- .----",
    category: "contest",
    difficulty: "beginner",
    description: "Serial number exchange example"
  },
  {
    id: "cqtest",
    text: "CQ TEST",
    morse: "-.-. --.- - . ... -",
    category: "contest",
    difficulty: "beginner",
    description: "Contest call"
  },

  // Common words
  {
    id: "copy",
    text: "COPY",
    morse: "-.-. --- .--. -.--",
    category: "qso_info",
    difficulty: "beginner",
    description: "Do you copy? / I understand"
  },
  {
    id: "same",
    text: "SAME",
    morse: "... .- -- .",
    category: "qso_info",
    difficulty: "intermediate",
    description: "Same as before"
  },
  {
    id: "very",
    text: "VERY",
    morse: "...- . .-. -.--",
    category: "qso_info",
    difficulty: "beginner",
    description: "Very"
  },
  {
    id: "good",
    text: "GOOD",
    morse: "--. --- --- -..",
    category: "qso_info",
    difficulty: "beginner",
    description: "Good"
  },
  {
    id: "nice",
    text: "NICE",
    morse: "-. .. -.-. .",
    category: "qso_info",
    difficulty: "intermediate",
    description: "Nice"
  },
  {
    id: "new",
    text: "NEW",
    morse: "-. . .--",
    category: "qso_info",
    difficulty: "beginner",
    description: "New"
  },
  {
    id: "now",
    text: "NOW",
    morse: "-. --- .--",
    category: "qso_info",
    difficulty: "beginner",
    description: "Now"
  },
  {
    id: "how",
    text: "HOW",
    morse: ".... --- .--",
    category: "qso_info",
    difficulty: "beginner",
    description: "How"
  },
  {
    id: "can",
    text: "CAN",
    morse: "-.-. .- -.",
    category: "qso_info",
    difficulty: "beginner",
    description: "Can"
  },
  {
    id: "will",
    text: "WILL",
    morse: ".-- .. .-.. .-..",
    category: "qso_info",
    difficulty: "beginner",
    description: "Will"
  },
  {
    id: "the",
    text: "THE",
    morse: "- .... .",
    category: "qso_info",
    difficulty: "intermediate",
    description: "The"
  },
  {
    id: "and",
    text: "AND",
    morse: ".- -.. -.",
    category: "qso_info",
    difficulty: "intermediate",
    description: "And"
  },
  {
    id: "are",
    text: "ARE",
    morse: ".- .-. .",
    category: "qso_info",
    difficulty: "intermediate",
    description: "Are"
  },
  {
    id: "but",
    text: "BUT",
    morse: "-... ..- -",
    category: "qso_info",
    difficulty: "intermediate",
    description: "But"
  },
  {
    id: "all",
    text: "ALL",
    morse: ".- .-.. .-..",
    category: "qso_info",
    difficulty: "intermediate",
    description: "All"
  },
  {
    id: "any",
    text: "ANY",
    morse: ".- -. -.--",
    category: "qso_info",
    difficulty: "intermediate",
    description: "Any"
  },
  {
    id: "this",
    text: "THIS",
    morse: "- .... .. ...",
    category: "qso_info",
    difficulty: "intermediate",
    description: "This"
  },
  {
    id: "that",
    text: "THAT",
    morse: "- .... .- -",
    category: "qso_info",
    difficulty: "intermediate",
    description: "That"
  },
  {
    id: "have",
    text: "HAVE",
    morse: ".... .- ... .",
    category: "qso_info",
    difficulty: "intermediate",
    description: "Have"
  },
  {
    id: "with",
    text: "WITH",
    morse: ".-- .. - ....",
    category: "qso_info",
    difficulty: "intermediate",
    description: "With"
  },

  // Q-codes
  {
    id: "qrm",
    text: "QRM",
    morse: "--.- .-. --",
    category: "abbreviation",
    difficulty: "intermediate",
    description: "Man-made interference"
  },
  {
    id: "qrn",
    text: "QRN",
    morse: "--.- .-. -.",
    category: "abbreviation",
    difficulty: "intermediate",
    description: "Natural interference / static"
  },
  {
    id: "qsb",
    text: "QSB",
    morse: "--.- ... -...",
    category: "abbreviation",
    difficulty: "intermediate",
    description: "Fading signals"
  },
  {
    id: "qsy",
    text: "QSY",
    morse: "--.- ... -.--",
    category: "abbreviation",
    difficulty: "intermediate",
    description: "Change frequency"
  },
  {
    id: "qro",
    text: "QRO",
    morse: "--.- .-. ---",
    category: "abbreviation",
    difficulty: "advanced",
    description: "Increase power"
  },
  {
    id: "qrp",
    text: "QRP",
    morse: "--.- .-. .--.",
    category: "abbreviation",
    difficulty: "advanced",
    description: "Decrease power"
  },
  {
    id: "qrt",
    text: "QRT",
    morse: "--.- .-. -",
    category: "abbreviation",
    difficulty: "intermediate",
    description: "Stop transmitting / closing down"
  },
  {
    id: "qrq",
    text: "QRQ",
    morse: "--.- .-. --.-",
    category: "abbreviation",
    difficulty: "advanced",
    description: "Send faster"
  },
  {
    id: "qsp",
    text: "QSP",
    morse: "--.- ... .--.",
    category: "abbreviation",
    difficulty: "advanced",
    description: "I will relay to..."
  },

  // Full sentences (advanced)
  {
    id: "cq_cq_de",
    text: "CQ CQ DE",
    morse: "-.-. --.- -.-. --.- -.. .",
    category: "calls",
    difficulty: "beginner",
    description: "Calling any station"
  },
  {
    id: "ur_rst",
    text: "UR RST",
    morse: "..-.- ... . ... -",
    category: "qso_info",
    difficulty: "beginner",
    description: "Your signal report"
  },
  {
    id: "qsl_73",
    text: "QSL 73",
    morse: "--.- ... .-.. --... ...--",
    category: "qsl",
    difficulty: "beginner",
    description: "QSL and best regards"
  },
  {
    id: "op",
    text: "OP",
    morse: "--- .--.",
    category: "qso_info",
    difficulty: "beginner",
    description: "Operator"
  },
  {
    id: "tx",
    text: "TX",
    morse: "- ..-..",
    category: "abbreviation",
    difficulty: "beginner",
    description: "Transmitter"
  },
  {
    id: "rx",
    text: "RX",
    morse: ".-. -..-",
    category: "abbreviation",
    difficulty: "beginner",
    description: "Receiver"
  },

  // ===== PROSIGNS =====
  { id: "as", text: "AS", morse: ".-...", category: "prosign", difficulty: "intermediate", description: "Wait / Standby" },
  { id: "bk", text: "BK", morse: "-...-.", category: "prosign", difficulty: "intermediate", description: "Break / Invite to transmit" },
  { id: "bt_prosign", text: "BT", morse: "-...-", category: "prosign", difficulty: "beginner", description: "Separator / Double dash" },
  { id: "ct", text: "CT", morse: "-.-.-", category: "prosign", difficulty: "advanced", description: "Attention / All stations" },
  { id: "sos", text: "SOS", morse: "...---...", category: "prosign", difficulty: "beginner", description: "Distress signal" },

  // ===== MORE Q-CODES =====
  { id: "qra", text: "QRA", morse: "--.- .-. .-", category: "qcode", difficulty: "intermediate", description: "What is your name?" },
  { id: "qrb", text: "QRB", morse: "--.- .-. -...", category: "qcode", difficulty: "intermediate", description: "How far are you?" },
  { id: "qrg", text: "QRG", morse: "--.- .-. --.", category: "qcode", difficulty: "intermediate", description: "Will you tell my exact frequency?" },
  { id: "qri", text: "QRI", morse: "--.- .-. ..", category: "qcode", difficulty: "advanced", description: "How is my tone?" },
  { id: "qrk", text: "QRK", morse: "--.- .-. -.-", category: "qcode", difficulty: "intermediate", description: "What is my signal readability?" },
  { id: "qru", text: "QRU", morse: "--.- .-. ..-", category: "qcode", difficulty: "intermediate", description: "Have you anything for me?" },
  { id: "qrv", text: "QRV", morse: "--.- .-. ...-", category: "qcode", difficulty: "intermediate", description: "Are you ready?" },
  { id: "qrx", text: "QRX", morse: "--.- .-. -..-", category: "qcode", difficulty: "intermediate", description: "When will you call again?" },
  { id: "qry", text: "QRY", morse: "--.- .-. -.--", category: "qcode", difficulty: "advanced", description: "What is my turn?" },
  { id: "qsa", text: "QSA", morse: "--.- ... .-", category: "qcode", difficulty: "intermediate", description: "What is my signal strength?" },
  { id: "qsd", text: "QSD", morse: "--.- ... -..", category: "qcode", difficulty: "advanced", description: "Is my keying defective?" },
  { id: "qsm", text: "QSM", morse: "--.- ... --", category: "qcode", difficulty: "intermediate", description: "Repeat last message" },
  { id: "qsn", text: "QSN", morse: "--.- ... -.", category: "qcode", difficulty: "intermediate", description: "Did you hear me?" },
  { id: "qsr", text: "QSR", morse: "--.- ... .-.", category: "qcode", difficulty: "advanced", description: "Should I repeat on another frequency?" },
  { id: "qst", text: "QST", morse: "--.- ... -", category: "qcode", difficulty: "intermediate", description: "General call / CQ to all" },
  { id: "qsv", text: "QSV", morse: "--.- ... ...-", category: "qcode", difficulty: "advanced", description: "Shall I send a series of V's?" },
  { id: "qti", text: "QTI", morse: "--.- - ..", category: "qcode", difficulty: "advanced", description: "What is your time?" },
  { id: "qtr", text: "QTR", morse: "--.- - .-.", category: "qcode", difficulty: "intermediate", description: "Exact time" },

  // ===== MORE RST REPORTS =====
  { id: "rst589", text: "589", morse: "..... ---.. ----.", category: "signal_report", difficulty: "beginner", description: "RST: Good, slight difficulty" },
  { id: "rst569", text: "569", morse: "..... -.... ----.", category: "signal_report", difficulty: "beginner", description: "RST: Fair" },
  { id: "rst559", text: "559", morse: "..... ..... ----.", category: "signal_report", difficulty: "beginner", description: "RST: Fairly good" },
  { id: "rst557", text: "557", morse: "..... ..... --...", category: "signal_report", difficulty: "intermediate", description: "RST: Fairly good" },
  { id: "rst119", text: "119", morse: ".---- .---- ----.", category: "signal_report", difficulty: "intermediate", description: "RST: Barely audible" },

  // ===== MORE ABBREVIATIONS =====
  { id: "agn", text: "AGN", morse: ".- --. -.", category: "abbreviation", difficulty: "beginner", description: "Again" },
  { id: "ant", text: "ANT", morse: ".- -. -", category: "abbreviation", difficulty: "intermediate", description: "Antenna" },
  { id: "c_yes", text: "C", morse: "-.-.", category: "abbreviation", difficulty: "beginner", description: "Yes / Correct" },
  { id: "cu", text: "CU", morse: "-.-. ..-", category: "abbreviation", difficulty: "beginner", description: "See you" },
  { id: "cul", text: "CUL", morse: "-.-. ..- .-..", category: "abbreviation", difficulty: "intermediate", description: "See you later" },
  { id: "cw", text: "CW", morse: "-.-. .--", category: "abbreviation", difficulty: "beginner", description: "Continuous wave" },
  { id: "fb", text: "FB", morse: "..-.. -...", category: "abbreviation", difficulty: "beginner", description: "Fine business / Excellent" },
  { id: "fm", text: "FM", morse: "..-. --", category: "abbreviation", difficulty: "intermediate", description: "From" },
  { id: "ga", text: "GA", morse: "--. .-", category: "abbreviation", difficulty: "beginner", description: "Good afternoon / Go ahead" },
  { id: "gb", text: "GB", morse: "--. -...", category: "abbreviation", difficulty: "beginner", description: "Good bye" },
  { id: "gd", text: "GD", morse: "--. -..", category: "abbreviation", difficulty: "beginner", description: "Good day" },
  { id: "ge", text: "GE", morse: "--. .", category: "abbreviation", difficulty: "beginner", description: "Good evening" },
  { id: "gl", text: "GL", morse: "--. .-..", category: "abbreviation", difficulty: "intermediate", description: "Good luck" },
  { id: "gm", text: "GM", morse: "--. --", category: "abbreviation", difficulty: "beginner", description: "Good morning" },
  { id: "gn", text: "GN", morse: "--. -.", category: "abbreviation", difficulty: "beginner", description: "Good night" },
  { id: "gud", text: "GUD", morse: "--. ..- -..", category: "abbreviation", difficulty: "beginner", description: "Good" },
  { id: "hi", text: "HI", morse: ".... ..", category: "abbreviation", difficulty: "beginner", description: "Laughter / Humor" },
  { id: "hw", text: "HW", morse: ".... .--", category: "abbreviation", difficulty: "beginner", description: "How / How do you copy?" },
  { id: "lid", text: "LID", morse: ".-.. .. -..", category: "abbreviation", difficulty: "intermediate", description: "Poor operator" },
  { id: "mx", text: "MX", morse: "-- -..-", category: "abbreviation", difficulty: "intermediate", description: "Merry Christmas" },
  { id: "nil", text: "NIL", morse: "-. .. .-..", category: "abbreviation", difficulty: "intermediate", description: "Nothing / I have nothing" },
  { id: "nr", text: "NR", morse: "-. .-.", category: "abbreviation", difficulty: "beginner", description: "Number / Near" },
  { id: "nw", text: "NW", morse: "-. .--", category: "abbreviation", difficulty: "beginner", description: "Now / I await" },
  { id: "ob", text: "OB", morse: "--- -...", category: "abbreviation", difficulty: "intermediate", description: "Old boy" },
  { id: "oc", text: "OC", morse: "--- -.-.", category: "abbreviation", difficulty: "intermediate", description: "Old chap" },
  { id: "ok", text: "OK", morse: "--- -.-", category: "abbreviation", difficulty: "beginner", description: "All correct" },
  { id: "ot", text: "OT", morse: "--- -", category: "abbreviation", difficulty: "intermediate", description: "Old timer" },
  { id: "pa", text: "PA", morse: ".--. .-", category: "abbreviation", difficulty: "intermediate", description: "Power amplifier" },
  { id: "pse", text: "PSE", morse: ".--. ... .", category: "abbreviation", difficulty: "beginner", description: "Please" },
  { id: "pwr", text: "PWR", morse: ".--. .-- .-.", category: "abbreviation", difficulty: "intermediate", description: "Power" },
  { id: "r", text: "R", morse: ".-.", category: "abbreviation", difficulty: "beginner", description: "Received / Roger" },
  { id: "rg", text: "RG", morse: ".-. --.", category: "abbreviation", difficulty: "intermediate", description: "Regards" },
  { id: "rig", text: "RIG", morse: ".-. .. --.", category: "abbreviation", difficulty: "intermediate", description: "Radio equipment" },
  { id: "sa", text: "SA", morse: "... .-", category: "abbreviation", difficulty: "intermediate", description: "Say / Subject" },
  { id: "sed", text: "SED", morse: "... . -..", category: "abbreviation", difficulty: "intermediate", description: "Said" },
  { id: "sig", text: "SIG", morse: "... .. --.", category: "abbreviation", difficulty: "intermediate", description: "Signal / Signature" },
  { id: "sked", text: "SKED", morse: "... -.- . -..", category: "abbreviation", difficulty: "intermediate", description: "Schedule" },
  { id: "stn", text: "STN", morse: "... - -.", category: "abbreviation", difficulty: "intermediate", description: "Station" },
  { id: "t", text: "T", morse: "-", category: "abbreviation", difficulty: "beginner", description: "Zero / Memory" },
  { id: "tks", text: "TKS", morse: "- -.- ...", category: "abbreviation", difficulty: "beginner", description: "Thanks" },
  { id: "tu", text: "TU", morse: "- ..-", category: "abbreviation", difficulty: "beginner", description: "Thank you" },
  { id: "ur", text: "UR", morse: "..- .-.", category: "abbreviation", difficulty: "beginner", description: "Your / You are" },
  { id: "vy", text: "VY", morse: "...- -.--", category: "abbreviation", difficulty: "beginner", description: "Very" },
  { id: "wb", text: "WB", morse: ".-- -...", category: "abbreviation", difficulty: "intermediate", description: "Weather" },
  { id: "wl", text: "WL", morse: ".-- .-..", category: "abbreviation", difficulty: "beginner", description: "Will / Well" },
  { id: "ym", text: "YM", morse: "-.-- --", category: "abbreviation", difficulty: "intermediate", description: "Young man" },
  { id: "yr", text: "YR", morse: "-.-- .-.", category: "abbreviation", difficulty: "beginner", description: "Year / Your" },
  { id: "zulu", text: "ZULU", morse: "--.. ..- .-.. ..-", category: "abbreviation", difficulty: "intermediate", description: "Zulu time (UTC)" },

  // ===== COMMON WORDS =====
  { id: "about", text: "ABOUT", morse: ".- -... --- ..- -", category: "common", difficulty: "intermediate", description: "About" },
  { id: "again", text: "AGAIN", morse: ".- --. .- .. -.", category: "common", difficulty: "beginner", description: "Again" },
  { id: "back", text: "BACK", morse: "-... .- -.-.", category: "common", difficulty: "intermediate", description: "Back" },
  { id: "day", text: "DAY", morse: "-.. .- -.--", category: "common", difficulty: "intermediate", description: "Day" },
  { id: "down", text: "DOWN", morse: "-.. .- .-- -.", category: "common", difficulty: "intermediate", description: "Down" },
  { id: "first", text: "FIRST", morse: "..-. .. .-. ... -", category: "common", difficulty: "intermediate", description: "First" },
  { id: "for", text: "FOR", morse: "..-. --- .-.", category: "common", difficulty: "intermediate", description: "For" },
  { id: "from", text: "FROM", morse: "..-. .-. --- --", category: "common", difficulty: "intermediate", description: "From" },
  { id: "get", text: "GET", morse: "--. . -", category: "common", difficulty: "intermediate", description: "Get" },
  { id: "go", text: "GO", morse: "--. ---", category: "common", difficulty: "intermediate", description: "Go" },
  { id: "got", text: "GOT", morse: "--. --- -", category: "common", difficulty: "intermediate", description: "Got" },
  { id: "hello", text: "HELLO", morse: ".... . .-.. .-.. ---", category: "common", difficulty: "intermediate", description: "Hello" },
  { id: "home", text: "HOME", morse: ".... --- -- .", category: "common", difficulty: "intermediate", description: "Home" },
  { id: "iam", text: "I AM", morse: ".. .- --", category: "common", difficulty: "beginner", description: "I am" },
  { id: "just", text: "JUST", morse: ".--- ..- ... -", category: "common", difficulty: "intermediate", description: "Just" },
  { id: "know", text: "KNOW", morse: "- -. --- .--", category: "common", difficulty: "intermediate", description: "Know" },
  { id: "last", text: "LAST", morse: ".-.. .- ... -", category: "common", difficulty: "intermediate", description: "Last" },
  { id: "like", text: "LIKE", morse: ".-.. .. -. -.- .", category: "common", difficulty: "intermediate", description: "Like" },
  { id: "long", text: "LONG", morse: ".-.. --- -. --.", category: "common", difficulty: "intermediate", description: "Long" },
  { id: "made", text: "MADE", morse: "-- .- -.. .", category: "common", difficulty: "intermediate", description: "Made" },
  { id: "make", text: "MAKE", morse: "-- .- -.- .", category: "common", difficulty: "intermediate", description: "Make" },
  { id: "many", text: "MANY", morse: "-- .- -. -.--", category: "common", difficulty: "intermediate", description: "Many" },
  { id: "more", text: "MORE", morse: "-- --- .-. .", category: "common", difficulty: "intermediate", description: "More" },
  { id: "much", text: "MUCH", morse: "-- ..- -.-.", category: "common", difficulty: "intermediate", description: "Much" },
  { id: "must", text: "MUST", morse: "-- ..- ... -", category: "common", difficulty: "intermediate", description: "Must" },
  { id: "need", text: "NEED", morse: "-. . . -..", category: "common", difficulty: "intermediate", description: "Need" },
  { id: "next", text: "NEXT", morse: "-. . -..- -", category: "common", difficulty: "intermediate", description: "Next" },
  { id: "of", text: "OF", morse: "--- ..-.", category: "common", difficulty: "intermediate", description: "Of" },
  { id: "off", text: "OFF", morse: "--- ..-. ..-.", category: "common", difficulty: "intermediate", description: "Off" },
  { id: "once", text: "ONCE", morse: "--- -. -.-. .", category: "common", difficulty: "intermediate", description: "Once" },
  { id: "only", text: "ONLY", morse: "--- -. .-.. -.--", category: "common", difficulty: "intermediate", description: "Only" },
  { id: "other", text: "OTHER", morse: "--- - .... . .-.", category: "common", difficulty: "intermediate", description: "Other" },
  { id: "out", text: "OUT", morse: "--- ..- -", category: "common", difficulty: "intermediate", description: "Out" },
  { id: "people", text: "PEOPLE", morse: ".--. . --- .--. .-.. .", category: "common", difficulty: "intermediate", description: "People" },
  { id: "pretty", text: "PRETTY", morse: ".--. .-. . - - -.--", category: "common", difficulty: "intermediate", description: "Pretty" },
  { id: "put", text: "PUT", morse: ".--. ..- -", category: "common", difficulty: "intermediate", description: "Put" },
  { id: "right", text: "RIGHT", morse: ".-. .. --. .... -", category: "common", difficulty: "intermediate", description: "Right / Correct" },
  { id: "same", text: "SAME", morse: "... .- -- .", category: "common", difficulty: "intermediate", description: "Same" },
  { id: "see", text: "SEE", morse: "... . .", category: "common", difficulty: "intermediate", description: "See" },
  { id: "send", text: "SEND", morse: "... . -. -..", category: "common", difficulty: "intermediate", description: "Send" },
  { id: "she", text: "SHE", morse: "... .... .", category: "common", difficulty: "intermediate", description: "She" },
  { id: "slow", text: "SLOW", morse: "... .-.. --- .--", category: "common", difficulty: "beginner", description: "Slow" },
  { id: "so", text: "SO", morse: "... ---", category: "common", difficulty: "intermediate", description: "So" },
  { id: "some", text: "SOME", morse: "... --- -- .", category: "common", difficulty: "intermediate", description: "Some" },
  { id: "sound", text: "SOUND", morse: "... --- ..- -. -..", category: "common", difficulty: "intermediate", description: "Sound" },
  { id: "still", text: "STILL", morse: "... - .. .-.. .-..", category: "common", difficulty: "intermediate", description: "Still" },
  { id: "stop", text: "STOP", morse: "... - --- .--.", category: "common", difficulty: "beginner", description: "Stop" },
  { id: "such", text: "SUCH", morse: "... ..- -.-.", category: "common", difficulty: "advanced", description: "Such" },
  { id: "take", text: "TAKE", morse: "- .- -.- .", category: "common", difficulty: "intermediate", description: "Take" },
  { id: "talk", text: "TALK", morse: "- .- .-.. -.-", category: "common", difficulty: "intermediate", description: "Talk" },
  { id: "tell", text: "TELL", morse: "- . .-.. .-..", category: "common", difficulty: "intermediate", description: "Tell" },
  { id: "then", text: "THEN", morse: "- .... . -.", category: "common", difficulty: "intermediate", description: "Then" },
  { id: "there", text: "THERE", morse: "- .... . .-. .", category: "common", difficulty: "intermediate", description: "There" },
  { id: "these", text: "THESE", morse: "- .... . ... .", category: "common", difficulty: "intermediate", description: "These" },
  { id: "they", text: "THEY", morse: "- .... . -.--", category: "common", difficulty: "intermediate", description: "They" },
  { id: "thing", text: "THING", morse: "- .... .. -. --.", category: "common", difficulty: "intermediate", description: "Thing" },
  { id: "think", text: "THINK", morse: "- .... .. -. -.-", category: "common", difficulty: "intermediate", description: "Think" },
  { id: "those", text: "THOSE", morse: "- .... --- ... .", category: "common", difficulty: "advanced", description: "Those" },
  { id: "three", text: "THREE", morse: "- .... .-. . .", category: "common", difficulty: "intermediate", description: "Three" },
  { id: "time", text: "TIME", morse: "- .. -- .", category: "common", difficulty: "intermediate", description: "Time" },
  { id: "today", text: "TODAY", morse: "- --- -.. .- -.--", category: "common", difficulty: "intermediate", description: "Today" },
  { id: "too", text: "TOO", morse: "- --- ---", category: "common", difficulty: "intermediate", description: "Too" },
  { id: "two", text: "TWO", morse: "- .-- ---", category: "common", difficulty: "intermediate", description: "Two" },
  { id: "up", text: "UP", morse: "..- .--.", category: "common", difficulty: "intermediate", description: "Up" },
  { id: "want", text: "WANT", morse: ".-- .- -. -", category: "common", difficulty: "intermediate", description: "Want" },
  { id: "went", text: "WENT", morse: ".-- . -. -", category: "common", difficulty: "intermediate", description: "Went" },
  { id: "were", text: "WER", morse: ".-- . .-.", category: "common", difficulty: "intermediate", description: "Were" },
  { id: "where", text: "WHERE", morse: ".-- .... . .-. .", category: "common", difficulty: "intermediate", description: "Where" },
  { id: "which", text: "WHICH", morse: ".-- .... .. -.-.", category: "common", difficulty: "intermediate", description: "Which" },
  { id: "while", text: "WHILE", morse: ".-- .... .. .-.. .", category: "common", difficulty: "intermediate", description: "While" },
  { id: "who", text: "WHO", morse: ".-- .... ---", category: "common", difficulty: "intermediate", description: "Who" },
  { id: "wish", text: "WISH", morse: ".-- .. ... ....", category: "common", difficulty: "intermediate", description: "Wish" },
  { id: "work", text: "WKR", morse: ".-- -.- .-.", category: "common", difficulty: "intermediate", description: "Work" },
  { id: "yes", text: "YES", morse: "-.-- . ...", category: "common", difficulty: "beginner", description: "Yes" },
  { id: "zero", text: "ZERO", morse: "--.. . .-. ---", category: "common", difficulty: "intermediate", description: "Zero" },

  // ===== TECHNICAL TERMS =====
  { id: "balun", text: "BALUN", morse: "-... .- .-.. ..- -.", category: "technical", difficulty: "advanced", description: "Balun" },
  { id: "beam", text: "BEAM", morse: "-... . .- --", category: "technical", difficulty: "intermediate", description: "Beam antenna" },
  { id: "dipole", text: "DIPOLE", morse: "-.. .. .--. --- .-.. .", category: "technical", difficulty: "intermediate", description: "Dipole antenna" },
  { id: "freq", text: "FREQ", morse: "..-. .-. . --", category: "technical", difficulty: "beginner", description: "Frequency" },
  { id: "gnd", text: "GND", morse: "--. -. -..", category: "technical", difficulty: "intermediate", description: "Ground" },
  { id: "hf", text: "HF", morse: ".... ..-.", category: "technical", difficulty: "intermediate", description: "High frequency" },
  { id: "key", text: "KEY", morse: "-.- . -.--", category: "technical", difficulty: "beginner", description: "Morse key" },
  { id: "kw", text: "KW", morse: "-.- .--", category: "technical", difficulty: "intermediate", description: "Kilowatt" },
  { id: "linear", text: "LIN", morse: ".-.. .. -.", category: "technical", difficulty: "advanced", description: "Linear amplifier" },
  { id: "meter", text: "MTR", morse: "-- - .-.", category: "technical", difficulty: "intermediate", description: "Meter" },
  { id: "mobile", text: "MOB", morse: "-- --- -... ..-.", category: "technical", difficulty: "intermediate", description: "Mobile" },
  { id: "ohm", text: "OHM", morse: "--- .... --", category: "technical", difficulty: "intermediate", description: "Ohm (unit)" },
  { id: "preamp", text: "PA", morse: ".--. .-", category: "technical", difficulty: "advanced", description: "Preamplifier" },
  { id: "rcv", text: "RCV", morse: ".-. -.-. ...-", category: "technical", difficulty: "intermediate", description: "Receiver" },
  { id: "rf", text: "RF", morse: ".-. ..-.", category: "technical", difficulty: "intermediate", description: "Radio frequency" },
  { id: "s_meter", text: "S-METER", morse: "... -- . - . .-.", category: "technical", difficulty: "intermediate", description: "Signal meter" },
  { id: "shack", text: "SHACK", morse: ".... .- -.-. -.-", category: "technical", difficulty: "intermediate", description: "Radio shack" },
  { id: "swr", text: "SWR", morse: "... .-- .-.", category: "technical", difficulty: "intermediate", description: "Standing wave ratio" },
  { id: "tuner", text: "TUN", morse: "- ..- -.", category: "technical", difficulty: "intermediate", description: "Antenna tuner" },
  { id: "uhf", text: "UHF", morse: "..- .... ..-.", category: "technical", difficulty: "intermediate", description: "Ultra high frequency" },
  { id: "vfo", text: "VFO", morse: "...- ..-.. ---", category: "technical", difficulty: "intermediate", description: "Variable frequency oscillator" },
  { id: "vhf", text: "VHF", morse: "...- .... ..-.", category: "technical", difficulty: "intermediate", description: "Very high frequency" },
  { id: "volt", text: "VLT", morse: "...- .-.. -", category: "technical", difficulty: "intermediate", description: "Volt" },
  { id: "watt", text: "WATT", morse: ".-- .- - -", category: "technical", difficulty: "beginner", description: "Watt" },
  { id: "wire", text: "WIRE", morse: ".-- .. .-. .", category: "technical", difficulty: "intermediate", description: "Wire" },
  { id: "yagi", text: "YAGI", morse: "-.-- .- --. ..", category: "technical", difficulty: "intermediate", description: "Yagi antenna" },

  // ===== ORGANIZATIONS =====
  { id: "arrl", text: "ARRL", morse: ".- .-. .-. .-..", category: "organization", difficulty: "intermediate", description: "American Radio Relay League" },
  { id: "ham", text: "HAM", morse: ".... .- --", category: "organization", difficulty: "beginner", description: "Amateur radio operator" },
  { id: "fcc", text: "FCC", morse: "..-. -.-. -.-.", category: "organization", difficulty: "intermediate", description: "Federal Communications Commission" },
  { id: "iaru", text: "IARU", morse: ".. .- .-. ..-", category: "organization", difficulty: "advanced", description: "International Amateur Radio Union" },

  // ===== CONTEST =====
  { id: "ur_serial", text: "UR NR", morse: "..- .-. -. .-.", category: "contest", difficulty: "beginner", description: "Your number (contest exchange)" },
];

/**
 * Get phrases by category
 */
export function getPhrasesByCategory(category: PhraseCategory): Phrase[] {
  return PHRASE_LIBRARY.filter(p => p.category === category);
}

/**
 * Get phrases by difficulty
 */
export function getPhrasesByDifficulty(difficulty: Phrase["difficulty"]): Phrase[] {
  return PHRASE_LIBRARY.filter(p => p.difficulty === difficulty);
}

/**
 * Get all unique categories
 */
export function getCategories(): PhraseCategory[] {
  return [...new Set(PHRASE_LIBRARY.map(p => p.category))];
}

/**
 * Get a random phrase for practice
 */
export function getRandomPhrase(difficulty?: Phrase["difficulty"]): Phrase {
  const phrases = difficulty ? getPhrasesByDifficulty(difficulty) : PHRASE_LIBRARY;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get multiple random phrases for a practice session
 */
export function getPracticeSet(
  count: number = 10,
  difficulty?: Phrase["difficulty"]
): Phrase[] {
  const pool = difficulty ? getPhrasesByDifficulty(difficulty) : [...PHRASE_LIBRARY];
  const selected: Phrase[] = [];

  while (selected.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(index, 1)[0]);
  }

  return selected;
}
