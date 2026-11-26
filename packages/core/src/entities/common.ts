import { z } from "zod";
import { ELEMENTS } from "../elements.js";

export const IdSchema = z.uuid();
export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, "lower-case hex sha256");
export const NonEmptyString = z.string().min(1);
export const ActorKindSchema = z.enum(["session", "token"]);
export const ElementSchema = z.enum(ELEMENTS);
export const CountryCodeSchema = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2");
export const PackRefSchema = z.object({ id: NonEmptyString, version: NonEmptyString }).readonly();
