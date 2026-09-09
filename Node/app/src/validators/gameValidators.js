import { z } from "zod";
import {
  BASE_POINT_TOTAL,
  EQUIPPED_SPELL_LIMIT,
  PRESET_ACCENTS,
  PRESET_EMBLEMS,
} from "../domain/constants.js";

const emblemKeys = PRESET_EMBLEMS.map((emblem) => emblem.key);
const accentKeys = PRESET_ACCENTS.map((accent) => accent.key);

const point = z
  .number({ message: "Points must be whole numbers" })
  .int("Points must be whole numbers")
  .min(0, "Points cannot be negative")
  .max(BASE_POINT_TOTAL, `No stat can hold more than ${BASE_POINT_TOTAL} base points`);

export const allocationSchema = z
  .looseObject({
    strength: point,
    dexterity: point,
    intelligence: point,
  })
  .superRefine((value, ctx) => {
    if ("wisdom" in value) {
      ctx.addIssue({
        code: "custom",
        path: ["wisdom"],
        message: "Wisdom is earned by writing a reflection and cannot be allocated",
      });
    }

    const unexpected = Object.keys(value).filter(
      (key) => !["strength", "dexterity", "intelligence", "wisdom"].includes(key),
    );
    if (unexpected.length) {
      ctx.addIssue({ code: "custom", message: "Only Strength, Dexterity and Intelligence can be allocated" });
    }

    if (value.strength + value.dexterity + value.intelligence !== BASE_POINT_TOTAL) {
      ctx.addIssue({
        code: "custom",
        message: `Spend exactly ${BASE_POINT_TOTAL} points across Strength, Dexterity and Intelligence`,
      });
    }
  })
  .transform((value) => ({
    strength: value.strength,
    dexterity: value.dexterity,
    intelligence: value.intelligence,
  }));

export const profilePresentationSchema = z
  .object({
    emblemKey: z.enum(emblemKeys, { message: "Choose one of the available emblems" }).optional(),
    accentKey: z.enum(accentKeys, { message: "Choose one of the available accents" }).optional(),
    shareTodayGoals: z.boolean({ message: "Sharing must be on or off" }).optional(),
    shareTodayBibleReflection: z.boolean({ message: "Sharing must be on or off" }).optional(),
  })
  .strict("That profile field cannot be changed")
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" });

export const spellKeySchema = z
  .string()
  .trim()
  .min(1, "Choose a spell")
  .max(64, "Unknown spell");

export const loadoutSchema = z
  .object({
    spellKeys: z
      .array(z.string().trim().min(1, "Choose a spell").max(64, "Unknown spell"), {
        message: "Choose which spells to carry",
      })
      .max(EQUIPPED_SPELL_LIMIT, `You can carry ${EQUIPPED_SPELL_LIMIT} spells into a battle`),
  })
  .strict("That field cannot be changed");
