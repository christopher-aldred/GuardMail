/**
 * Shared MCP server factory.
 *
 * Builds a low-level MCP `Server` instance wired with the Guardmail tool
 * and resource handlers. Used by both:
 *   - the Express/OAuth Streamable HTTP server (`http-server.ts`) — one
 *     server per request, with the request's auth token captured in an
 *     `ApiClient` closure, and
 *   - the Smithery stdio entry point (`index.ts`) — one server for the
 *     process lifetime, with the API key taken from Smithery config.
 *
 * Keeping the wiring here avoids duplicating the tool/resource handlers
 * across the two deployment modes.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ApiClient } from './api-client';
import { tools } from './tools';
import { resources } from './resources';

export interface BuildServerOptions {
  /** Authenticated API client used by tool/resource handlers. */
  client: ApiClient;
  /**
   * When set, every tool call / resource read returns this message
   * instead of hitting the API. Used by the Smithery entry point when
   * no API key has been supplied yet, so the agent is told how to
   * configure one rather than receiving a raw 401.
   */
  missingKeyMessage?: string;
}

function findTool(name: string) {
  return tools.find((t) => t.name === name);
}
function findResource(uri: string) {
  return resources.find((r) => r.uri === uri);
}

export function buildMcpServer(opts: BuildServerOptions): Server {
  const { client, missingKeyMessage } = opts;
  const server = new Server(
    { name: 'guardmail-mcp', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema as any,
      ...(t.outputSchema ? { outputSchema: t.outputSchema as any } : {}),
      ...(t.annotations ? { annotations: t.annotations as any } : {}),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (missingKeyMessage) {
      return { content: [{ type: 'text' as const, text: missingKeyMessage }] };
    }
    const tool = findTool(request.params.name);
    if (!tool) {
      return { content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }], isError: true };
    }
    const text = await tool.handler(client, request.params.arguments);
    const parsed = JSON.parse(text) as { success: boolean; data?: unknown; error?: unknown };
    // Return both a human-readable text block and a structuredContent
    // payload so clients that rely on outputSchema can consume the result
    // without re-parsing prose.
    const isError = !parsed.success;
    // `error` is a structured object `{ code, message, status?, details? }`
    // (see tools/index.ts `ToolError`). Fall back to a string for any
    // legacy callers still returning a plain string.
    const errText =
      typeof parsed.error === 'string'
        ? parsed.error
        : (parsed.error as { message?: string } | undefined)?.message ?? 'Unknown error';
    return {
      content: [
        {
          type: 'text' as const,
          text: isError ? errText : JSON.stringify(parsed.data, null, 2),
        },
      ],
      ...(tool.outputSchema ? { structuredContent: parsed as any } : {}),
      isError,
    };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: resources.map((r) => ({
      uri: r.uri,
      name: r.uri,
      description: r.description,
      mimeType: r.mimeType,
    })),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (missingKeyMessage) {
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: 'text/plain',
            text: missingKeyMessage,
          },
        ],
      };
    }
    const resource = findResource(request.params.uri);
    if (!resource) {
      throw new Error(`Unknown resource: ${request.params.uri}`);
    }
    const contents = await resource.read(client);
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: resource.mimeType,
          text: contents,
        },
      ],
    };
  });

  return server;
}