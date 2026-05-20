import type { AuxiliaryTaskReturn } from "./types";

type CaptureInput = {
  auxiliaryTaskId: string;
  runId?: string;
  sessionHistory?: string;
  stdout?: string;
};

export type ExtractedAuxiliaryFindings = {
  capturedAnswer: string;
  findings: string[];
};

export type MismatchedAuxiliaryReturn = {
  auxiliaryTaskId: string;
};

const STATUS_VALUES = new Set(["completed", "blocked", "failed"]);
const VERDICT_VALUES = new Set(["provisional_accept", "revise", "reject"]);
const EVIDENCE_KIND_VALUES = new Set(["note", "artifact", "command", "file"]);
const RECOMMENDED_ACTION_VALUES = new Set(["accept", "retry", "ask_user", "spawn_followup", "fallback_to_host"]);

export function captureSchemaConfirmedAuxiliaryReturn(input: CaptureInput): AuxiliaryTaskReturn | undefined {
  const sources = captureSources(input);
  for (const source of sources) {
    const matches = extractJsonObjects(source)
      .map(parseJsonObject)
      .filter((value): value is Record<string, unknown> => isRecord(value))
      .filter((value) => isAuxiliaryTaskReturnForTask(value, input.auxiliaryTaskId, input.runId));
    const last = matches.at(-1);
    if (last) return last as unknown as AuxiliaryTaskReturn;
  }
  return undefined;
}

export function captureMismatchedAuxiliaryReturns(input: CaptureInput): MismatchedAuxiliaryReturn[] {
  const seen = new Set<string>();
  const mismatches: MismatchedAuxiliaryReturn[] = [];
  for (const source of captureSources(input)) {
    for (const value of extractJsonObjects(source).map(parseJsonObject)) {
      if (!isRecord(value) || value.kind !== "Auxiliary Task Return") continue;
      const auxiliaryTaskId = value.auxiliaryTaskId;
      if (typeof auxiliaryTaskId !== "string" || auxiliaryTaskId === input.auxiliaryTaskId || seen.has(auxiliaryTaskId)) {
        continue;
      }
      seen.add(auxiliaryTaskId);
      mismatches.push({ auxiliaryTaskId });
    }
  }
  return mismatches;
}

export function captureExtractedAuxiliaryFindings(input: Pick<CaptureInput, "runId" | "sessionHistory" | "stdout">): ExtractedAuxiliaryFindings | undefined {
  const capturedAnswer = [
    { source: captureSessionHistorySource(input), requireFinalMarker: false },
    { source: input.stdout ?? "", requireFinalMarker: true },
  ]
    .map(({ source, requireFinalMarker }) => extractFreeFormAnswer(source, { requireFinalMarker }))
    .find((answer) => answer.length > 0);
  if (!capturedAnswer) return undefined;
  const findings = capturedAnswer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (findings.length === 0) return undefined;
  return { capturedAnswer, findings };
}

function captureSources(input: Pick<CaptureInput, "runId" | "sessionHistory" | "stdout">): string[] {
  return [
    captureSessionHistorySource(input),
    input.stdout ?? "",
  ];
}

function captureSessionHistorySource(input: Pick<CaptureInput, "runId" | "sessionHistory">): string {
  const scopedHistory = scopeSessionHistoryToRun(input.sessionHistory ?? "", input.runId);
  return scopedHistory ?? input.sessionHistory ?? "";
}

function scopeSessionHistoryToRun(sessionHistory: string, runId: string | undefined): string | undefined {
  if (!runId || !sessionHistory) return undefined;
  const markerIndex = sessionHistory.lastIndexOf(`OMA runId: ${runId}`);
  if (markerIndex === -1) return undefined;
  return sessionHistory.slice(markerIndex);
}

