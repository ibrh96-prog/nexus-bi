import swaggerJSDoc from "swagger-jsdoc";

/**
 * OpenAPI 3.0 spec for the BI Automation API.
 * Route-level docs live in JSDoc @openapi blocks alongside their handlers.
 */
export const openApiSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "BI Automation API",
      version: "1.0.0",
      description:
        "Enterprise Business Intelligence & AI Workflow Automation backend. " +
        "All authenticated routes require a Bearer JWT.",
    },
    servers: [
      { url: "http://localhost:3001", description: "Local development" },
      { url: "https://api.example.com", description: "Production" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT issued by the auth service. Include as `Authorization: Bearer <token>`.",
        },
        webhookSignature: {
          type: "apiKey",
          in: "header",
          name: "X-Hub-Signature-256",
          description: "HMAC-SHA256 of the raw request body, signed with the integration secret.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string", example: "Validation failed" },
            issues: { type: "array", items: { type: "object" }, nullable: true },
          },
        },
        WorkflowNode: {
          type: "object",
          required: ["id", "type", "position"],
          properties: {
            id: { type: "string", example: "node_1" },
            type: { type: "string", enum: ["trigger", "action", "condition"], example: "action" },
            position: {
              type: "object",
              properties: { x: { type: "number" }, y: { type: "number" } },
            },
            data: { type: "object", additionalProperties: true },
          },
        },
        WorkflowEdge: {
          type: "object",
          required: ["id", "source", "target"],
          properties: {
            id: { type: "string", example: "edge_1" },
            source: { type: "string", example: "node_1" },
            target: { type: "string", example: "node_2" },
          },
        },
        Workflow: {
          type: "object",
          required: ["id", "name", "nodes", "edges"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "Lead scoring pipeline" },
            description: { type: "string", nullable: true },
            nodes: { type: "array", items: { $ref: "#/components/schemas/WorkflowNode" } },
            edges: { type: "array", items: { $ref: "#/components/schemas/WorkflowEdge" } },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        WorkflowInput: {
          type: "object",
          required: ["name", "nodes", "edges"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 200 },
            description: { type: "string", nullable: true },
            nodes: { type: "array", items: { $ref: "#/components/schemas/WorkflowNode" } },
            edges: { type: "array", items: { $ref: "#/components/schemas/WorkflowEdge" } },
          },
        },
        Metric: {
          type: "object",
          required: ["id", "name", "value", "recordedAt"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string", example: "monthly_revenue" },
            value: { type: "number", example: 128430.55 },
            unit: { type: "string", nullable: true, example: "USD" },
            dimensions: { type: "object", additionalProperties: true, nullable: true },
            recordedAt: { type: "string", format: "date-time" },
          },
        },
        MetricInput: {
          type: "object",
          required: ["name", "value"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 100 },
            value: { type: "number" },
            unit: { type: "string", nullable: true },
            dimensions: { type: "object", additionalProperties: true, nullable: true },
          },
        },
        WebhookResult: {
          type: "object",
          properties: {
            status: { type: "string", example: "dispatched" },
            runId: { type: "string", format: "uuid" },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: "Missing or invalid Bearer token",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: { error: "Unauthorized" },
            },
          },
        },
        BadRequest: {
          description: "Request failed validation",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: {
                error: "Validation failed",
                issues: [{ path: ["name"], message: "Required" }],
              },
            },
          },
        },
        ServerError: {
          description: "Unexpected server error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
              example: { error: "Internal Server Error" },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/workflows": {
        get: {
          tags: ["Workflows"],
          summary: "List workflows",
          responses: {
            "200": {
              description: "Array of workflows",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Workflow" } },
                  example: [
                    {
                      id: "8a1c9c7e-0f5d-4d6b-8c9a-3b2a1e6f0b11",
                      name: "Lead scoring pipeline",
                      description: "Score inbound leads via AI",
                      nodes: [{ id: "n1", type: "trigger", position: { x: 40, y: 40 }, data: {} }],
                      edges: [],
                      createdAt: "2026-06-01T10:12:00Z",
                      updatedAt: "2026-06-02T09:00:00Z",
                    },
                  ],
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
        post: {
          tags: ["Workflows"],
          summary: "Create workflow",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WorkflowInput" },
                example: {
                  name: "Lead scoring pipeline",
                  description: "Score inbound leads via AI",
                  nodes: [{ id: "n1", type: "trigger", position: { x: 40, y: 40 }, data: {} }],
                  edges: [],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Created workflow",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Workflow" } },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
      },
      "/api/workflows/{id}": {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        get: {
          tags: ["Workflows"],
          summary: "Get workflow by id",
          responses: {
            "200": {
              description: "Workflow",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Workflow" } },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
        put: {
          tags: ["Workflows"],
          summary: "Update workflow",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/WorkflowInput" } },
            },
          },
          responses: {
            "200": {
              description: "Updated workflow",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Workflow" } },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
        delete: {
          tags: ["Workflows"],
          summary: "Delete workflow",
          responses: {
            "200": {
              description: "Deleted",
              content: { "application/json": { example: { ok: true } } },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
      },
      "/api/metrics": {
        get: {
          tags: ["Metrics"],
          summary: "List metrics",
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
            },
          ],
          responses: {
            "200": {
              description: "Array of metrics",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/Metric" } },
                  example: [
                    {
                      id: "0e5f6bde-4b58-4a97-83f0-8f4c5f1e5a20",
                      name: "monthly_revenue",
                      value: 128430.55,
                      unit: "USD",
                      dimensions: { region: "NA" },
                      recordedAt: "2026-06-30T00:00:00Z",
                    },
                  ],
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
        post: {
          tags: ["Metrics"],
          summary: "Record a metric",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MetricInput" },
                example: { name: "monthly_revenue", value: 128430.55, unit: "USD" },
              },
            },
          },
          responses: {
            "200": {
              description: "Created metric",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Metric" } },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
      },
      "/api/webhooks/{workflowId}/{integrationSecret}": {
        post: {
          tags: ["Webhooks"],
          summary: "Receive an external webhook and trigger a workflow run",
          description:
            "Public endpoint verified via HMAC-SHA256 of the raw body using the integration secret. " +
            "Compatible with Stripe (`Stripe-Signature`) and GitHub (`X-Hub-Signature-256`).",
          security: [{ webhookSignature: [] }],
          parameters: [
            { name: "workflowId", in: "path", required: true, schema: { type: "string", format: "uuid" } },
            { name: "integrationSecret", in: "path", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
                example: { event: "invoice.paid", data: { id: "in_123", amount: 4900 } },
              },
            },
          },
          responses: {
            "200": {
              description: "Workflow run dispatched",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/WebhookResult" },
                  example: { status: "dispatched", runId: "b8c1..." },
                },
              },
            },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": {
              description: "Signature mismatch",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                  example: { error: "Invalid signature" },
                },
              },
            },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
      },
    },
  },
  // Also scan route files so future JSDoc @openapi blocks are picked up.
  apis: ["./server/routes/*.ts"],
});
