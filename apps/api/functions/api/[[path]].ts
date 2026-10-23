// Cloudflare Pages Function: forwards every /api/* request to the framework-free handler (apps/api/src/handler.ts).
import { handle } from "../../src/handler";
import type { Env } from "../../src/core";

export const onRequest = (ctx: { request: Request; env: Env }) => handle(ctx.request, ctx.env, Date.now());
