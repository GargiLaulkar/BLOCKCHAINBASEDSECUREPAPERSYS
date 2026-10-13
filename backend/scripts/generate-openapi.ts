import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { schemas } from "@sigil/core";

const registry = new OpenAPIRegistry();
const cookieAuth = registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "connect.sid",
});
const apiError = schemas.APIErrorSchema;
const profilePayload = schemas.ProfilePayloadSchema;
const profileResponse = schemas.ProfileResponseSchema;
const authPayload = schemas.AuthVerifyPayloadSchema;
const authResponse = schemas.AuthResponseSchema;
const eventsResponse = schemas.EventsResponseSchema;
const overviewResponse = schemas.StatsOverviewResponseSchema;
const readinessResponse = schemas.ExamReadinessResponseSchema;
const matchReport = schemas.MatchReportSchema;
const leakTracePayload = schemas.LeakTracePayloadSchema;
const eventQuery = schemas.EventsQuerySchema;

const json = (schema: z.ZodType) => ({ "application/json": { schema } });
const success = (description: string, schema: z.ZodType) => ({
  description,
  content: json(schema),
});
const error = {
  description: "Request failed",
  content: json(apiError),
};
const errorResponses = { "400": error, "401": error, "403": error, "404": error, "429": error };
const protectedOperation = { security: [{ [cookieAuth.name]: [] }] };
const idParams = z.object({ id: z.string().regex(/^\d+$/) });
const traceIdParams = z.object({ id: z.string().min(1).max(128) });
const addressParams = z.object({ address: schemas.ChecksummedAddressSchema });
const batchIdParams = z.object({ id: z.string().regex(/^\d+$/), batchId: z.string().min(1) });
const resultSchema = z.object({
  id: z.string(),
  examId: z.string(),
  auditor: schemas.ChecksummedAddressSchema,
  evidenceHash: schemas.HashSchema,
  resultJson: matchReport,
  createdAt: z.string().datetime(),
});
const batchUpload = z.object({
  file: z.string().meta({ format: "binary" }),
  sectionId: z.string().regex(/^\d+$/),
  questionCount: z.string().regex(/^\d+$/),
});
const sharePayload = z.union([
  z.array(z.object({ holder: schemas.ChecksummedAddressSchema, envelope: z.string().min(1) })),
  z.object({ shares: z.array(z.object({ holder: schemas.ChecksummedAddressSchema, envelope: z.string().min(1) })) }),
]);

registry.registerPath({
  method: "get",
  path: "/api/health",
  tags: ["health"],
  summary: "Check API and chain liveness",
  responses: {
    "200": success("API health and indexed chain connection", z.object({
      status: z.literal("ok"),
      timestamp: z.string().datetime(),
      chain: z.object({
        connected: z.boolean(),
        chainId: z.number().int(),
        contractAddress: schemas.AddressSchema,
        latestBlock: z.number().int(),
      }),
    })),
    "503": error,
  },
});
registry.registerPath({
  method: "get",
  path: "/api/auth/nonce",
  tags: ["auth"],
  summary: "Create a SIWE nonce",
  responses: { "200": success("Nonce and session cookie", schemas.NonceResponseSchema), "429": error },
});
registry.registerPath({
  method: "post",
  path: "/api/auth/verify",
  tags: ["auth"],
  summary: "Verify a SIWE message and establish a session",
  request: { body: { required: true, content: json(authPayload) } },
  responses: { "200": success("Authenticated address and chain-derived roles", authResponse), ...errorResponses },
});
registry.registerPath({
  method: "get",
  path: "/api/auth/me",
  tags: ["auth"],
  summary: "Return the current session identity",
  ...protectedOperation,
  responses: { "200": success("Current authenticated identity", authResponse), ...errorResponses },
});
registry.registerPath({
  method: "post",
  path: "/api/auth/logout",
  tags: ["auth"],
  summary: "End the current session",
  ...protectedOperation,
  responses: { "200": success("Session ended", z.object({ success: z.literal(true) })), ...errorResponses },
});

