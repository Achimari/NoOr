import { z } from "zod";
import {
  MAX_READING_PASSAGES,
  MAX_REFLECTION_LENGTH,
  findBibleBook,
  getChapterVerseCount,
} from "../data/bible.js";
import { dateKeySchema } from "./dateKeyValidators.js";

const verseNumber = z.coerce.number().int().min(1).max(200);

const passageSchema = z.object({
  book: z.string().trim().min(1, "Choose a book"),
  chapter: z.coerce.number().int().min(1, "Choose a chapter").max(150),
  startVerse: verseNumber,
  endVerse: verseNumber,
});

function refinePassage(passage, ctx, index) {
  const book = findBibleBook(passage.book);
  if (!book) {
    ctx.addIssue({
      code: "custom",
      path: ["passages", index, "book"],
      message: `Passage ${index + 1}: choose a valid book`,
    });
    return null;
  }

  const chapterVerses = getChapterVerseCount(book, passage.chapter);
  if (!chapterVerses) {
    ctx.addIssue({
      code: "custom",
      path: ["passages", index, "chapter"],
      message: `Passage ${index + 1}: ${book.name} has no chapter ${passage.chapter}`,
    });
    return null;
  }

  if (passage.startVerse > chapterVerses || passage.endVerse > chapterVerses) {
    ctx.addIssue({
      code: "custom",
      path: ["passages", index, "endVerse"],
      message: `Passage ${index + 1}: ${book.name} ${passage.chapter} has ${chapterVerses} verses`,
    });
    return null;
  }

  if (passage.endVerse < passage.startVerse) {
    ctx.addIssue({
      code: "custom",
      path: ["passages", index, "endVerse"],
      message: `Passage ${index + 1}: the last verse cannot come before the first verse`,
    });
    return null;
  }

  return {
    bookCode: book.code,
    chapter: passage.chapter,
    startVerse: passage.startVerse,
    endVerse: passage.endVerse,
  };
}

const readingCheckInShape = {
  answer: z.enum(["YES", "NO"], { message: "Choose yes or no" }),
  passages: z.array(passageSchema).max(MAX_READING_PASSAGES, `Add up to ${MAX_READING_PASSAGES} passages`).default([]),
  reflection: z.string().max(MAX_REFLECTION_LENGTH, `Keep the note under ${MAX_REFLECTION_LENGTH} characters`).default(""),
};

function normalizeReadingCheckIn(value, ctx) {
  const reflection = value.reflection.trim();

  if (value.answer === "NO") {
    return { answer: "NO", passages: [], reflection: null };
  }

  if (!value.passages.length) {
    ctx.addIssue({
      code: "custom",
      path: ["passages"],
      message: "Add at least one passage you read",
    });
    return null;
  }

  const passages = value.passages
    .map((passage, index) => refinePassage(passage, ctx, index))
    .filter(Boolean)
    .map((passage, index) => ({ ...passage, position: index }));

  if (passages.length !== value.passages.length) {
    return null;
  }

  return { answer: "YES", passages, reflection: reflection || null };
}

export const readingCheckInSchema = z
  .object(readingCheckInShape)
  .transform((value, ctx) => normalizeReadingCheckIn(value, ctx) || z.NEVER);

export const historicalReadingCheckInSchema = z
  .object({ ...readingCheckInShape, dateKey: dateKeySchema })
  .transform((value, ctx) => {
    const normalized = normalizeReadingCheckIn(value, ctx);

    return normalized ? { dateKey: value.dateKey, ...normalized } : z.NEVER;
  });
