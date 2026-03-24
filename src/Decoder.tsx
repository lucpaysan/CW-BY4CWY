import { useState, useCallback } from "react";
import { DEFAULT_DECODE_BANDWIDTH_HZ, SAMPLE_RATE } from "./const";
import { Scope } from "./Scope";
import { useDecode } from "./useDecode";
import { DecodeDisplay } from "./DecodeDisplay";
import { Box, Button, Flex, Stack, NativeSelect, Tooltip, SegmentedControl, Text, Paper } from "@mantine/core";
import type { DetectionResult } from "./utils/morseSignalDetector";

type DecoderMode = "DL" | "BAYESIAN";

export const Decoder = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [filterFreq, setFilterFreq] = useState<number | null>(null);
  const [filterWidth, setFilterWidth] = useState<number>(250);
  const [gain, setGain] = useState<number>(0);
  const [language, setLanguage] = useState<"EN" | "EN/JA">("EN");
  const [decoderMode, setDecoderMode] = useState<DecoderMode>("DL");
  const [autoFilterEnabled, setAutoFilterEnabled] = useState(false);
  const [autoDetectedFreq, setAutoDetectedFreq] = useState<number | null>(null);

  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>(
    [],
  );
  const [selectedAudioInput, _setSelectedAudioInput] = useState<string>("");

  const { loaded, loadedJa, currentSegments, currentSegmentsJa, isDecoding } =
    useDecode({
      filterFreq,
      filterWidth,
      gain,
      stream,
      language,
      decoderMode,
      enabled: true,
    });

  const setSelectedAudioInput = (deviceId: string) => {
    _setSelectedAudioInput(deviceId);
    getStream(deviceId);
  };

  const handleAutoDetected = useCallback((result: DetectionResult | null) => {
    if (result && autoFilterEnabled) {
      // Set detected frequency as filter, use detected bandwidth
      setAutoDetectedFreq(result.frequency);
      setFilterFreq(result.frequency);
      // Auto-enable filter width 250 when detected
      setFilterWidth(250);
    }
  }, [autoFilterEnabled]);

  const getStream = async (selectedAudioInput?: string) => {
    console.log("[Decoder] getStream called, mediaDevices:", !!navigator.mediaDevices);

    if (!navigator.mediaDevices) {
      console.error("[Decoder] navigator.mediaDevices is not available");
      alert("Error: Audio input not available in this browser.");
      return;
    }

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    try {
      console.log("[Decoder] Requesting microphone access...");
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedAudioInput
            ? { exact: selectedAudioInput }
            : undefined,
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });

      console.log("[Decoder] Microphone access granted, stream:", newStream.id);
      setStream(newStream);

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(
        (device) => device.kind === "audioinput",
      );
      console.log("[Decoder] Found audio inputs:", audioInputs.length);
      setAudioInputDevices(audioInputs);
    } catch (error) {
      console.error("[Decoder] Failed to get microphone access:", error);
      if (error instanceof Error) {
        alert(`Error: ${error.message}`);
      } else {
        alert("Error: Could not access microphone. Please check permissions.");
      }
    }
  };

  const isLoading = decoderMode === "DL" && (!loaded || (language === "EN/JA" && !loadedJa)) || false;
  const isFilterEnabled = filterFreq !== null;
  const activeFilterWidth = isFilterEnabled
    ? filterWidth
    : DEFAULT_DECODE_BANDWIDTH_HZ;
  const showJapaneseDisplay = language === "EN/JA";

  return (
    <Stack gap={12}>
      {/* Controls Card */}
      <Paper p="md" radius="lg" shadow="sm" style={{ background: "white" }}>
        <Flex justify="space-between" align="center" wrap="wrap" gap="md">
          <Flex align="center" gap="md">
            <Button
              w={180}
              h={48}
              radius="xl"
              color={isDecoding ? "red" : "emerald"}
              onClick={() => {
                if (isDecoding) {
                  setStream(null);
                } else {
                  getStream(selectedAudioInput ?? undefined);
                }
              }}
              disabled={isLoading}
              styles={{
                root: { fontWeight: 600, fontSize: "16px" },
              }}
            >
              {isDecoding ? "■ STOP" : "▶ START"}
            </Button>
            {isLoading && (
              <Text size="sm" c="emerald.6" fw={500}>
                LOADING...
              </Text>
            )}
          </Flex>

          {/* Decoder Mode Selector */}
          <Flex align="center" gap="sm">
            <Text size="sm" c="dimmed" fw={500}>DECODER:</Text>
            <SegmentedControl
              size="sm"
              value={decoderMode}
              onChange={(v) => setDecoderMode(v as DecoderMode)}
              data={[
                { label: "DL", value: "DL" },
                { label: "Bayesian", value: "BAYESIAN" },
              ]}
              styles={{
                root: { background: "#f0fdf4" },
                indicator: { background: "#10b981" },
              }}
            />
          </Flex>
        </Flex>
      </Paper>

      {/* Scope and Display Card */}
      <Paper p="md" radius="lg" shadow="sm" style={{ background: "white" }}>
        <Stack gap={8}>
          <Box pos="relative">
            {stream ? (
              <Scope
                stream={stream}
                setFilterFreq={setFilterFreq}
                filterFreq={filterFreq}
                filterWidth={filterWidth}
                gain={gain}
                autoFilterEnabled={autoFilterEnabled}
                onAutoDetected={handleAutoDetected}
              />
            ) : (
              <Box
                style={{
                  height: "256px",
                  width: "100%",
                  background: "var(--mantine-color-dark-9)",
                  borderRadius: 12,
                }}
              />
            )}
          </Box>

          <Stack gap={0}>
            <DecodeDisplay segments={currentSegments} isDecoding={isDecoding} />

            {showJapaneseDisplay && (
              <DecodeDisplay
                segments={currentSegmentsJa}
                isDecoding={isDecoding}
                backgroundColor="#1a0a1e"
                textColor="#f0abfc"
              />
            )}
          </Stack>
        </Stack>
      </Paper>

      {/* Settings Card */}
      <Paper p="md" radius="lg" shadow="sm" style={{ background: "white" }}>
        <Flex gap="md" justify="flex-end" wrap="wrap" align="flex-end">
          <Tooltip label="Available after starting the decoder." withArrow>
            <Box>
              <NativeSelect
                w={180}
                label="INPUT"
                data={audioInputDevices.map((device) => ({
                  value: device.deviceId,
                  label:
                    device.label ||
                    `Device ${audioInputDevices.indexOf(device) + 1}`,
                }))}
                value={selectedAudioInput}
                onChange={(event) =>
                  setSelectedAudioInput(event.currentTarget.value)
                }
                disabled={!stream}
                styles={{ input: { borderColor: "#d1fae5" } }}
              />
            </Box>
          </Tooltip>
          <NativeSelect
            w={100}
            label="GAIN"
            data={["0", "20"]}
            value={gain.toString()}
            onChange={(event) => setGain(Number(event.currentTarget.value))}
            rightSection={"dB"}
            styles={{ input: { borderColor: "#d1fae5" } }}
          />
          <Tooltip label="Automatically detect Morse signal frequency from the spectrogram." withArrow>
            <Box>
              <Button
                size="sm"
                variant={autoFilterEnabled ? "filled" : "outline"}
                color={autoFilterEnabled ? "teal" : "gray"}
                onClick={() => {
                  setAutoFilterEnabled((prev) => {
                    const next = !prev;
                    if (!next) {
                      // Turning off auto-filter: clear detected frequency
                      setAutoDetectedFreq(null);
                    }
                    return next;
                  });
                }}
                disabled={!stream}
                styles={{
                  root: { fontWeight: 600 },
                }}
              >
                {autoFilterEnabled
                  ? `AUTO ${autoDetectedFreq ? `(${autoDetectedFreq}Hz)` : "..."}`
                  : "AUTO"}
              </Button>
            </Box>
          </Tooltip>
          <Tooltip label="Click the scope to enable the filter." withArrow>
            <Box>
              <NativeSelect
                w={130}
                label="FIL WID"
                data={[
                  {
                    value: DEFAULT_DECODE_BANDWIDTH_HZ.toString(),
                    label: `${DEFAULT_DECODE_BANDWIDTH_HZ} (OFF)`,
                  },
                  { value: "100", label: "100" },
                  { value: "150", label: "150" },
                  { value: "250", label: "250" },
                ]}
                value={activeFilterWidth.toString()}
                onChange={(event) => {
                  const nextWidth = Number(event.currentTarget.value);
                  if (nextWidth === DEFAULT_DECODE_BANDWIDTH_HZ) {
                    setFilterFreq(null);
                    return;
                  }

                  setFilterWidth(nextWidth);
                }}
                disabled={!isFilterEnabled || autoFilterEnabled}
                rightSection={"Hz"}
                styles={{ input: { borderColor: "#d1fae5" } }}
              />
            </Box>
          </Tooltip>
          <NativeSelect
            w={100}
            label="CW LANG"
            data={["EN"]}
            value={language}
            onChange={(event) =>
              setLanguage(event.currentTarget.value as "EN" | "EN/JA")
            }
            styles={{ input: { borderColor: "#d1fae5" } }}
          />
        </Flex>
      </Paper>
    </Stack>
  );
};
