import { useState, useRef, useCallback, useEffect } from "react";
import { Box, Button, Flex, Stack, TextInput, Slider, Text, Group, Paper } from "@mantine/core";
import { MorseEncoder } from "../core/morseEncoder";

// Common CW phrases for quick send
const CW_PHRASES = [
  { label: "CQ", text: "CQ CQ DE " },
  { label: "QRZ", text: "QRZ" },
  { label: "73", text: "73" },
  { label: "QSL", text: "QSL" },
  { label: "RST 599", text: "599" },
  { label: "NAME", text: "NAME " },
  { label: "QTH", text: "QTH " },
  { label: "CW", text: "CW" },
];

export const Encoder = () => {
  const [text, setText] = useState<string>("CQ CQ DE ");
  const [wpm, setWpm] = useState<number>(20);
  const [farnsworth, setFarnsworth] = useState<number>(1.0);
  const [toneHz, setToneHz] = useState<number>(700);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);

  const encoderRef = useRef<MorseEncoder>(new MorseEncoder());
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const isInitializedRef = useRef<boolean>(false);

  // Initialize audio context on first interaction
  const ensureInitialized = useCallback(async () => {
    if (isInitializedRef.current) return true;

    try {
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });

      if (audioContextRef.current && !gainNodeRef.current) {
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
        gainNodeRef.current.gain.value = volume;
      }

      isInitializedRef.current = true;
      return true;
    } catch (error) {
      console.error("Failed to initialize audio:", error);
      return false;
    }
  }, [volume]);

  // Update encoder config when settings change
  useEffect(() => {
    encoderRef.current.setConfig({ wpm, farnsworth, toneHz });
  }, [wpm, farnsworth, toneHz]);

  // Update gain node volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {
        // Ignore if already stopped
      }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  /**
   * Generate complete audio buffer for the text and play it
   */
  const playMorse = useCallback(async () => {
    if (isPlaying) {
      stopAudio();
      return;
    }

    const initialized = await ensureInitialized();
    if (!initialized || !audioContextRef.current) {
      console.error("Audio not initialized");
      return;
    }

    try {
      const audioContext = audioContextRef.current;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      // Ensure gain node is connected
      if (!gainNodeRef.current) {
        gainNodeRef.current = audioContext.createGain();
        gainNodeRef.current.connect(audioContext.destination);
      }
      gainNodeRef.current.gain.value = volume;

      // Stop any existing playback
      stopAudio();

      // Generate complete audio using the encoder's method
      const fadeDuration = Math.max(0.003, 1.2 / wpm * 0.1);
      const audioData = encoderRef.current.generateAudio(text, fadeDuration);

      if (audioData.length === 0) {
        console.error("No audio generated");
        return;
      }

      // Create AudioBuffer from the generated data
      const audioBuffer = audioContext.createBuffer(
        1, // mono
        audioData.length,
        audioContext.sampleRate
      );
      audioBuffer.copyToChannel(audioData, 0);

      // Create single source node for the complete buffer
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gainNodeRef.current);
      sourceNodeRef.current = source;

      setIsPlaying(true);

      source.onended = () => {
        setIsPlaying(false);
        sourceNodeRef.current = null;
      };

      source.start(0);

    } catch (error) {
      console.error("Error playing Morse audio:", error);
      setIsPlaying(false);
    }
  }, [text, volume, isPlaying, stopAudio, ensureInitialized, wpm]);

  const playPhrase = useCallback(async (phrase: string) => {
    if (isPlaying) {
      stopAudio();
    }

    setText(phrase);

    // Wait a tiny bit for state to update
    await new Promise(resolve => setTimeout(resolve, 10));

    await playMorse();
  }, [isPlaying, stopAudio, playMorse]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopAudio]);

  // Get Morse preview
  const preview = encoderRef.current.getPreview(text);

  return (
    <Stack gap="md">
      {/* Main Controls Card */}
      <Paper p="lg" radius="lg" shadow="sm" style={{ background: "white" }}>
        {/* Header */}
        <Flex justify="space-between" align="center" wrap="wrap" gap="sm" mb="md">
          <Text size="lg" fw={700} c="emerald.7">
            ENCODER
          </Text>
        </Flex>

        {/* Quick Phrase Buttons */}
        <Group gap="xs" mb="md">
          {CW_PHRASES.map(phrase => (
            <Button
              key={phrase.label}
              size="xs"
              variant="light"
              color="emerald"
              radius="xl"
              onClick={() => playPhrase(text + phrase.text)}
              disabled={isPlaying}
            >
              {phrase.label}
            </Button>
          ))}
        </Group>

        {/* Text Input */}
        <TextInput
          label="TEXT"
          placeholder="Enter text to encode..."
          value={text}
          onChange={(e) => setText(e.currentTarget.value.toUpperCase())}
          disabled={isPlaying}
          styles={{
            input: {
              fontFamily: "monospace",
              fontSize: "16px",
              borderColor: "#d1fae5",
            },
          }}
        />

        {/* Morse Preview */}
        {preview.morse && (
          <Box
            mt="md"
            p="sm"
            style={{
              background: "#f0fdf4",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: "14px",
              color: "#065f46",
              wordBreak: "break-all",
            }}
          >
            <Text size="xs" c="dimmed" mb={4}>
              MORSE: {preview.morse}
            </Text>
            <Text size="xs" c="dimmed">
              Duration: {preview.duration.toFixed(1)}s | Est. WPM: {preview.wpm}
            </Text>
          </Box>
        )}

        {/* Play Controls */}
        <Flex gap="md" mt="lg">
          <Button
            flex={1}
            size="lg"
            h={56}
            radius="xl"
            color={isPlaying ? "red" : "emerald"}
            onClick={playMorse}
            styles={{ root: { fontWeight: 700, fontSize: "18px" } }}
          >
            {isPlaying ? "■ STOP" : "▶ PLAY"}
          </Button>
        </Flex>
      </Paper>

      {/* Settings Card */}
      <Paper p="lg" radius="lg" shadow="sm" style={{ background: "white" }}>
        {/* Speed Control */}
        <Box mb="md">
          <Group justify="space-between" mb={4}>
            <Text size="sm" c="dimmed" fw={500}>
              WPM
            </Text>
            <Text size="sm" fw={600} c="emerald.7">
              {wpm}
            </Text>
          </Group>
          <Slider
            value={wpm}
            onChange={setWpm}
            min={5}
            max={50}
            step={1}
            marks={[
              { value: 5, label: "5" },
              { value: 20, label: "20" },
              { value: 35, label: "35" },
              { value: 50, label: "50" },
            ]}
            disabled={isPlaying}
            color="emerald"
          />
        </Box>

        {/* Farnsworth Spacing */}
        <Box mb="md">
          <Group justify="space-between" mb={4}>
            <Text size="sm" c="dimmed" fw={500}>
              CHAR SPACING
            </Text>
            <Text size="sm" fw={600} c="sky.7">
              {farnsworth.toFixed(1)}x
            </Text>
          </Group>
          <Slider
            value={farnsworth}
            onChange={setFarnsworth}
            min={1.0}
            max={4.0}
            step={0.1}
            marks={[
              { value: 1.0, label: "1.0" },
              { value: 2.5, label: "2.5" },
              { value: 4.0, label: "4.0" },
            ]}
            disabled={isPlaying}
            color="sky"
          />
        </Box>

        {/* Tone Frequency */}
        <Box mb="md">
          <Group justify="space-between" mb={4}>
            <Text size="sm" c="dimmed" fw={500}>
              TONE
            </Text>
            <Text size="sm" fw={600} c="teal.6">
              {toneHz} Hz
            </Text>
          </Group>
          <Slider
            value={toneHz}
            onChange={setToneHz}
            min={400}
            max={1000}
            step={50}
            marks={[
              { value: 400, label: "400" },
              { value: 700, label: "700" },
              { value: 1000, label: "1000" },
            ]}
            disabled={isPlaying}
            color="teal"
          />
        </Box>

        {/* Volume */}
        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="sm" c="dimmed" fw={500}>
              VOLUME
            </Text>
            <Text size="sm" fw={600}>
              {Math.round(volume * 100)}%
            </Text>
          </Group>
          <Slider
            value={volume}
            onChange={setVolume}
            min={0}
            max={1}
            step={0.1}
            disabled={isPlaying}
            color="gray"
          />
        </Box>
      </Paper>
    </Stack>
  );
};
