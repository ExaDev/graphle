/**
 * Single source of truth for every data shape in the application. Domain,
 * sharing, storage, and UI layers derive their types from these schemas
 * rather than defining parallel ones.
 */
export * from "./built-in-edge-types";
export * from "./built-in-types";
export * from "./edge";
export * from "./edge-type";
export * from "./graph";
export * from "./migration";
export * from "./node";
export * from "./node-type";
export * from "./primitives";
export * from "./remote-source";
export * from "./revision";
export * from "./storage";
export * from "./type-builder";
export * from "./type-registry";
