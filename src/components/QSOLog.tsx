/**
 * QSO Log Component
 *
 * Records amateur radio contacts with export functionality.
 * Supports ADIF format for LoTW, eQSL, etc.
 */

import { useState, useCallback, useEffect } from "react";
import {
  Box,
  Button,
  Flex,
  Stack,
  TextInput,
  Text,
  Group,
  Paper,
  Table,
  ActionIcon,
  Modal,
  Select,
  Badge,
  Menu,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { QSOEntry } from "../core/adif";
import { toADIF, toCSV } from "../core/adif";
import { presetManager } from "../core/presetManager";

// Default RST values
const RST_VALUES = ["599", "579", "569", "549", "539", "529", "519", "509", "599", "588", "577"];

// Common contest serial numbers
const generateSerial = (): string => {
  const saved = localStorage.getItem("qso_serial_counter");
  const counter = saved ? parseInt(saved, 10) : 1;
  localStorage.setItem("qso_serial_counter", String(counter + 1));
  return String(counter).padStart(3, "0");
};

export const QSOLog = () => {
  const [entries, setEntries] = useState<QSOEntry[]>([]);
  const [addModalOpened, { close: closeAddModal }] = useDisclosure(false);

  // New QSO form state
  const [newCallsign, setNewCallsign] = useState<string>("");
  const [newRstSent, setNewRstSent] = useState<string>("599");
  const [newRstReceived, setNewRstReceived] = useState<string>("599");
  const [newName, setNewName] = useState<string>("");
  const [newQth, setNewQth] = useState<string>("");
  const [newFrequency, setNewFrequency] = useState<string>("7.030");
  const [newNotes, setNewNotes] = useState<string>("");
  const [serialMode] = useState<boolean>(false);

  // Load entries from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("qso_log_entries");
      if (saved) {
        setEntries(JSON.parse(saved));
      }
    } catch (e) {
      console.error("Failed to load QSO log:", e);
    }
  }, []);

  // Save entries to localStorage
  const saveEntries = useCallback((newEntries: QSOEntry[]) => {
    setEntries(newEntries);
    try {
      localStorage.setItem("qso_log_entries", JSON.stringify(newEntries));
    } catch (e) {
      console.error("Failed to save QSO log:", e);
    }
  }, []);

  // Get current UTC date/time
  const getCurrentUTC = (): { date: string; time: string } => {
    const now = new Date();
    return {
      date: now.toISOString().slice(0, 10).replace(/-/g, ""),
      time: now.toISOString().slice(11, 16).replace(":", ""),
    };
  };

  // Add a new QSO entry
  const handleAddQSO = useCallback(() => {
    if (!newCallsign.trim()) return;

    const { date, time } = getCurrentUTC();
    const myCallsign = presetManager.getSelectedCallsignValue();

    const newEntry: QSOEntry = {
      id: `qso_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      callsign: newCallsign.toUpperCase().trim(),
      date,
      time,
      frequency: newFrequency,
      mode: "CW",
      rstSent: serialMode ? generateSerial() : newRstSent,
      rstReceived: newRstReceived,
      name: newName.toUpperCase().trim(),
      qth: newQth.toUpperCase().trim(),
      notes: newNotes,
      myCallsign,
    };

    saveEntries([...entries, newEntry]);

    // Reset form
    setNewCallsign("");
    setNewName("");
    setNewQth("");
    setNewNotes("");
    closeAddModal();
  }, [newCallsign, newRstSent, newRstReceived, newName, newQth, newFrequency, newNotes, serialMode, entries, saveEntries, closeAddModal]);

  // Delete an entry
  const handleDelete = useCallback((id: string) => {
    if (!confirm("Delete this QSO entry?")) return;
    saveEntries(entries.filter(e => e.id !== id));
  }, [entries, saveEntries]);

  // Export functions
  const handleExportADIF = useCallback(() => {
    const myCallsign = presetManager.getSelectedCallsignValue();
    const adifContent = toADIF(entries, myCallsign);
    downloadFile(adifContent, `qso_log_${new Date().toISOString().slice(0, 10)}.adi`, "text/plain");
  }, [entries]);

  const handleExportCSV = useCallback(() => {
    const csvContent = toCSV(entries);
    downloadFile(csvContent, `qso_log_${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
  }, [entries]);

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Clear all entries
  const handleClearAll = useCallback(() => {
    if (!confirm("Clear all QSO entries? This cannot be undone!")) return;
    saveEntries([]);
    localStorage.removeItem("qso_serial_counter");
  }, [saveEntries]);

  // Format date for display
  const formatDisplayDate = (dateStr: string): string => {
    if (dateStr.length === 8) {
      return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }
    return dateStr;
  };

  // Format time for display
  const formatDisplayTime = (timeStr: string): string => {
    if (timeStr.length === 4) {
      return `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`;
    }
    return timeStr;
  };

  return (
    <Stack gap="md" p="md" style={{ background: "var(--mantine-color-dark-8)", borderRadius: 8 }}>
      {/* Header */}
      <Flex justify="space-between" align="center" wrap="wrap" gap="sm">
        <Text size="lg" fw={600} c="white">
          QSO LOG
        </Text>
        <Group gap="xs">
          <Badge variant="light" color="blue">
            {entries.length} QSOs
          </Badge>
        </Group>
      </Flex>

      {/* Quick Add */}
      <Paper p="md" style={{ background: "var(--mantine-color-dark-7)" }}>
        <Flex gap="md" wrap="wrap" align="flex-end">
          <TextInput
            label="CALLSIGN"
            placeholder="W1ABC"
            value={newCallsign}
            onChange={(e) => setNewCallsign(e.currentTarget.value.toUpperCase())}
            style={{ flex: 1, minWidth: 100 }}
            styles={{ input: { fontFamily: "monospace" } }}
          />
          <Select
            label="RST SENT"
            data={RST_VALUES}
            value={newRstSent}
            onChange={(v) => setNewRstSent(v || "599")}
            style={{ width: 80 }}
            disabled={serialMode}
          />
          <Select
            label="RST RCVD"
            data={RST_VALUES}
            value={newRstReceived}
            onChange={(v) => setNewRstReceived(v || "599")}
            style={{ width: 80 }}
          />
          <Button
            color="indigo"
            onClick={handleAddQSO}
            disabled={!newCallsign.trim()}
          >
            LOG QSO
          </Button>
        </Flex>
      </Paper>

      {/* Entry List */}
      {entries.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          No QSOs logged yet. Add your first contact above!
        </Text>
      ) : (
        <Box style={{ maxHeight: 300, overflow: "auto" }}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Time</Table.Th>
                <Table.Th>Callsign</Table.Th>
                <Table.Th>RST S/R</Table.Th>
                <Table.Th>Name</Table.Th>
                <Table.Th>QTH</Table.Th>
                <Table.Th>Freq</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {entries.slice().reverse().map(entry => (
                <Table.Tr key={entry.id}>
                  <Table.Td>{formatDisplayDate(entry.date)}</Table.Td>
                  <Table.Td>{formatDisplayTime(entry.time)}</Table.Td>
                  <Table.Td fw={600}>{entry.callsign}</Table.Td>
                  <Table.Td>{entry.rstSent}/{entry.rstReceived}</Table.Td>
                  <Table.Td>{entry.name || "-"}</Table.Td>
                  <Table.Td>{entry.qth || "-"}</Table.Td>
                  <Table.Td>{entry.frequency}</Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => handleDelete(entry.id)}
                    >
                      ×
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}

      {/* Export Actions */}
      {entries.length > 0 && (
        <Group justify="space-between" mt="sm">
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <Button variant="outline" color="gray" size="sm">
                📤 Export
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={handleExportADIF}>
                📄 ADIF (.adi) - LoTW/eQSL
              </Menu.Item>
              <Menu.Item onClick={handleExportCSV}>
                📊 CSV (.csv) - Spreadsheet
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>

          <Button
            variant="subtle"
            color="red"
            size="xs"
            onClick={handleClearAll}
          >
            Clear All
          </Button>
        </Group>
      )}

      {/* Settings Modal */}
      <Modal opened={addModalOpened} onClose={closeAddModal} title="QSO Log Settings" centered>
        <Stack>
          <TextInput
            label="My Callsign"
            value={presetManager.getSelectedCallsignValue()}
            disabled
          />
          <TextInput
            label="Default Frequency (MHz)"
            value={newFrequency}
            onChange={(e) => setNewFrequency(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="outline" onClick={closeAddModal}>Close</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
};
