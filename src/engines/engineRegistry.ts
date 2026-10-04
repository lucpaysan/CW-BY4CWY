/**
 * 解码引擎抽象层
 *
 * ## ⚠️ 当前状态：未接入生产（2026-10-04）
 *
 * 本模块目前**仅被 `__tests__/arbitrationCheck.ts` 引用**，生产代码零引用。
 * 原因是仲裁需要**两个架构不同的引擎**才有意义，而第二个引擎
 * （CWformer，MIT）尚未接入浏览器 —— 它需要移植 40-bin log-mel 前端、
 * 16kHz 重采样与 51 个 KV/conv 状态张量。
 *
 * 在接入之前，它是一份**已验证可行的设计**（仲裁策略的 30 项测试全通过），
 * 而不是死代码。请勿误以为它已在运行。
 *
 * ## 为什么需要
 *
 * 实测发现两个模型各有优势，且在粘连场景下互补度极高：
 *
 * | 场景 | DeepCW | CWformer |
 * |---|---|---|
 * | 标准时序 | CER 0% | CER 7-10% |
 * | 粘连时序 | CER 55-79% | CER 38-64% |
 * | 粘连场景互补度 | — | 88-100% |
 *
 * 也就是说：**没有哪个模型单独能搞定所有场景**。
 * 本模块让上层可以按需选择引擎，或在两者间做仲裁。
 *
 * ## 已否决的方案（勿再尝试）
 *
 * 同一模型的多窗口投票实测**无效甚至有害**：
 *   - 偏移窗口投票：CER 24.7% → 31.0%（裁剪丢失首尾信号）
 *   - 多相位 hop 投票：CER 24.7% → 57.8%（模型仅在 hop=48 训练，其他 hop 是分布外输入）
 *
 * 根本原因：hop=48 与频带 400-1200Hz 是模型的**硬约束**，不是可调超参。
 * 任何改变输入分布的「投票」都会让模型输出乱码。
 *
 * 真正有互补性的是**架构不同**的模型（DeepCW 的 CRNN vs CWformer 的 Conformer）。
 */

export type EngineId = "deepcw" | "cwformer";

export interface EngineCapability {
  id: EngineId;
  name: string;
  /** 模型许可 */
  license: string;
  /** 采样率要求 */
  sampleRate: number;
  /** 是否为流式（KV cache）模型 */
  streaming: boolean;
  /** 词表是否含业余缩写 */
  hasProsigns: boolean;
}

export const ENGINE_INFO: Record<EngineId, EngineCapability> = {
  deepcw: {
    id: "deepcw",
    name: "DeepCW",
    license: "AGPL-3.0",
    sampleRate: 3200,
    streaming: false,
    hasProsigns: false,
  },
  cwformer: {
    id: "cwformer",
    name: "CWformer",
    license: "MIT",
    sampleRate: 16000,
    streaming: true,
    hasProsigns: true,
  },
};

/** 单个引擎的解码结果 */
export interface EngineResult {
  engine: EngineId;
  text: string;
  raw: string;
  confidence: number;
  /** 该引擎的独有特征：可用于仲裁 */
  callsigns: string[];
  reports: string[];
  qcodes: string[];
  /** 推理耗时（毫秒） */
  elapsedMs: number;
}

/**
 * 仲裁策略：根据两引擎结果选择最终输出。
 *
 * 核心依据（来自实测）：
 * - 两者一致 → 直接采用（高置信）
 * - 两者不一致 → 用「结构化信号数量」仲裁：
 *   能提取出更多呼号/信号报告/Q 码的那个更可信
 * - 都为空 → 保持空
 */
export function arbitrate(
  results: EngineResult[],
): { text: string; source: EngineId | "consensus" | "none"; agreement: number } {
  const valid = results.filter((r) => r.text.trim().length > 0);

  if (valid.length === 0) {
    return { text: "", source: "none", agreement: 0 };
  }

  if (valid.length === 1) {
    return { text: valid[0].text, source: valid[0].engine, agreement: 0 };
  }

  const [a, b] = valid;
  const normA = normalize(a.text);
  const normB = normalize(b.text);

  // 一致（忽略空格差异）
  if (normA === normB) {
    return { text: a.text, source: "consensus", agreement: 1 };
  }

  // 不一致：统计各自能提取多少结构化信息
  const scoreA = structuralScore(a);
  const scoreB = structuralScore(b);

  const agreement = commonPrefixRatio(normA, normB);

  if (scoreA > scoreB) {
    return { text: a.text, source: a.engine, agreement };
  }
  if (scoreB > scoreA) {
    return { text: b.text, source: b.engine, agreement };
  }

  // 结构化信息相同（都是 0 或一样多）→ 取置信度更高的
  if (a.confidence >= b.confidence) {
    return { text: a.text, source: a.engine, agreement };
  }
  return { text: b.text, source: b.engine, agreement };
}

/** 结构化信号数量：呼号 + 报告 + Q 码 */
function structuralScore(r: EngineResult): number {
  return r.callsigns.length * 3 + r.reports.length * 2 + r.qcodes.length;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

/** 公共前缀占比，作为一致度指标 */
function commonPrefixRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  let same = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) same++;
    else break;
  }
  return same / max;
}

/**
 * 引擎健康状态：用于自动降级。
 */
export interface EngineHealth {
  engine: EngineId;
  loaded: boolean;
  consecutiveFailures: number;
  disabled: boolean;
}

export class EngineRegistry {
  private health = new Map<EngineId, EngineHealth>();

  constructor(engines: EngineId[] = ["deepcw"]) {
    for (const id of engines) {
      this.health.set(id, {
        engine: id,
        loaded: false,
        consecutiveFailures: 0,
        disabled: false,
      });
    }
  }

  get(id: EngineId): EngineHealth {
    const h = this.health.get(id);
    if (!h) throw new Error(`Unknown engine: ${id}`);
    return h;
  }

  markLoaded(id: EngineId): void {
    const h = this.get(id);
    h.loaded = true;
    h.consecutiveFailures = 0;
  }

  /** 记录一次失败，达到阈值则禁用该引擎 */
  markFailed(id: EngineId, threshold = 3): boolean {
    const h = this.get(id);
    h.consecutiveFailures++;
    if (h.consecutiveFailures >= threshold) {
      h.disabled = true;
      return true; // 本次调用应降级
    }
    return false;
  }

  markSuccess(id: EngineId): void {
    const h = this.get(id);
    h.consecutiveFailures = 0;
  }

  /** 当前可用的引擎（按优先级排序） */
  available(preferred: EngineId[]): EngineId[] {
    return preferred.filter((id) => {
      const h = this.health.get(id);
      return h && !h.disabled;
    });
  }

  /** 生成 UI 用的状态描述 */
  describe(): string[] {
    return [...this.health.values()].map((h) => {
      const info = ENGINE_INFO[h.engine];
      const state = h.disabled
        ? "已禁用（连续失败）"
        : h.loaded
          ? "就绪"
          : "未加载";
      return `${info.name}（${info.license}）：${state}`;
    });
  }
}
