import { CommittedFile, modelTurnText } from "./attachedFiles";
import { fitContext, messagesTokens } from "./context";
import { systemPrompt } from "./prompts";
import { compactSearchReplay, ReplayMessage } from "./searchReplay";

export type MeterHistoryRow = ReplayMessage & {
  tool_calls?: Array<{ id?: string; function: { name: string; arguments: string } }>;
};

/** Tokens of the message list the next send would pass to the model. */
export function countOutgoingTokens(input: {
  history: MeterHistoryRow[];
  instruction: string;
  files: CommittedFile[];
  contextLimit: number;
  searxng: boolean;
  argos: boolean;
  memory: string;
  mail?: string;
  now?: Date;
}): number {
  const hasFiles = input.files.length > 0;
  const offered = { files: hasFiles, searxng: input.searxng, argos: input.argos, memory: input.memory, mail: input.mail };
  const reserved = systemPrompt(offered).length + input.instruction.length;
  const messages = [
    { role: "system", content: systemPrompt({ ...offered, now: input.now ?? new Date() }) },
    ...input.history,
    { role: "user", content: modelTurnText(input.instruction, input.files, input.contextLimit, reserved) },
  ];
  return messagesTokens(fitContext(compactSearchReplay(messages), input.contextLimit));
}