const genericExamList = z.array(z.record(z.string(), z.unknown()));
registry.registerPath({
  method: "get",
  path: "/api/exams",
  tags: ["exams"],
  summary: "List public summaries or assigned exams",
  responses: { "200": success("Exam records", genericExamList), "400": error },
});
registry.registerPath({
  method: "get",
  path: "/api/exams/{id}",
  tags: ["exams"],
  summary: "Get an exam",
  request: { params: idParams },
  responses: { "200": success("Exam record", z.record(z.string(), z.unknown())), ...errorResponses },
});
registry.registerPath({
  method: "post",
  path: "/api/exams/{id}/meta",
  tags: ["exams"],
  summary: "Store validated exam metadata",
  ...protectedOperation,
  request: { params: idParams, body: { required: true, content: json(schemas.ExamMetaSchema) } },
  responses: { "200": success("Metadata stored", z.record(z.string(), z.unknown())), ...errorResponses },
});
registry.registerPath({
  method: "post",
  path: "/api/exams/{id}/batches",
  tags: ["exams"],
  summary: "Upload ciphertext pending indexed chain confirmation",
  ...protectedOperation,
  request: { params: idParams, body: { required: true, content: { "multipart/form-data": { schema: batchUpload } } } },
  responses: { "201": success("Pending batch", z.record(z.string(), z.unknown())), ...errorResponses, "413": error, "415": error },
});
registry.registerPath({
  method: "get",
  path: "/api/exams/{id}/batches",
  tags: ["exams"],
  summary: "List confirmed batches visible to the current participant",
  ...protectedOperation,
  request: { params: idParams },
  responses: { "200": success("Confirmed batch records with download URLs", genericExamList), ...errorResponses },
});
registry.registerPath({
  method: "get",
  path: "/api/exams/{id}/batches/{batchId}/download",
  tags: ["exams"],
  summary: "Download hash-verified ciphertext",
  ...protectedOperation,
  request: { params: batchIdParams },
  responses: {
    "200": { description: "Verified ciphertext blob", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } },
    ...errorResponses,
  },
});
registry.registerPath({
  method: "get",
  path: "/api/exams/{id}/shares/me",
  tags: ["exams"],
  summary: "Retrieve the current holder's encrypted share",
  ...protectedOperation,
  request: { params: idParams },
  responses: { "200": success("Holder's own encrypted envelope", z.object({ examId: z.string(), holder: schemas.AddressSchema, envelope: z.string() })), ...errorResponses },
});
registry.registerPath({
  method: "put",
  path: "/api/exams/{id}/shares",
  tags: ["exams"],
  summary: "Store encrypted envelopes for assigned holders",
  ...protectedOperation,
  request: { params: idParams, body: { required: true, content: json(sharePayload) } },
  responses: { "200": success("Stored share count", z.object({ examId: z.string(), storedCount: z.number().int() })), ...errorResponses },
});

registry.registerPath({
  method: "get",
  path: "/api/events",
  tags: ["events"],
  summary: "Query indexed chain events",
  request: { query: eventQuery },
  responses: { "200": success("Stable, cursor-paginated event page", eventsResponse), ...errorResponses },
});
registry.registerPath({
  method: "get",
  path: "/api/stats/overview",
  tags: ["stats"],
  summary: "Get indexed dashboard totals",
  ...protectedOperation,
  responses: { "200": success("Overview statistics", overviewResponse), ...errorResponses },
});
registry.registerPath({
  method: "get",
  path: "/api/stats/exams/{id}/readiness",
  tags: ["stats"],
  summary: "Get indexed participant readiness for an exam",
  ...protectedOperation,
  request: { params: idParams },
  responses: { "200": success("Readiness derived from indexed chain data", readinessResponse), ...errorResponses },
});
registry.registerPath({
  method: "post",
  path: "/api/audit/traces",
  tags: ["audit"],
  summary: "Store a validated auditor leak trace",
  ...protectedOperation,
  request: { body: { required: true, content: json(leakTracePayload) } },
  responses: { "201": success("Stored leak trace", resultSchema), ...errorResponses },
});
registry.registerPath({
  method: "get",
  path: "/api/audit/traces/{id}",
  tags: ["audit"],
  summary: "Read an auditor-owned leak trace",
  ...protectedOperation,
  request: { params: traceIdParams },
  responses: { "200": success("Leak trace", resultSchema), ...errorResponses },
});
registry.registerPath({
  method: "post",
  path: "/api/profiles",
  tags: ["profiles"],
  summary: "Update the authenticated participant's profile",
  ...protectedOperation,
  request: { body: { required: true, content: json(profilePayload) } },
  responses: { "200": success("Updated participant profile", profileResponse), ...errorResponses },
});
registry.registerPath({
  method: "get",
  path: "/api/profiles/{address}",
  tags: ["profiles"],
  summary: "Get a participant profile",
  ...protectedOperation,
  request: { params: addressParams },
  responses: { "200": success("Participant profile", profileResponse), ...errorResponses },
});

const document = new OpenApiGeneratorV31(registry.definitions).generateDocument({
  openapi: "3.1.0",
  info: {
    title: "SIGIL Backend API",
    version: "1.0.0",
    description: "Backend API generated from the shared @sigil/core Zod schemas. Interface changes after Gate 1 require an approved ICR.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "auth" },
    { name: "health" },
    { name: "exams" },
    { name: "events" },
    { name: "stats" },
    { name: "audit" },
    { name: "profiles" },
  ],
});

const outputPath = fileURLToPath(new URL("../../docs/api/openapi.json", import.meta.url));
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
await mkdir(fileURLToPath(new URL("../../frontend/src/api/", import.meta.url)), { recursive: true });
