export class AuthError extends Error {}
/** A step was refused because the evidence behind it is not strong enough (e.g. sandbox data outside demo mode). */
export class EvidenceError extends Error {}
export { TransitionError } from "./transitions";