function extractFreeFormAnswer(text: string, options: { requireFinalMarker: boolean }): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const finalMarkerIndex = findLastAssistantFinalIndex(lines);
  const timestampedAssistantIndex = finalMarkerIndex === -1 ? findLastTimestampedAssistantIndex(lines) : -1;
  if (options.requireFinalMarker && finalMarkerIndex === -1 && timestampedAssistantIndex === -1) {
    return "";
  }
  if (finalMarkerIndex === -1 && timestampedAssistantIndex === -1 && lines.some(isTranscriptBoundary)) {
    return "";
  }
  const answerLines = finalMarkerIndex !== -1
    ? lines.slice(finalMarkerIndex + 1).filter((line) => !isTranscriptBoundary(line))
    : timestampedAssistantIndex !== -1
      ? timestampedAssistantAnswerLines(lines, timestampedAssistantIndex)
      : lines.filter((line) => !/^assistant\s+final$/i.test(line));
  const answer = answerLines
    .join("\n")
    .trim();
  if (isAuxiliaryTaskReturnJsonOnly(answer)) return "";
  if (isIncompleteJsonLikeAnswer(answer) || isTransportOnlyAnswer(answer)) return "";
  return answer;
}

function findLastAssistantFinalIndex(lines: string[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^assistant\s+final$/i.test(lines[index])) return index;
  }
  return -1;
}

function findLastTimestampedAssistantIndex(lines: string[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (timestampedAssistantMatch(lines[index])) return index;
  }
  return -1;
}

function timestampedAssistantAnswerLines(lines: string[], assistantIndex: number): string[] {
  const firstLine = timestampedAssistantMatch(lines[assistantIndex])?.[1]?.trim();
  const answerLines = firstLine ? [firstLine] : [];
  for (let index = assistantIndex + 1; index < lines.length; index += 1) {
    if (isTranscriptBoundary(lines[index])) break;
    answerLines.push(lines[index]);
  }
  return answerLines;
}

function timestampedAssistantMatch(line: string): RegExpMatchArray | null {
  return line.match(/^\d{4}-\d{2}-\d{2}T\S+\s+assistant\b\s*(.*)$/i);
}

function isTranscriptBoundary(line: string): boolean {
  return /^\[(done|client|tool)\]/i.test(line)
    || /^\d{4}-\d{2}-\d{2}T\S+\s+(user|assistant)\b/i.test(line);
}

function isIncompleteJsonLikeAnswer(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  return parseJsonObject(trimmed) === undefined;
}

function isTransportOnlyAnswer(text: string): boolean {
  return /^(acpx completed|session metadata)$/i.test(text.trim());
}

function isAuxiliaryTaskReturnJsonOnly(text: string): boolean {
  const value = parseJsonObject(text);
  return isRecord(value) && value.kind === "Auxiliary Task Return";
}

function extractJsonObjects(text: string): string[] {
  return [
    ...extractFencedJson(text),
    ...extractBalancedJsonObjects(text),
  ];
}

function extractFencedJson(text: string): string[] {
  const matches: string[] = [];
  const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of text.matchAll(fencePattern)) {
    matches.push(match[1].trim());
  }
  return matches;
}

function extractBalancedJsonObjects(text: string): string[] {
  const objects: string[] = [];
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = inString;
        continue;
      }
      if (char === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          objects.push(text.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return objects;
}

function parseJsonObject(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

function isAuxiliaryTaskReturnForTask(value: Record<string, unknown>, auxiliaryTaskId: string, runId?: string): boolean {
  return value.kind === "Auxiliary Task Return"
    && value.hostPlanComplete === false
    && value.auxiliaryTaskId === auxiliaryTaskId
    && (runId === undefined || value.runId === runId)
    && typeof value.summary === "string"
    && STATUS_VALUES.has(String(value.status))
    && VERDICT_VALUES.has(String(value.verdict))
    && isScope(value.scope)
    && isEvidenceArray(value.evidence)
    && isStringArray(value.blockers)
    && isStringArray(value.findings)
    && isStringArray(value.followups)
    && isCoordinationAdvice(value.coordinationAdvice);
}

function isScope(value: unknown): boolean {
  return isRecord(value)
    && isStringArray(value.readFiles)
    && isStringArray(value.modifiedFiles)
    && isStringArray(value.artifactRefs);
}

function isEvidenceArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) =>
    isRecord(item)
    && EVIDENCE_KIND_VALUES.has(String(item.kind))
    && typeof item.summary === "string"
    && (item.reference == null || typeof item.reference === "string")
  );
}

function isCoordinationAdvice(value: unknown): boolean {
  return isRecord(value)
    && RECOMMENDED_ACTION_VALUES.has(String(value.recommendedAction))
    && typeof value.reason === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
