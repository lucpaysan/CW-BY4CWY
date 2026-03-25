import { useState } from "react";
import { Box, Flex, Text, UnstyledButton } from "@mantine/core";
import { Decoder } from "./Decoder";
import { Encoder } from "./components/Encoder";
import { Training } from "./components/Training";

type TabId = "decode" | "encode" | "training";

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: "decode", label: "DECODE", icon: "📡" },
  { id: "encode", label: "ENCODE", icon: "📨" },
  { id: "training", label: "TRAIN", icon: "🎯" },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("decode");

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
              background: "linear-gradient(145deg, var(--gold-primary), var(--gold-dark))",
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
                  ? "linear-gradient(135deg, var(--gold-primary), var(--gold-dark))"
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
            <Box>
              <Text
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.3px",
                }}
              >
                CW Lab
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  marginTop: 3,
                  fontWeight: 500,
                }}
              >
                AI-Powered Morse Code
              </Text>
            </Box>
            <Box
              style={{
                padding: "5px 14px",
                borderRadius: 20,
                background: "var(--gold-cream)",
                border: "1px solid var(--gold-light)",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--gold-dark)",
                  letterSpacing: "0.5px",
                }}
              >
                ● DL MODE
              </Text>
            </Box>
          </Flex>

          {/* Tab Content */}
          {activeTab === "decode" && <Decoder />}
          {activeTab === "encode" && <Encoder />}
          {activeTab === "training" && <Training />}
        </Box>
      </Box>
    </Flex>
  );
}

export default App;
