import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Flex, Select, Text, Badge, Group, Loader } from "@mantine/core";
import { useAudioProcessing } from "./hooks/useAudioProcessing";
import {
  loadDeepCWModel,
  runDeepCWInference,
  getDeepCWCrashCount,
} from "./deepcw/inferenceClient";
import { DeepCWSegment } from "./workers/deepcwWorker";
import {
  DEEPCW_WINDOW_OPTIONS,
  DEEPCW_SAMPLE_RATE,
  type DeepCWWindowSeconds,
} from "./deepcw/config";
import { getSNRLabel, getConfidenceLabel } from "./utils/signalQuality";

/**
 * DeepCW 解码面板
 *
 * 与现有 Decoder.tsx（legacy 模型）完全并存，互不影响。
 * 两者共享同一个麦克风流，通过 useAudioProcessing 复用音频采集逻辑。
 */

interface DeepCWPanelProps {
  /** 由父组件传入已获取的音频流，null 表示未启动 */
  stream: MediaStream | null;
}

export const DeepCWPanel = ({ stream }: DeepCWPanelProps) => {
  const [gain, setGain] = useState<number>(0);
  const [windowSeconds, setWindowSeconds] = useState<DeepCWWindowSeconds>(12);
  const [loading, setLoading] = useState<boolean>(true);
  const [segments, setSegments] = useState<DeepCWSegment[]>([]);
  const [snrDb, setSnrDb] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(0);
  const [running, setRunning] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastVersion, setLastVersion] = useState<number>(-1);

  const audioBufferRef = useAudioProcessing(stream, gain, windowSeconds);
  const workerCrashed = getDeepCWCrashCount() > 0;

  // 预加载模型
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    loadDeepCWModel()
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setLoadError(error instanceof Error ? error.message : "模型加载失败");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 切换窗口时清空
  useEffect(() => {
    setSegments([]);
    setLastVersion(-1);
  }, [windowSeconds]);

  // 解码循环：音频版本变化即触发一次推理
  useEffect(() => {
    if (!running || !stream || loading) return;

    let cancelled = false;
    let currentVersion = -1;

    const tick = async () => {
      while (!cancelled) {
        const version = audioBufferRef.current.version;
        if (version !== currentVersion) {
          currentVersion = version;
          const samples = audioBufferRef.current.samples;
          const result = await runDeepCWInference(samples);
          if (cancelled) return;
          setSegments(result.segments);
          setSnrDb(result.snrDb);
          setConfidence(result.confidence);
          setLastVersion(version);
        }
        // 约每 150ms 轮询一次，平衡实时性与 CPU 占用
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
    };

    tick().catch((error: unknown) => {
      console.error("[DeepCWPanel] 解码循环异常:", error);
    });

    return () => {
      cancelled = true;
    };
    // audioBufferRef 是稳定的 ref，不需列入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, stream, loading, windowSeconds]);

  const toggleRunning = useCallback(() => {
    setRunning((prev) => {
      const next = !prev;
      if (next) {
        setSegments([]);
        setLastVersion(-1);
      }
      return next;
    });
  }, []);

  const decodedText = segments.map((s) => s.text).join(" ");
  const isEmpty = decodedText.trim().length === 0;

  return (
    <Box
      p="lg"
      style={{
        background: "var(--surface-1, rgba(255,255,255,0.04))",
        borderRadius: "var(--border-radius-lg, 12px)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* 控制栏 */}
      <Flex gap="md" align="center" wrap="wrap" mb="md">
        <Button
          onClick={toggleRunning}
          disabled={loading || !stream}
          size="md"
          radius="xl"
          style={{
            background: running
              ? "linear-gradient(135deg, #c45c5c, #a84848)"
              : "linear-gradient(135deg, #b69e64, #9a8450)",
            color: "#fff",
            minWidth: 120,
          }}
        >
          {running ? "■ 停止" : "▶ 启动解码"}
        </Button>

        <Select
          label="解码窗口"
          value={String(windowSeconds)}
          onChange={(v) => v && setWindowSeconds(Number(v) as DeepCWWindowSeconds)}
          data={DEEPCW_WINDOW_OPTIONS.map((s) => ({ value: String(s), label: `${s} 秒` }))}
          w={120}
          disabled={running}
        />

        <Select
          label="增益"
          value={String(gain)}
          onChange={(v) => v && setGain(Number(v))}
          data={[
            { value: "0", label: "0 dB" },
            { value: "10", label: "+10 dB" },
            { value: "20", label: "+20 dB" },
            { value: "30", label: "+30 dB" },
          ]}
          w={110}
        />

        <Text size="xs" c="dimmed">
          音频采样率 {DEEPCW_SAMPLE_RATE} Hz · 频带 400–1200 Hz
        </Text>
      </Flex>

      {/* 状态提示 */}
      <Group gap="xs" mb="sm">
        {loading && (
          <Badge leftSection={<Loader size={10} />} color="blue" variant="light">
            加载模型
          </Badge>
        )}
        {loadError && (
          <Badge color="red" variant="light">
            模型加载失败：{loadError}
          </Badge>
        )}
        {!loading && !loadError && !stream && (
          <Badge color="gray" variant="light">
            请先在下方选择音频输入设备并授权
          </Badge>
        )}
        {running && stream && (
          <Badge color="teal" variant="light">
            解码中
          </Badge>
        )}
        {workerCrashed && (
          <Badge color="orange" variant="light">
            推理进程曾中断，正在恢复
          </Badge>
        )}
        {snrDb !== 0 && <Badge variant="light">SNR {getSNRLabel(snrDb)}</Badge>}
        {confidence > 0 && (
          <Badge variant="light">置信度 {getConfidenceLabel(confidence)}</Badge>
        )}
      </Group>

      {/* 解码结果 */}
      <Box
        p="md"
        style={{
          background: "rgba(0,0,0,0.25)",
          borderRadius: "var(--border-radius-md, 8px)",
          minHeight: 120,
          maxHeight: 320,
          overflowY: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 20,
          lineHeight: 1.6,
          letterSpacing: "0.5px",
        }}
      >
        {isEmpty ? (
          <Text c="dimmed" size="sm">
            {running ? "等待信号…" : "点击「启动解码」开始"}
          </Text>
        ) : (
          <>
            <Text
              component="div"
              style={{ color: "var(--gold-light, #e8d9a8)", wordBreak: "break-word" }}
            >
              {decodedText}
            </Text>

            {/* 通联要素高亮 */}
            {segments.length > 0 && (
              <Group gap="xs" mt="sm">
                {segments[0].callsigns.map((c) => (
                  <Badge key={c} size="sm" variant="outline" color="cyan">
                    呼号 {c}
                  </Badge>
                ))}
                {segments[0].reports.map((r) => (
                  <Badge key={r} size="sm" variant="outline" color="green">
                    信号 {r}
                  </Badge>
                ))}
                {segments[0].qcodes.map((q) => (
                  <Badge key={q} size="sm" variant="outline" color="grape">
                    {q}
                  </Badge>
                ))}
              </Group>
            )}

            {/* 原始输出（可对照） */}
            {segments[0]?.raw !== segments[0]?.text && (
              <Text size="xs" c="dimmed" mt="xs">
                原始：{segments[0].raw}
              </Text>
            )}
          </>
        )}
      </Box>

      <Text size="xs" c="dimmed" mt="sm">
        {lastVersion >= 0 ? `已处理音频块 #${lastVersion}` : ""}
      </Text>
    </Box>
  );
};
