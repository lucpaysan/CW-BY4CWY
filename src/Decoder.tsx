import { useState, useEffect } from "react";
import {
  DEFAULT_DECODE_BANDWIDTH_HZ,
  DEFAULT_DECODE_WINDOW_S,
  DECODE_WINDOW_OPTIONS,
  SAMPLE_RATE,
  type DecodeWindowSeconds,
} from "./const";
import { Scope } from "./Scope";
import { useDecode } from "./useDecode";
import { DecodeDisplay } from "./DecodeDisplay";
import { Box, Button, Flex, Select, Text } from "@mantine/core";

export const Decoder = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [filterFreq, setFilterFreq] = useState<number | null>(null);
  const [filterWidth, setFilterWidth] = useState<number>(150);
  const [gain, setGain] = useState<number>(0);
  const [decodeWindowSeconds, setDecodeWindowSeconds] =
    useState<DecodeWindowSeconds>(DEFAULT_DECODE_WINDOW_S);

  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState<string>("");

  const { loaded, currentSegments, isDecoding } = useDecode({
    filterFreq,
    filterWidth,
    gain,
    stream,
    decodeWindowSeconds,
  });

  const getStream = async (deviceId?: string) => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });

      setStream(newStream);

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === "audioinput");
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

  const handleDeviceChange = (deviceId: string | null) => {
    if (deviceId) {
      setSelectedAudioInput(deviceId);
      getStream(deviceId);
    }
  };

  const handleStartStop = () => {
    if (isDecoding) {
      // Stop all tracks before clearing stream
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      setStream(null);
    } else {
      getStream(selectedAudioInput || undefined);
    }
  };

  // Load microphone devices on mount
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const audioInputs = devices.filter((device) => device.kind === "audioinput");
      setAudioInputDevices(audioInputs);
    });
  }, []);

  const isLoading = !loaded;
  const isFilterEnabled = filterFreq !== null;
  const activeFilterWidth = isFilterEnabled ? filterWidth : DEFAULT_DECODE_BANDWIDTH_HZ;

  const selectStyles = {
    input: {
      background: "var(--bg-main)",
      border: "1px solid var(--border-light)",
      color: "var(--gold-dark)",
      fontWeight: 600,
      fontSize: 12,
    },
    dropdown: {
      background: "var(--bg-card)",
      border: "1px solid var(--border-light)",
    },
    option: {
      color: "var(--text-primary)",
      "&[selected]": {
        background: "rgba(182, 158, 100, 0.15)",
        color: "var(--gold-dark)",
      },
      "&:hover": {
        background: "rgba(182, 158, 100, 0.08)",
      },
    },
  };

  const micData = audioInputDevices.map((device) => ({
    value: device.deviceId,
    label: device.label || `Mic ${audioInputDevices.indexOf(device) + 1}`,
  }));

  return (
    <Flex direction="column" gap={16}>
      {/* Control Bar */}
      <Flex
        p={16}
        style={{
          background: "var(--bg-card)",
          borderRadius: 16,
          border: "1px solid var(--border-light)",
        }}
        align="center"
        justify="space-between"
        wrap="wrap"
        gap={16}
      >
        {/* Start/Stop Button */}
        <Button
          size="lg"
          radius="xl"
          onClick={handleStartStop}
          disabled={isLoading}
          style={{
            background: isDecoding
              ? "linear-gradient(135deg, var(--accent-error), #d47070)"
              : "linear-gradient(135deg, var(--gold-primary), var(--gold-dark))",
            border: "none",
            fontWeight: 700,
            fontSize: 16,
            padding: "0 32px",
            height: 48,
            boxShadow: isDecoding
              ? "0 4px 12px rgba(196, 92, 92, 0.3)"
              : "0 4px 12px rgba(182, 158, 100, 0.3)",
          }}
        >
          {isDecoding ? "■ STOP" : "▶ START"}
        </Button>

        {isLoading && (
          <Flex align="center" gap={8}>
            <Box
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--gold-primary)",
                animation: "pulse-glow 1s ease-in-out infinite",
              }}
            />
            <Text style={{ fontSize: 12, color: "var(--gold-primary)", fontWeight: 600 }}>
              LOADING MODEL...
            </Text>
          </Flex>
        )}

        {/* Status */}
        <Flex align="center" gap={12}>
          <Box
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: isDecoding ? "var(--teal-primary)" : "var(--border-light)",
              boxShadow: isDecoding ? "0 0 10px var(--teal-primary)" : "none",
              transition: "all 0.3s ease",
            }}
          />
          <Text style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {isDecoding ? "Listening..." : "Ready"}
          </Text>
        </Flex>
      </Flex>

      {/* Scope */}
      <Box
        style={{
          background: "var(--bg-card)",
          borderRadius: 16,
          border: "1px solid var(--border-light)",
          padding: 16,
          position: "relative",
        }}
      >
        {stream ? (
          <Scope
            stream={stream}
            setFilterFreq={setFilterFreq}
            filterFreq={filterFreq}
            filterWidth={filterWidth}
            gain={gain}
            decodeWindowSeconds={decodeWindowSeconds}
          />
        ) : (
          <Box
            style={{
              height: 200,
              background: "linear-gradient(180deg, var(--bg-dark) 0%, var(--bg-sidebar) 100%)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "var(--text-muted)", fontSize: 14 }}>
              Click START to begin decoding
            </Text>
          </Box>
        )}
      </Box>

      {/* Decode Display */}
      <Box
        style={{
          background: "var(--bg-dark)",
          borderRadius: 16,
          border: "1px solid var(--border-dark)",
          overflow: "hidden",
        }}
      >
        <DecodeDisplay
          segments={currentSegments}
          isDecoding={isDecoding}
          decodeWindowSeconds={decodeWindowSeconds}
        />
      </Box>

      {/* Settings Bar */}
      <Flex
        p={16}
        style={{
          background: "var(--bg-card)",
          borderRadius: 16,
          border: "1px solid var(--border-light)",
        }}
        gap={24}
        wrap="wrap"
        align="center"
        justify="space-between"
      >
        {/* Microphone Select - left side */}
        <Select
          placeholder="Select microphone"
          value={selectedAudioInput}
          onChange={handleDeviceChange}
          data={micData.length > 0 ? micData : [{ value: "", label: "No devices found" }]}
          disabled={isDecoding || micData.length === 0}
          styles={selectStyles}
          style={{ width: 180 }}
        />

        {/* Right side controls */}
        <Flex gap={24} wrap="wrap" align="center">
          {/* Window */}
          <Flex align="center" gap={8}>
            <Text style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
              WINDOW
            </Text>
            <Select
              value={decodeWindowSeconds.toString()}
              onChange={(v) =>
                v && setDecodeWindowSeconds(Number(v) as DecodeWindowSeconds)
              }
              data={DECODE_WINDOW_OPTIONS.map((s) => ({
                value: s.toString(),
                label: `${s}s`,
              }))}
              size="xs"
              styles={selectStyles}
              style={{ width: 80 }}
            />
          </Flex>

          {/* Gain */}
          <Flex align="center" gap={8}>
            <Text style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
              GAIN
            </Text>
            <Select
              value={gain.toString()}
              onChange={(v) => v && setGain(Number(v))}
              data={[
                { value: "0", label: "+0 dB" },
                { value: "10", label: "+10 dB" },
                { value: "20", label: "+20 dB" },
              ]}
              size="xs"
              styles={selectStyles}
              style={{ width: 90 }}
            />
          </Flex>

          {/* Filter Width */}
          <Flex align="center" gap={8}>
            <Text style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
              FILTER
            </Text>
            <Select
              value={activeFilterWidth.toString()}
              onChange={(v) => {
                if (!v) return;
                setFilterWidth(Number(v));
              }}
              data={[
                { value: "150", label: "150 Hz" },
                { value: "250", label: "250 Hz" },
                { value: "350", label: "350 Hz" },
              ]}
              size="xs"
              styles={selectStyles}
              style={{ width: 100 }}
            />
          </Flex>

          {/* Filter Frequency Display */}
          {filterFreq && (
            <Box
              style={{
                padding: "4px 12px",
                borderRadius: 8,
                background: "rgba(7, 123, 156, 0.1)",
                border: "1px solid var(--teal-primary)",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--teal-primary)",
                }}
              >
                {filterFreq} Hz
              </Text>
            </Box>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
};