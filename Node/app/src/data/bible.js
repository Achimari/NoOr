import { readFileSync } from "node:fs";

const { books } = JSON.parse(readFileSync(new URL("./bibleBooks.json", import.meta.url), "utf8"));

export const MAX_READING_PASSAGES = 20;
export const MAX_REFLECTION_LENGTH = 2000;

const booksByCode = new Map(books.map((book) => [book.code, book]));
const booksByName = new Map(books.map((book) => [book.name.toLowerCase(), book]));

export function getBibleBooks() {
  return books;
}

export function findBibleBook(book) {
  const value = String(book ?? "").trim();
  if (!value) return null;

  return booksByCode.get(value.toUpperCase()) || booksByName.get(value.toLowerCase()) || null;
}

export function getChapterVerseCount(book, chapter) {
  return book?.chapters?.[chapter - 1] || 0;
}

export function formatPassageReference({ bookName, chapter, startVerse, endVerse }) {
  const verses = startVerse === endVerse ? `${startVerse}` : `${startVerse}–${endVerse}`;

  return `${bookName} ${chapter}:${verses}`;
}

export function normalizeStoredPassage(passage) {
  const book = booksByCode.get(passage.bookCode);
  const bookName = book?.name || passage.bookCode;

  return {
    book: passage.bookCode,
    bookName,
    chapter: passage.chapter,
    startVerse: passage.startVerse,
    endVerse: passage.endVerse,
    reference: formatPassageReference({
      bookName,
      chapter: passage.chapter,
      startVerse: passage.startVerse,
      endVerse: passage.endVerse,
    }),
  };
}
