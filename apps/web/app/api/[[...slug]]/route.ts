import { Elysia } from "elysia";

import { machine } from "../../machine";

export const runtime = "nodejs";

const app = new Elysia({ prefix: "/api" }).use(machine);

export const GET = app.fetch;
export const POST = app.fetch;
