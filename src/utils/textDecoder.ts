import type { Tensor } from "onnxruntime-web";
import { ENGLISH_CONFIG } from "../const";

export type TextSegment = {
  text: string;
  isAbbreviation: boolean;
};

function replaceConsecutiveChars(str: string): string {
  const regex = /(\S)\1+/g;
  return str.replace(regex, (match, p1) => {
    return p1 + " ".repeat(match.length - 1);
  });
}

function convertAbbreviationsWithSegments(str: string): TextSegment[] {
  const abbreviations = Object.entries(ENGLISH_CONFIG.ABBREVIATION) as [string, string][];

  if (abbreviations.length === 0) {
    return [{ text: str, isAbbreviation: false }];
  }

  const abbrevPattern = abbreviations.map(([abbrev]) => abbrev).join("|");
  const regex = new RegExp(`(${abbrevPattern})`, "g");

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: str.slice(lastIndex, match.index),
        isAbbreviation: false,
      });
    }

    const matchedText = match[0];
    const abbrevEntry = abbreviations.find(([abbrev]) => abbrev === matchedText);
    const expansion = abbrevEntry ? abbrevEntry[1] : matchedText;

    segments.push({
      text: expansion,
      isAbbreviation: true,
    });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < str.length) {
    segments.push({
      text: str.slice(lastIndex),
      isAbbreviation: false,
    });
  }

  return segments.length > 0 ? segments : [{ text: str, isAbbreviation: false }];
}

export function decodePredictions(
  pred: Tensor["data"],
  predShape: Tensor["dims"],
): TextSegment[][] {
  const [batchSize, timeSteps, numClasses] = predShape;
  const outputSegments: TextSegment[][] = [];
  const vocabulary = ENGLISH_CONFIG.VOCABULARY;

  for (let i = 0; i < batchSize; i++) {
    const predIndices: number[] = [];
    for (let t = 0; t < timeSteps; t++) {
      let maxProb = -Infinity;
      let maxIndex = 0;
      const offset = i * timeSteps * numClasses + t * numClasses;

      for (let c = 0; c < numClasses; c++) {
        // @ts-expect-error - Tensor data type is not properly typed
        if (pred[offset + c] > maxProb) {
          // @ts-expect-error - Tensor data type is not properly typed
          maxProb = pred[offset + c];
          maxIndex = c;
        }
      }
      predIndices.push(maxIndex);
    }

    const resText = predIndices.map((c) => vocabulary[c] || "").join("");

    const processedSegments = convertAbbreviationsWithSegments(
      replaceConsecutiveChars(resText),
    );

    outputSegments.push(processedSegments);
  }

  return outputSegments;
}
