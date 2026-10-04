/**
 * DeepCW CTC 解码
 *
 * 采用标准贪心 CTC：逐帧取 argmax，遇到 blank 复位去重状态。
 * 与参考实现（deepcw-engine examples）的greedyCtcDecode 逻辑一致。
 */
import {
  DEEPCW_VOCABULARY,
  DEEPCW_BLANK_INDEX,
  DEEPCW_OUTPUT_CLASSES,
} from "./config";
import { expandAbbreviations } from "./abbrevExpander";
import { resegment } from "./resegmenter";

export interface DecodedChar {
  char: string;
  /** 该字符所在帧的平均概率，作为可信度参考 */
  confidence: number;
}

export interface DeepCWDecodeResult {
  /** 模型原始输出（未做缩写还原、未重切分）*/
  raw: string;
  /** 缩写还原后的文本，例如 AR SK KN*/
  text: string;
  chars: DecodedChar[];
  /** 整段平均置信度 0~1 */
  confidence: number;
  timeSteps: number;
  /** 是否发生了连读重切分（说明原输出存在粘连）*/
  resegmented: boolean;
}

/**
 * 贪心 CTC 解码。
 *
 * @param logProbs 输出张量数据，[batch=1, time, classes] 展平
 * @param dims    张量维度 [1, time, classes]
 * @param enableResegment 是否做连读重切分（默认 true）
 */
export function greedyCTCDecode(
  logProbs: Float32Array | ArrayLike<number>,
  dims: readonly number[],
  enableResegment = true,
): DeepCWDecodeResult {
  const timeSteps = dims[1];
  const numClasses = dims[2] ?? DEEPCW_OUTPUT_CLASSES;
  const data = logProbs;

  let out = "";
  const chars: DecodedChar[] = [];
  let confidenceSum = 0;
  let emittedCount = 0;

  // prev = 上一个发射的 class 索引，-1 表示刚经历 blank
  let prev = -1;

  for (let t = 0; t < timeSteps; t++) {
    let bestIndex = 0;
    let bestValue = -Infinity;

    for (let c = 0; c < numClasses; c++) {
      const v = data[t * numClasses + c];
      if (v > bestValue) {
        bestValue = v;
        bestIndex = c;
      }
    }

    if (bestIndex === DEEPCW_BLANK_INDEX) {
      prev = -1;
      continue;
    }

    if (bestIndex !== prev) {
      const char = DEEPCW_VOCABULARY[bestIndex] ?? "";
      // log_probs 通常是 log-softmax，exp 后即概率
      const prob = Math.exp(bestValue);
      out += char;
      chars.push({ char, confidence: Number.isFinite(prob) ? prob : 0 });
      confidenceSum += Number.isFinite(prob) ? prob : 0;
      emittedCount++;
      prev = bestIndex;
    }
  }

  const confidence = emittedCount > 0 ? confidenceSum / emittedCount : 0;

  // 流水线：缩写还原 → 连读重切分
  const abbreviated = expandAbbreviations(out);

  let text = abbreviated;
  let resegmented = false;
  if (enableResegment && abbreviated) {
    const res = resegment(abbreviated);
    if (res.changed && res.tokens.length > 0) {
      text = res.tokens.join(" ");
      resegmented = true;
    }
  }

  return {
    raw: out,
    text,
    chars,
    confidence,
    timeSteps,
    resegmented,
  };
}
