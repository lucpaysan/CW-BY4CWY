import { useState, useRef, useCallback, useEffect } from "react";
import { Box, Button, Flex, Stack, TextInput, Slider, Text, Group, Paper } from "@mantine/core";
import { MorseEncoder } from "../core/morseEncoder";

// Common CW phrases for quick send
const CW_PHRASES = [
  // Basic calls
  { label: "CQ", text: "CQ CQ DE " },
  { label: "QRZ", text: "QRZ? " },
  // RST & Signal Report
  { label: "RST 599", text: "599 " },
  { label: "RST 599+", text: "599+ " },
  // Common Q codes
  { label: "QTH?", text: "QTH? " },
  { label: "QTH", text: "QTH " },
  { label: "QSL", text: "QSL " },
  { label: "QSL?", text: "QSL? " },
  { label: "QRV", text: "QRV " },
  { label: "QRN", text: "QRN " },
  { label: "QRM", text: "QRM " },
  { label: "QRP", text: "QRP " },
  { label: "QRS", text: "QRS " },
  { label: "QRT", text: "QRT " },
  // Common pro signs
  { label: "AR", text: "AR " },
  { label: "AS", text: "AS " },
  { label: "BK", text: "BK " },
  { label: "BT", text: "BT " },
  { label: "KN", text: "KN " },
  { label: "SK", text: "SK " },
  { label: "SN", text: "SN " },
  // End of contact
  { label: "73", text: "73 " },
  { label: "73 TU", text: "73 TU " },
  // Station info
  { label: "NAME", text: "NAME " },
  { label: "CALL", text: "CALL " },
  { label: "CW", text: "CW " },
  { label: "WX", text: "WX " },
];

// One-click complete sentences for typical CW QSOs
// [CALL] [MYCALL] [NAME] [QTH] replaced with spaces
const CW_SENTENCES = [
  { label: "CQ呼叫", text: "CQ CQ DE   K " },
  { label: "回答对方", text: "UR 599 599 NAME IS   QTH IS   HW? " },
  { label: "信号报告", text: "599 599 QSB QSB NAME IS   HW CPY? " },
  { label: "问对方台", text: "DL??? DE   KN " },
  { label: "结束联络", text: "73 SK TU E E" },
  { label: "直接呼叫", text: "  DE   UR 599 NAME IS   QTH   HW? " },
];

