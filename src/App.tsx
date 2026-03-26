import { useState } from "react";
import { Box, Flex, Text, UnstyledButton } from "@mantine/core";
import { Decoder } from "./Decoder";
import { Encoder } from "./components/Encoder";
import { Training } from "./components/Training";
import { ErrorBoundary } from "./components/ErrorBoundary";

type TabId = "decode" | "encode" | "training";
type DecoderMode = "dl" | "ggmorse";

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: "decode", label: "DECODE", icon: "📡" },
  { id: "encode", label: "ENCODE", icon: "📨" },
  { id: "training", label: "TRAIN", icon: "🎯" },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("decode");
  const [decoderMode, setDecoderMode] = useState<DecoderMode>("dl");

  return (
    <Flex style={{ height: "100vh", background: "var(--bg-main)" }}>
      {/* Sidebar */}
      <Flex
        direction="column"
        w={88}
        style={{
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border-dark)",
        }}
      >
        {/* Logo */}
        <Flex justify="center" mt={32} mb={40}>
          <Box
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(145deg, var(--teal-primary), var(--teal-dark))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "0.5px",
              boxShadow: "0 4px 12px rgba(182, 158, 100, 0.3)",
            }}
          >
            CW
          </Box>
        </Flex>

        {/* Nav Items */}
        <Flex direction="column" gap={6} px={16}>
          {tabs.map((tab) => (
            <UnstyledButton
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                width: "100%",
                padding: "14px 8px",
                borderRadius: 12,
                background: activeTab === tab.id
                  ? "linear-gradient(135deg, var(--teal-primary), var(--teal-dark))"
                  : "rgba(182, 158, 100, 0.1)",
                border: activeTab === tab.id
                  ? "none"
                  : "1px solid rgba(182, 158, 100, 0.2)",
                transition: "all 0.2s ease",
                boxShadow: activeTab === tab.id
                  ? "0 2px 8px rgba(182, 158, 100, 0.25)"
                  : "none",
              }}
            >
              <Flex direction="column" align="center" gap={5}>
                <Text style={{ fontSize: 22 }}>{tab.icon}</Text>
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: activeTab === tab.id ? "#fff" : "var(--gold-light)",
                    letterSpacing: "0.8px",
                  }}
                >
                  {tab.label}
                </Text>
              </Flex>
            </UnstyledButton>
          ))}
        </Flex>

        {/* Version */}
        <Box mt="auto" mb={24} style={{ textAlign: "center" }}>
          <Text style={{ fontSize: 9, color: "var(--text-muted)" }}>v2.0</Text>
        </Box>
      </Flex>

      {/* Main Content */}
      <Box style={{ flex: 1, overflow: "auto" }}>
        <Box p={28}>
          {/* Header */}
          <Flex align="center" justify="space-between" mb={28}>
            <Flex align="center" gap={20}>
              <Box
                component="img"
                src="/logo.png"
                alt="CW-BY4CWY"
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 16,
                  objectFit: "cover",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
                }}
              />
              <Box>
                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: "var(--text-primary)",
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    textShadow: "0 1px 2px rgba(7, 123, 156, 0.2)",
                  }}
                >
                  BY4CWY
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    letterSpacing: "3px",
                    textTransform: "uppercase",
                    marginTop: 4,
                    opacity: 0.8,
                  }}
                >
                  WEIYU AMATEUR RADIO CLUB
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: "var(--gold-primary)",
                    fontWeight: 600,
                    letterSpacing: "1px",
                    marginTop: 8,
                  }}
                >
                  ◆ AI-POWERED MORSE CODE ◆
                </Text>
              </Box>
            </Flex>
            <UnstyledButton
              onClick={() => setDecoderMode((m) => (m === "dl" ? "ggmorse" : "dl"))}
              style={{
                padding: "5px 14px",
                borderRadius: 20,
                background: decoderMode === "dl"
                  ? "var(--gold-cream)"
                  : "linear-gradient(135deg, var(--teal-primary), var(--teal-dark))",
                border: `1px solid ${decoderMode === "dl" ? "var(--gold-light)" : "var(--gold-primary)"}`,
                transition: "all 0.2s ease",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: decoderMode === "dl" ? "var(--gold-dark)" : "#fff",
                  letterSpacing: "0.5px",
                }}
              >
                {decoderMode === "dl" ? "● DL MODE" : "● GG MODE"}
              </Text>
            </UnstyledButton>
          </Flex>

          {/* Tab Content */}
          {activeTab === "decode" && (
            <ErrorBoundary>
              <Decoder decoderMode={decoderMode} />
            </ErrorBoundary>
          )}
          {activeTab === "encode" && (
            <ErrorBoundary>
              <Encoder />
            </ErrorBoundary>
          )}
          {activeTab === "training" && (
            <ErrorBoundary>
              <Training />
            </ErrorBoundary>
          )}
        </Box>
      </Box>
    </Flex>
  );
}

export default App;
