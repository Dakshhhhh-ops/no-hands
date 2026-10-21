/**
 * Labelled instructions for `npm run eval`. Each case names a starting model and
 * the structural change a correct interpretation makes. Where an instruction has
 * two fair readings, `anyOf` lists both. Labels were written before running any
 * interpreter against them.
 */

/** A component in the resulting model: an existing id, or a description of a new one. */
export type ComponentRef = string | { type?: string; name: RegExp };

export interface Expectation {
  addComponents?: Array<{ type: string; name: RegExp }>;
  removeComponents?: string[];
  addRelationships?: Array<{ from: ComponentRef; to: ComponentRef }>;
  removeRelationships?: Array<{ from: string; to: string }>;
  addRequirements?: RegExp[];
  /** The instruction is not an architecture change: nothing may change. */
  none?: boolean;
}

export interface EvalCase {
  id: string;
  language: 'English' | 'Hinglish';
  model: 'commerce' | 'food' | 'ride-share';
  text: string;
  expect: Expectation | { anyOf: Expectation[] };
}

const cacheInFront = (service: string, cache: ComponentRef = { type: 'CACHE', name: /./ }): { anyOf: Expectation[] } => ({
  anyOf: [
    { addRelationships: [{ from: service, to: cache }] },
    // Read literally, "in front of" puts the cache on the request path to the service.
    { addRelationships: [{ from: cache, to: service }] },
  ],
});

export const CASES: EvalCase[] = [
  // ride-share-platform, imported from public/samples/ride-share-compose.yml
  { id: 'R1', language: 'English', model: 'ride-share', text: 'Add a Redis cache in front of the trips API', expect: cacheInFront('trips-api', 'redis') },
  { id: 'R2', language: 'Hinglish', model: 'ride-share', text: 'trips api ke aage redis cache laga do', expect: cacheInFront('trips-api', 'redis') },
  { id: 'R3', language: 'English', model: 'ride-share', text: 'Connect the accounts API to Kafka', expect: { addRelationships: [{ from: 'accounts-api', to: 'kafka' }] } },
  { id: 'R4', language: 'Hinglish', model: 'ride-share', text: 'accounts api ko kafka se connect karo', expect: { addRelationships: [{ from: 'accounts-api', to: 'kafka' }] } },
  { id: 'R5', language: 'English', model: 'ride-share', text: 'Remove the pricing worker', expect: { removeComponents: ['pricing-worker'] } },
  { id: 'R6', language: 'Hinglish', model: 'ride-share', text: 'pricing worker ko hata do', expect: { removeComponents: ['pricing-worker'] } },
  {
    id: 'R7', language: 'English', model: 'ride-share', text: 'Add a payment service behind the gateway',
    expect: { addComponents: [{ type: 'SERVICE', name: /payment/i }], addRelationships: [{ from: 'gateway', to: { type: 'SERVICE', name: /payment/i } }] },
  },
  {
    id: 'R8', language: 'Hinglish', model: 'ride-share', text: 'payment service ko alag container mein daalo',
    expect: { addComponents: [{ type: 'SERVICE', name: /payment/i }], addRelationships: [{ from: 'gateway', to: { type: 'SERVICE', name: /payment/i } }] },
  },

  // Commerce Platform sample
  { id: 'C1', language: 'English', model: 'commerce', text: 'Remove the cache and read PostgreSQL directly', expect: { removeComponents: ['redis'] } },
  { id: 'C2', language: 'Hinglish', model: 'commerce', text: 'cache hata do aur database seedha use karo', expect: { removeComponents: ['redis'] } },
  {
    id: 'C3', language: 'English', model: 'commerce', text: 'Add a notification service that consumes order events from Kafka',
    expect: { addComponents: [{ type: 'SERVICE', name: /notif/i }], addRelationships: [{ from: 'kafka', to: { type: 'SERVICE', name: /notif/i } }] },
  },
  {
    id: 'C4', language: 'Hinglish', model: 'commerce', text: 'kafka se order events padhne ke liye ek notification service bana do',
    expect: { addComponents: [{ type: 'SERVICE', name: /notif/i }], addRelationships: [{ from: 'kafka', to: { type: 'SERVICE', name: /notif/i } }] },
  },
  { id: 'C5', language: 'English', model: 'commerce', text: 'Add rate limiting to the login endpoint', expect: { addRequirements: [/rate.?limit/i] } },
  { id: 'C6', language: 'Hinglish', model: 'commerce', text: 'login endpoint pe rate limiting laga do', expect: { addRequirements: [/rate.?limit/i] } },
  { id: 'C7', language: 'English', model: 'commerce', text: 'Delete the connection from the order service to Kafka', expect: { removeRelationships: [{ from: 'orders', to: 'kafka' }] } },
  { id: 'C8', language: 'Hinglish', model: 'commerce', text: 'order service aur kafka ke beech ka connection hata do', expect: { removeRelationships: [{ from: 'orders', to: 'kafka' }] } },
  { id: 'C9', language: 'English', model: 'commerce', text: 'Make the diagram look nicer', expect: { none: true } },
  { id: 'C10', language: 'Hinglish', model: 'commerce', text: 'diagram ko thoda sundar bana do', expect: { none: true } },

  // Food Delivery sample
  { id: 'F1', language: 'English', model: 'food', text: 'Connect the courier service to Redis', expect: { addRelationships: [{ from: 'couriers', to: 'redis' }] } },
  { id: 'F2', language: 'Hinglish', model: 'food', text: 'courier service ko redis se connect karo', expect: { addRelationships: [{ from: 'couriers', to: 'redis' }] } },
  { id: 'F3', language: 'English', model: 'food', text: 'Put a cache in front of the restaurant service', expect: cacheInFront('catalog') },
  { id: 'F4', language: 'Hinglish', model: 'food', text: 'restaurant service ke aage cache laga do', expect: cacheInFront('catalog') },
];
