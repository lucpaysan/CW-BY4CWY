/**
 * CW Training Module
 *
 * Self-training mechanism for practicing Morse code decoding.
 * - App plays a phrase as Morse audio
 * - User decodes and types what they hear
 * - App compares and highlights errors
 * - User corrections are saved for learning
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Box,
  Button,
  Flex,
  Stack,
  TextInput,
  Text,
  Group,
  SegmentedControl,
  Progress,
  Paper,
  Badge,
  Slider,
} from "@mantine/core";
import {
  PHRASE_LIBRARY,
  type Phrase,
  type PhraseCategory,
  textToMorse,
  stringSimilarity,
  getCategories,
} from "../core/phraseLibrary";
import { MorseEncoder } from "../core/morseEncoder";
import { ToneSampler } from "../core/toneSampler";

// User correction record for learning
interface Correction {
  phraseId: string;
  original: string;      // What user typed
  correct: string;       // What it should have been
  timestamp: number;
}

interface TrainingSession {
  totalPhrases: number;
  currentIndex: number;
  correct: number;
  incorrect: number;
  results: {
    phrase: Phrase;
    userAnswer: string;
    correct: boolean;
    similarity: number;
  }[];
}

type TrainingMode = "listen" | "practice" | "free";

const CATEGORY_LABELS: Record<PhraseCategory, string> = {
  greeting: "Greetings",
  calls: "Calls",
  signal_report: "RST",
  qso_info: "QSO Info",
  qsl: "QSL",
  contest: "Contest",
  abbreviation: "Abbreviations",
  prosign: "Prosigns",
  qcode: "Q-Codes",
  common: "Common Words",
  technical: "Technical",
  organization: "Organizations",
};

export const Training = () => {
  // Training settings
  const [mode, setMode] = useState<TrainingMode>("listen");
  const [category, setCategory] = useState<PhraseCategory | "all">("all");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced" | "all">("all");
  const [wpm, setWpm] = useState<number>(20);
  const [toneHz, setToneHz] = useState<number>(700);
  const [volume, setVolume] = useState<number>(0.8);

  // Session state
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [currentPhrase, setCurrentPhrase] = useState<Phrase | null>(null);
  const [userInput, setUserInput] = useState<string>("");
  const [showAnswer, setShowAnswer] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [corrections, setCorrections] = useState<Correction[]>([]);

  // Audio refs
  const encoderRef = useRef<MorseEncoder>(new MorseEncoder());
  const toneSamplerRef = useRef<ToneSampler>(new ToneSampler({ frequency: 700, amplitude: 0.8 }));
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const isInitializedRef = useRef<boolean>(false);

  // Initialize audio
  const ensureInitialized = useCallback(async () => {
    if (isInitializedRef.current) return true;

    try {
      await toneSamplerRef.current.initialize();
      audioContextRef.current = toneSamplerRef.current.getAudioContext();

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

  // Update settings
  useEffect(() => {
    toneSamplerRef.current.setFrequency(toneHz);
  }, [toneHz]);

  useEffect(() => {
    toneSamplerRef.current.setWPM(wpm);
    encoderRef.current.setConfig({ wpm, farnsworth: 1.0, toneHz });
  }, [wpm, toneHz]);

  useEffect(() => {
    toneSamplerRef.current.setAmplitude(volume);
  }, [volume]);

  // Stop audio
  const stopAudio = useCallback(() => {
    sourceNodesRef.current.forEach(source => {
      try {
        source.stop();
      } catch {
        // Ignore if already stopped
      }
    });
    sourceNodesRef.current = [];
    setIsPlaying(false);
  }, []);

  // Play a phrase
  const playPhrase = useCallback(async (phrase: Phrase) => {
    if (isPlaying) {
      stopAudio();
      return;
    }

    const initialized = await ensureInitialized();
    if (!initialized || !audioContextRef.current || !toneSamplerRef.current.isReady()) {
      console.error("Audio not initialized");
      return;
    }

    try {
      const audioContext = audioContextRef.current;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      if (!gainNodeRef.current) {
        gainNodeRef.current = audioContext.createGain();
        gainNodeRef.current.connect(audioContext.destination);
      }
      gainNodeRef.current.gain.value = volume;

      const symbols = encoderRef.current.textToSymbols(phrase.text);
      if (symbols.length === 0) return;

      const ditBuffer = toneSamplerRef.current.getDitBuffer();
      const dahBuffer = toneSamplerRef.current.getDahBuffer();

      if (!ditBuffer || !dahBuffer) return;

      setIsPlaying(true);
      const sources: AudioBufferSourceNode[] = [];
      let startTime = audioContext.currentTime;

      for (const symbol of symbols) {
        if (symbol.type === "tone") {
          const source = audioContext.createBufferSource();
          source.buffer = symbol.duration > 0.15 ? dahBuffer : ditBuffer;
          source.connect(gainNodeRef.current);

          source.start(startTime);
          sources.push(source);
          startTime += symbol.duration;
        } else {
          startTime += symbol.duration;
        }
      }

      sourceNodesRef.current = sources;

      const totalDuration = startTime - audioContext.currentTime + 0.1;
      setTimeout(() => {
        stopAudio();
      }, totalDuration * 1000);

    } catch (error) {
      console.error("Error playing phrase:", error);
      setIsPlaying(false);
    }
  }, [isPlaying, stopAudio, ensureInitialized, volume]);

  // Get filtered phrases
  const getFilteredPhrases = useCallback((): Phrase[] => {
    let phrases = [...PHRASE_LIBRARY];

    if (category !== "all") {
      phrases = phrases.filter(p => p.category === category);
    }

    if (difficulty !== "all") {
      phrases = phrases.filter(p => p.difficulty === difficulty);
    }

    return phrases;
  }, [category, difficulty]);

  // Start a new training session
  const startSession = useCallback(() => {
    const phrases = getFilteredPhrases();
    if (phrases.length === 0) return;

    // Shuffle phrases
    const shuffled = phrases.sort(() => Math.random() - 0.5);

    setSession({
      totalPhrases: shuffled.length,
      currentIndex: 0,
      correct: 0,
      incorrect: 0,
      results: [],
    });

    setCurrentPhrase(shuffled[0]);
    setUserInput("");
    setShowAnswer(false);
  }, [getFilteredPhrases]);

  // Check user's answer
  const checkAnswer = useCallback(() => {
    if (!currentPhrase || !session) return;

    const similarity = stringSimilarity(userInput.toUpperCase(), currentPhrase.text);
    const isCorrect = similarity >= 0.8;

    const newResults = [...session.results, {
      phrase: currentPhrase,
      userAnswer: userInput,
      correct: isCorrect,
      similarity,
    }];

    setSession({
      ...session,
      results: newResults,
      currentIndex: session.currentIndex + 1,
      correct: session.correct + (isCorrect ? 1 : 0),
      incorrect: session.incorrect + (isCorrect ? 0 : 1),
    });

    setShowAnswer(true);
  }, [currentPhrase, session, userInput]);

  // Move to next phrase
  const nextPhrase = useCallback(() => {
    if (!session) return;

    const phrases = getFilteredPhrases();
    const nextIndex = session.currentIndex;

    if (nextIndex >= phrases.length) {
      // Session complete
      setCurrentPhrase(null);
      return;
    }

    setCurrentPhrase(phrases[nextIndex]);
    setUserInput("");
    setShowAnswer(false);
  }, [session, getFilteredPhrases]);

  // Record a correction for learning
  const recordCorrection = useCallback((original: string, correct: string) => {
    if (!currentPhrase) return;

    const correction: Correction = {
      phraseId: currentPhrase.id,
      original,
      correct,
      timestamp: Date.now(),
    };

    setCorrections(prev => [...prev, correction]);

    // Save to localStorage for persistence
    try {
      const saved = localStorage.getItem("cw_training_corrections");
      const existing: Correction[] = saved ? JSON.parse(saved) : [];
      existing.push(correction);
      localStorage.setItem("cw_training_corrections", JSON.stringify(existing));
    } catch (e) {
      console.error("Failed to save correction:", e);
    }
  }, [currentPhrase]);

  // Load saved corrections on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("cw_training_corrections");
      if (saved) {
        setCorrections(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load corrections:", e);
    }
  }, []);

  // Listen mode: just play and show
  const ListenMode = () => (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Click PLAY to hear a random phrase. Try to decode it in your head!
      </Text>

      <Button
        size="lg"
        color="emerald"
        radius="xl"
        onClick={() => {
          const phrases = getFilteredPhrases();
          const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
          setCurrentPhrase(randomPhrase);
          playPhrase(randomPhrase);
        }}
        disabled={isPlaying}
      >
        {isPlaying ? "PLAYING..." : "▶ PLAY RANDOM PHRASE"}
      </Button>

      {currentPhrase && (
        <Paper p="md" radius="lg" style={{ background: "#f0fdf4", border: "2px solid #d1fae5" }}>
          <Text size="xl" fw={700} c="emerald.8" mb="xs">
            {currentPhrase.text}
          </Text>
          <Text size="sm" c="dimmed" mb="xs">
            Morse: {textToMorse(currentPhrase.text)}
          </Text>
          <Text size="sm" c="gray.7">
            {currentPhrase.description}
          </Text>
          <Badge mt="xs" variant="light" color={
            currentPhrase.difficulty === "beginner" ? "green" :
            currentPhrase.difficulty === "intermediate" ? "yellow" : "orange"
          }>
            {currentPhrase.difficulty}
          </Badge>
        </Paper>
      )}

      <Button
        variant="light"
        color="gray"
        onClick={() => {
          setCurrentPhrase(null);
          setUserInput("");
          setShowAnswer(false);
        }}
      >
        CLEAR
      </Button>
    </Stack>
  );

  // Practice mode: user types and checks
  const PracticeMode = () => (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Listen to the phrase and type what you hear. The app will check your answer!
      </Text>

      {!session ? (
        <Button size="lg" color="emerald" radius="xl" onClick={startSession}>
          ▶ START PRACTICE SESSION
        </Button>
      ) : currentPhrase ? (
        <>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Progress: {session.currentIndex + 1} / {session.totalPhrases}
            </Text>
            <Group gap="xs">
              <Badge color="green" variant="light">{session.correct} correct</Badge>
              <Badge color="red" variant="light">{session.incorrect} incorrect</Badge>
            </Group>
          </Group>

          <Progress
            value={(session.currentIndex / session.totalPhrases) * 100}
            color="emerald"
            size="sm"
          />

          <Button
            size="lg"
            color="teal"
            radius="xl"
            onClick={() => playPhrase(currentPhrase)}
            disabled={isPlaying}
          >
            {isPlaying ? "PLAYING..." : "▶ PLAY PHRASE"}
          </Button>

          {!showAnswer ? (
            <TextInput
              label="Your Answer"
              placeholder="Type what you heard..."
              value={userInput}
              onChange={(e) => setUserInput(e.currentTarget.value.toUpperCase())}
              styles={{
                input: {
                  fontFamily: "monospace",
                  fontSize: "18px",
                  borderColor: "#d1fae5",
                },
              }}
              disabled={isPlaying}
            />
          ) : (
            <Paper p="md" radius="lg" style={{ background: "#f0fdf4", border: "2px solid #d1fae5" }}>
              <Text size="sm" c="dimmed" mb="xs">
                Correct: <Text span c="green" fw={700}>{currentPhrase.text}</Text>
              </Text>
              {userInput.toUpperCase() !== currentPhrase.text && (
                <Text size="sm" c="dimmed">
                  Your answer: <Text span c="red" fw={700}>{userInput.toUpperCase()}</Text>
                </Text>
              )}
              <Text size="sm" c="dimmed" mt="xs">
                {stringSimilarity(userInput.toUpperCase(), currentPhrase.text) >= 0.8
                  ? "✓ Good job!"
                  : "✗ Keep practicing!"}
              </Text>
            </Paper>
          )}

          <Group>
            {!showAnswer ? (
              <Button
                color="emerald"
                radius="xl"
                onClick={checkAnswer}
                disabled={!userInput.trim() || isPlaying}
              >
                CHECK ANSWER
              </Button>
            ) : (
              <Button
                color="emerald"
                radius="xl"
                onClick={nextPhrase}
                disabled={session.currentIndex >= session.totalPhrases - 1}
              >
                NEXT PHRASE →
              </Button>
            )}
          </Group>
        </>
      ) : (
        <Paper p="lg" radius="lg" style={{ background: "#f0fdf4", border: "2px solid #d1fae5", textAlign: "center" }}>
          <Text size="xl" fw={700} c="emerald.8" mb="xs">
            Session Complete!
          </Text>
          <Text size="md" c="dimmed" mb="xs">
            Correct: {session.correct} / {session.totalPhrases}
            ({Math.round((session.correct / session.totalPhrases) * 100)}%)
          </Text>
          <Button
            mt="md"
            variant="light"
            color="emerald"
            radius="xl"
            onClick={startSession}
          >
            START NEW SESSION
          </Button>
        </Paper>
      )}
    </Stack>
  );

  // Free practice: continuous decoding
  const FreeMode = () => (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Play phrases one by one and practice decoding. Check your answer when ready!
      </Text>

      <Button
        size="lg"
        color="orange"
        radius="xl"
        onClick={() => {
          const phrases = getFilteredPhrases();
          const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
          setCurrentPhrase(randomPhrase);
          setUserInput("");
          setShowAnswer(false);
          playPhrase(randomPhrase);
        }}
        disabled={isPlaying}
      >
        {isPlaying ? "PLAYING..." : "▶ PLAY PHRASE"}
      </Button>

      {currentPhrase && (
        <>
          <TextInput
            label="Your Answer"
            placeholder="Type what you heard..."
            value={userInput}
            onChange={(e) => setUserInput(e.currentTarget.value.toUpperCase())}
            styles={{
              input: {
                fontFamily: "monospace",
                fontSize: "18px",
                borderColor: "#d1fae5",
              },
            }}
            disabled={isPlaying}
          />

          <Group>
            <Button
              color="emerald"
              radius="xl"
              onClick={() => {
                if (!currentPhrase) return;
                const similarity = stringSimilarity(userInput.toUpperCase(), currentPhrase.text);
                setShowAnswer(true);

                if (similarity < 0.8 && userInput.trim()) {
                  recordCorrection(userInput, currentPhrase.text);
                }
              }}
              disabled={!userInput.trim() || isPlaying}
            >
              CHECK
            </Button>
            <Button
              variant="light"
              color="gray"
              onClick={() => {
                setUserInput("");
                setShowAnswer(false);
              }}
            >
              SKIP
            </Button>
          </Group>

          {showAnswer && (
            <Paper p="md" radius="lg" style={{ background: "#f0fdf4", border: "2px solid #d1fae5" }}>
              <Text size="sm" c="dimmed">
                Correct: <Text span c="green" fw={700}>{currentPhrase.text}</Text>
              </Text>
              {userInput.toUpperCase() !== currentPhrase.text && (
                <Text size="sm" c="dimmed">
                  Your answer: <Text span c="red" fw={700}>{userInput.toUpperCase()}</Text>
                </Text>
              )}
              <Text size="sm" c="gray.7" mb="xs">
                {currentPhrase.description}
              </Text>
              <Text size="xs" c="dimmed">
                Morse: {textToMorse(currentPhrase.text)}
              </Text>
            </Paper>
          )}
        </>
      )}
    </Stack>
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [stopAudio]);

  return (
    <Stack gap="md">
      {/* Settings Card */}
      <Paper p="lg" radius="lg" shadow="sm" style={{ background: "white" }}>
        <Flex justify="space-between" align="center" mb="md">
          <Text size="lg" fw={700} c="emerald.7">
            CW TRAINING
          </Text>
          {corrections.length > 0 && (
            <Badge variant="light" color="orange">
              {corrections.length} corrections recorded
            </Badge>
          )}
        </Flex>

        {/* Mode Selection */}
        <SegmentedControl
          value={mode}
          onChange={(v) => setMode(v as TrainingMode)}
          data={[
            { label: "🔊 Listen", value: "listen" },
            { label: "✏️ Practice", value: "practice" },
            { label: "🎯 Free", value: "free" },
          ]}
          fullWidth
          styles={{
            root: { background: "#f0fdf4", borderRadius: 12 },
            indicator: { background: "#10b981" },
          }}
        />

        {/* Settings */}
        <Group gap="md" wrap="wrap" mt="md">
          <Box style={{ flex: 1, minWidth: 120 }}>
            <Text size="xs" c="dimmed" mb={4} fw={500}>CATEGORY</Text>
            <SegmentedControl
              size="xs"
              value={category}
              onChange={(v) => setCategory(v as PhraseCategory | "all")}
              data={[
                { label: "All", value: "all" },
                ...getCategories().map(c => ({
                  label: CATEGORY_LABELS[c],
                  value: c,
                })),
              ]}
              styles={{ root: { background: "#f0fdf4" } }}
            />
          </Box>

          <Box style={{ flex: 1, minWidth: 100 }}>
            <Text size="xs" c="dimmed" mb={4} fw={500}>DIFFICULTY</Text>
            <SegmentedControl
              size="xs"
              value={difficulty}
              onChange={(v) => setDifficulty(v as typeof difficulty)}
              data={[
                { label: "All", value: "all" },
                { label: "Easy", value: "beginner" },
                { label: "Med", value: "intermediate" },
                { label: "Adv", value: "advanced" },
              ]}
              styles={{ root: { background: "#f0fdf4" } }}
            />
          </Box>
        </Group>

        {/* Speed and Tone Controls */}
        <Group gap="md" mt="md">
          <Box style={{ flex: 1 }}>
            <Text size="xs" c="dimmed" mb={4} fw={500}>WPM: {wpm}</Text>
            <Slider
              value={wpm}
              onChange={setWpm}
              min={5}
              max={35}
              step={1}
              size="sm"
              color="emerald"
            />
          </Box>
          <Box style={{ flex: 1 }}>
            <Text size="xs" c="dimmed" mb={4} fw={500}>TONE: {toneHz}Hz</Text>
            <Slider
              value={toneHz}
              onChange={setToneHz}
              min={400}
              max={1000}
              step={50}
              size="sm"
              color="teal"
            />
          </Box>
          <Box style={{ flex: 1 }}>
            <Text size="xs" c="dimmed" mb={4} fw={500}>VOL: {Math.round(volume * 100)}%</Text>
            <Slider
              value={volume}
              onChange={setVolume}
              min={0}
              max={1}
              step={0.1}
              size="sm"
              color="gray"
            />
          </Box>
        </Group>
      </Paper>

      {/* Training Content Card */}
      <Paper p="lg" radius="lg" shadow="sm" style={{ background: "white" }}>
        <Box mt="sm">
          {mode === "listen" && <ListenMode />}
          {mode === "practice" && <PracticeMode />}
          {mode === "free" && <FreeMode />}
        </Box>
      </Paper>
    </Stack>
  );
};
