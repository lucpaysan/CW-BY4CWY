import { useState } from "react";
import { Container, Flex, Stack, Text, Box, Tabs, Paper } from "@mantine/core";
import { Decoder } from "./Decoder";
import { Encoder } from "./components/Encoder";
import { Training } from "./components/Training";

type MainTab = "decode" | "encode" | "training";

function App() {
  const [activeTab, setActiveTab] = useState<MainTab>("decode");

  return (
    <Container
      strategy="block"
      size="xl"
      p="sm"
      style={{ height: "100vh", overflow: "hidden" }}
    >
      <Stack gap="xs" style={{ height: "100%", overflow: "hidden" }}>
        {/* Header with Tabs */}
        <Paper p="xs" radius="lg" shadow="sm" style={{ background: "white" }}>
          <Flex align="center" justify="space-between" wrap="wrap" gap="xs">
            <Text size="xl" fw={700} c="emerald.7">
              CW Master
            </Text>

            <Tabs
              value={activeTab}
              onChange={(v) => setActiveTab(v as MainTab)}
              variant="pills"
              styles={{
                root: { background: "transparent" },
                list: { background: "#f0fdf4", borderRadius: 12, padding: 4 },
                tab: {
                  fontWeight: 600,
                  fontSize: "13px",
                  color: "#6b7280",
                  "&[data-active]": {
                    background: "#10b981",
                    color: "white",
                  },
                  "&:hover": {
                    background: "#d1fae5",
                  },
                },
              }}
            >
              <Tabs.List>
                <Tabs.Tab value="decode">DECODE</Tabs.Tab>
                <Tabs.Tab value="encode">ENCODE</Tabs.Tab>
                <Tabs.Tab value="training">TRAINING</Tabs.Tab>
              </Tabs.List>
            </Tabs>

            <Text size="xs" c="dimmed" visibleFrom="sm">
              DL + Bayesian
            </Text>
          </Flex>
        </Paper>

        {/* Tab Content - Full height, scrollable */}
        <Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {activeTab === "decode" && <Decoder />}
          {activeTab === "encode" && <Encoder />}
          {activeTab === "training" && <Training />}
        </Box>

        {/* Footer */}
        <Flex justify="center" py="xs">
          <Text c="dimmed" size="xs">
            Forked by BY4CWY
          </Text>
        </Flex>
      </Stack>
    </Container>
  );
}

export default App;
