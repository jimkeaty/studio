/**
 * Firestore Timestamp, represented in a client-safe way.
 * API routes should serialize timestamps as ISO strings (recommended),
 * or as this {seconds,nanoseconds} shape.
 */
export type TimestampLike =
  | string
  | { seconds: number; nanoseconds: number };
