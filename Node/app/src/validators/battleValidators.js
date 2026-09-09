import { z } from "zod";
import { ACTIONS } from "../domain/combat.js";

export const battleActionSchema = z
  .object({
    type: z.enum(
      [ACTIONS.ATTACK, ACTIONS.DEFEND, ACTIONS.BREAK, ACTIONS.SURGE, ACTIONS.CAST, ACTIONS.FORFEIT],
      { message: "Choose a valid action" },
    ),
    spellKey: z.string().trim().min(1).max(64).optional(),
    expectedVersion: z
      .number({ message: "The battle version is required" })
      .int("The battle version must be a whole number")
      .min(0),
    idempotencyKey: z
      .string({ message: "An idempotency key is required" })
      .trim()
      .min(8, "An idempotency key is required")
      .max(100),
  })
  .refine((value) => value.type !== ACTIONS.CAST || Boolean(value.spellKey), {
    message: "Choose which spell to cast",
    path: ["spellKey"],
  });

export const forfeitSchema = z.object({
  idempotencyKey: z.string().trim().min(8, "An idempotency key is required").max(100),
});
