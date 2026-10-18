// Fixed IDs for the local demo seed (`npm run seed:local`). They must be valid
// RFC 9562 UUIDs (here v4): the public page validates them with Zod's
// `z.string().uuid()`, which rejects version nibble 0, as in the former
// `10000000-0000-0000-0000-000000000001`.
export const DEMO_BUSINESS_ID = "10000000-0000-4000-8000-000000000001";
export const DEMO_SERVICE_IDS = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
];
