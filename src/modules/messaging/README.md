# Messaging (schema only — not implemented in v1)

The `Conversation` and `Message` models exist in `prisma/schema.prisma` so the
data model can support customer ↔ seller messaging without a redesign later.

Per the backend design (scope §0), **no module, controller, service or
endpoint** is built in v1. Do not add messaging endpoints without an approved
design change. When messaging is scheduled, implement it as a NestJS module
here, create `NEW_MESSAGE` notifications through the notifications service, and
add an SSE/WebSocket gateway.
