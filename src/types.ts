/** The request envelope — same shape all cantrip clients use. */
export interface CantripRequest {
  command: string;
  args: string[];
  flags: Record<string, string>;
}

/** The daemon returns either a JSON value or an error object. */
export type CantripResponse =
  | { error: string }
  | Record<string, unknown>;
