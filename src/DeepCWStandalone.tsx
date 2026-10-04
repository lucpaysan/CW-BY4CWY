import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Button, Flex, Select, Text, Badge } from "@mantine/core";
import { DeepCWPanel } from "./DeepCWPanel";

/**
 * DeepCW 自包含容器
 *
 * 负责麦克风获取与设备选择，把 MediaStream 交给 DeepCWPanel。
 * 与现有 Decoder.tsx 完全独立，互不影响。
 */
export function DeepCWStandalone() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  // 组件卸载时释放设备
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === "audioinput"));
    } catch {
      setDevices([]);
    }
  }, []);

  const requestStream = useCallback(
    async (id?: string) => {
      setRequesting(true);
      setError(null);
      try {
        // 先释放旧的
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const constraints: MediaStreamConstraints = {
          audio: id
            ? {
                deviceId: { exact: id },
                // CW 解码需要干净信号，关闭浏览器自带的处理
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              }
            : {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              },
        };

        const s = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = s;
        setStream(s);
        await refreshDevices();
      } catch (e) {
        setError(
          e instanceof Error
            ? `麦克风访问失败：${e.message}`
            : "麦克风访问失败（请检查浏览器权限与设备占用）",
        );
      } finally {
        setRequesting(false);
      }
    },
    [refreshDevices],
  );

  const switchDevice = useCallback(
    async (id: string) => {
      setDeviceId(id);
      if (stream) {
        await requestStream(id);
      }
    },
    [stream, requestStream],
  );

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  return (
    <Box>
      {/* 音频输入控制 */}
      <Flex gap="md" align="flex-end" wrap="wrap" mb="md">
        <Select
          label="音频输入设备"
          placeholder={stream ? "选择设备" : "请先获取麦克风"}
          value={deviceId}
          onChange={(v) => v && switchDevice(v)}
          data={devices.map((d, i) => ({
            value: d.deviceId,
            label: d.label || `输入设备 ${i + 1}`,
          }))}
          w={280}
          disabled={devices.length === 0}
        />

        <Button
          onClick={() => (stream ? releaseStream() : void requestStream())}
          loading={requesting}
          variant={stream ? "light" : "filled"}
          color={stream ? "gray" : undefined}
        >
          {stream ? "释放设备" : "获取麦克风"}
        </Button>

        {devices.length > 0 && !stream && (
          <Button variant="subtle" onClick={() => void refreshDevices()}>
            刷新设备列表
          </Button>
        )}

        <Box style={{ flex: 1 }} />

        {stream ? (
          <Badge color="teal" variant="light">
            音频已连接
          </Badge>
        ) : (
          <Badge color="gray" variant="light">
            未连接音频
          </Badge>
        )}
      </Flex>

      {error && (
        <Box
          mb="md"
          p="sm"
          style={{
            background: "rgba(194, 65, 65, 0.12)",
            border: "1px solid rgba(194, 65, 65, 0.35)",
            borderRadius: 8,
          }}
        >
          <Text size="sm" c="red.4">
            {error}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            浏览器要求 HTTPS 或 localhost 才能访问麦克风；
            也请确认没有其他程序占用该设备。
          </Text>
        </Box>
      )}

      <DeepCWPanel stream={stream} />
    </Box>
  );
}
