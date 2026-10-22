/** One step of the guided demo: something to say, or the code check. */
export interface GuidedStep {
  language?: string;
  say: string;
  changes: string;
  drift?: boolean;
}

// The guided demo on the example ride-share stack. Each step works without a model key.
export const GUIDED_STEPS: GuidedStep[] = [
  { language: 'English', say: 'Add a Redis cache in front of the trips API', changes: 'trips-api gets a connection to Redis. You see the exact diff before anything applies.' },
  { language: 'Hinglish', say: 'payment service ko alag container mein daalo aur gateway se connect karo', changes: 'A new payment-service appears behind the gateway, drawn dashed because it is planned and not in code yet.' },
  { drift: true, say: 'Check the diagram against the next docker-compose file', changes: 'The newer file adds two services, retires one, and upgrades PostgreSQL. Your planned Payment Service is kept, not deleted.' },
];
