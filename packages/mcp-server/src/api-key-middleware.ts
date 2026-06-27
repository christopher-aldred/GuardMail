/**
 * Middleware that normalises an `x-api-key` header into an
 * `Authorization: Bearer` header so that the standard MCP OAuth
 * bearer-auth middleware accepts requests from clients configured
 * with a static API key (e.g. `.mcp.json` with `headers: { "x-api-key": ... }`).
 *
 * Standard MCP clients that send `Authorization: Bearer …` directly
 * are unaffected — the header is only injected when `Authorization`
 * is absent.
 */
import type { Request, Response, NextFunction } from 'express';

export function apiKeyHeaderMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${apiKey}`;
  }
  next();
}