export const Encoder = () => {
  const [text, setText] = useState<string>("");
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
  const playMorse = useCallback(async (playText?: string) => {
    const textToPlay = playText !== undefined ? playText : text;

    if (isPlaying) {
      stopAudio();
      return;
    }

    if (!textToPlay.trim()) {
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
      const audioData = encoderRef.current.generateAudio(textToPlay, fadeDuration);

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

  // Just add phrase to text without auto-playing
  const addPhrase = useCallback((phrase: string) => {
    if (isPlaying) {
      stopAudio();
    }
    setText(prev => prev + phrase);
  }, [isPlaying, stopAudio]);

  // Add sentence to text field (not play directly)
  const addSentence = useCallback((sentence: string) => {
    if (isPlaying) {
      stopAudio();
    }
    setText(prev => prev + sentence);
  }, [isPlaying, stopAudio]);

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
      <Paper p="lg" radius="lg" shadow="sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)" }}>
        {/* Header */}
        <Flex justify="space-between" align="center" wrap="wrap" gap="sm" mb="md">
          <Text size="lg" fw={700} c="var(--gold-dark)">
            ENCODER
          </Text>
        </Flex>

        {/* One-click sentences - call to action */}
        <Text size="xs" c="dimmed" mb={4} fw={500}>ONE-CLICK QSOs</Text>
        <Group gap="xs" mb="md">
          {CW_SENTENCES.map(phrase => (
            <Button
              key={phrase.label}
              size="sm"
              variant="filled"
              radius="xl"
              onClick={() => addSentence(phrase.text)}
              disabled={isPlaying}
              styles={{
                root: {
                  background: "linear-gradient(135deg, var(--gold-primary), var(--gold-dark))",
                  color: "#fff",
                  fontWeight: 700,
                  "&:hover": {
                    background: "linear-gradient(135deg, var(--gold-dark), var(--gold-primary))",
                  },
                  boxShadow: "0 2px 8px rgba(182, 158, 100, 0.3)",
                },
              }}
            >
              + {phrase.label}
            </Button>
          ))}
        </Group>

        {/* Quick Phrase Buttons - first row: calls */}
        <Text size="xs" c="dimmed" mb={4} fw={500}>CALLS</Text>
        <Group gap="xs" mb="sm">
          {CW_PHRASES.filter(p => ["CQ", "QRZ"].includes(p.label)).map(phrase => (
            <Button
              key={phrase.label}
              size="xs"
              variant="light"
              radius="xl"
              onClick={() => addPhrase(phrase.text)}
              disabled={isPlaying}
              styles={{
                root: {
                  background: "var(--gold-warm)",
                  color: "var(--gold-dark)",
                  "&:hover": {
                    background: "var(--gold-light)",
                  },
                },
              }}
            >
              {phrase.label}
            </Button>
          ))}
        </Group>

        {/* Quick Phrase Buttons - second row: Q codes */}
        <Text size="xs" c="dimmed" mb={4} fw={500}>Q CODES</Text>
        <Group gap="xs" mb="sm">
          {CW_PHRASES.filter(p => p.label.includes("Q") && !["CQ", "QRZ"].includes(p.label)).map(phrase => (
            <Button
              key={phrase.label}
              size="xs"
              variant="light"
              radius="xl"
              onClick={() => addPhrase(phrase.text)}
              disabled={isPlaying}
              styles={{
                root: {
                  background: "rgba(7, 123, 156, 0.1)",
                  color: "var(--teal-dark)",
                  "&:hover": {
                    background: "rgba(7, 123, 156, 0.2)",
                  },
                },
              }}
            >
              {phrase.label}
            </Button>
          ))}
        </Group>

        {/* Quick Phrase Buttons - third row: prosigns & other */}
        <Text size="xs" c="dimmed" mb={4} fw={500}>PROSIGNS & OTHER</Text>
        <Group gap="xs" mb="md">
          {CW_PHRASES.filter(p => !p.label.includes("Q") && !["CQ", "QRZ"].includes(p.label)).map(phrase => (
            <Button
              key={phrase.label}
              size="xs"
              variant="light"
              radius="xl"
              onClick={() => addPhrase(phrase.text)}
              disabled={isPlaying}
              styles={{
                root: {
                  background: "var(--gold-warm)",
                  color: "var(--gold-dark)",
                  "&:hover": {
                    background: "var(--gold-light)",
                  },
                },
              }}
            >
              {phrase.label}
            </Button>
          ))}
        </Group>

        {/* Text Input with Clear button */}
        <Flex align="flex-end" gap="sm">
          <Box style={{ flex: 1 }}>
            <TextInput
              label="TEXT"
              placeholder="Enter text or tap phrases above..."
              value={text}
              onChange={(e) => setText(e.currentTarget.value.toUpperCase())}
              disabled={isPlaying}
              styles={{
                input: {
                  fontFamily: "monospace",
                  fontSize: "16px",
                  borderColor: "var(--border-light)",
                  background: "var(--bg-main)",
                },
                label: {
                  color: "var(--text-secondary)",
                  fontWeight: 600,
                  fontSize: 11,
                },
              }}
            />
          </Box>
          <Button
            size="md"
            variant="subtle"
            color="gray"
            onClick={() => setText("")}
            disabled={isPlaying || !text}
            styles={{
              root: {
                padding: "0 12px",
                height: 36,
                marginBottom: 2,
              },
            }}
          >
            ✕ Clear
          </Button>
        </Flex>

        {/* Morse Preview */}
        {preview.morse && (
          <Box
            mt="md"
            p="sm"
            style={{
              background: "var(--gold-cream)",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: "14px",
              color: "var(--gold-dark)",
              wordBreak: "break-all",
              border: "1px solid var(--gold-light)",
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
            color={isPlaying ? "red" : "orange"}
            onClick={() => playMorse()}
            disabled={!text.trim()}
            styles={{
              root: {
                fontWeight: 700,
                fontSize: "18px",
                background: isPlaying
                  ? "linear-gradient(135deg, var(--accent-error), #d47070)"
                  : "linear-gradient(135deg, var(--gold-primary), var(--gold-dark))",
                border: "none",
                boxShadow: isPlaying
                  ? "0 4px 12px rgba(196, 92, 92, 0.3)"
                  : "0 4px 12px rgba(182, 158, 100, 0.3)",
              },
            }}
          >
            {isPlaying ? "■ STOP" : "▶ PLAY"}
          </Button>
        </Flex>
      </Paper>

      {/* Settings Card */}
      <Paper p="lg" radius="lg" shadow="sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)" }}>
        {/* Speed Control */}
        <Box mb="md">
          <Group justify="space-between" mb={4}>
            <Text size="sm" c="dimmed" fw={500}>
              WPM
            </Text>
            <Text size="sm" fw={600} c="var(--gold-dark)">
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
            color="orange"
          />
        </Box>

        {/* Farnsworth Spacing */}
        <Box mb="md">
          <Group justify="space-between" mb={4}>
            <Text size="sm" c="dimmed" fw={500}>
              CHAR SPACING
            </Text>
            <Text size="sm" fw={600} c="var(--gold-dark)">
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
            color="orange"
          />
        </Box>

        {/* Tone Frequency */}
        <Box mb="md">
          <Group justify="space-between" mb={4}>
            <Text size="sm" c="dimmed" fw={500}>
              TONE
            </Text>
            <Text size="sm" fw={600} c="var(--gold-dark)">
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
            color="orange"
          />
        </Box>

        {/* Volume */}
        <Box>
          <Group justify="space-between" mb={4}>
            <Text size="sm" c="dimmed" fw={500}>
              VOLUME
            </Text>
            <Text size="sm" fw={600} c="var(--gold-dark)">
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
            color="orange"
          />
        </Box>
      </Paper>
    </Stack>
  );
};