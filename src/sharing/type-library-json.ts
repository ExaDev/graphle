/**
 * JSON serialisation for a {@link TypeLibraryDocument}, mirroring `./json`'s
 * handling of {@link GraphDocument}. A type library is always graphle's own
 * current shape — there is no migration chain and no JSON Canvas-style
 * alternate-shape detection to run, so decoding is a direct schema parse.
 */
import { TypeLibraryDocument } from "../schema";

/** Serialise a type library to a pretty JSON string. */
export function serialiseTypeLibrary(doc: TypeLibraryDocument): string {
  return JSON.stringify(doc, null, 2);
}

/** Validate a parsed JSON value as a type library document. */
export function decodeTypeLibraryFromJson(json: unknown): TypeLibraryDocument {
  return TypeLibraryDocument.parse(json);
}
