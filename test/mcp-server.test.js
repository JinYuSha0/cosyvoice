import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("MCP 服务可以启动并暴露语音合成工具", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("mcp-server.js")],
    cwd: process.cwd(),
    stderr: "pipe",
  });
  const client = new Client({ name: "cosyvoice-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const tool = tools.find(({ name }) => name === "synthesize_speech");
    assert.ok(tool, "未发现 synthesize_speech 工具");
    assert.ok(tool.inputSchema.required.includes("text"));
  } finally {
    await client.close();
  }
});
