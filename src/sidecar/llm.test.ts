import { describe, expect, it } from "vitest";
import { OCR_PROMPT } from "../shared/ocr";
import { chatPayload, imageReadRequest, llmRoot } from "./llm";

describe("llmRoot", () => {
  it("strips trailing slashes and a /v1 suffix", () => {
    expect(llmRoot("http://h:8000/v1/")).toBe("http://h:8000");
    expect(llmRoot("http://h:8000")).toBe("http://h:8000");
  });
});

describe("imageReadRequest", () => {
  it("turns thinking off and offers no tools", () => {
    const body = chatPayload(
      imageReadRequest({
        llmBaseUrl: "http://127.0.0.1:8000/v1",
        llmApiKey: "k",
        model: "vision",
        image: "data:image/jpeg;base64,aa",
      }),
      false,
      true
    );
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    const messages = body.messages as Array<{ content: Array<{ type: string; text?: string }> }>;
    expect(messages[0].content[0].text).toBe(OCR_PROMPT);
    expect(messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,aa" } });
  });
});
