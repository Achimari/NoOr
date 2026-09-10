export const ANSWER_YES = "YES";
export const ANSWER_NO = "NO";
export const ANSWER_NO_DATA = "NO_DATA";

export const USER_ANSWERS = [ANSWER_YES, ANSWER_NO];
export const ACTIVITY_ANSWERS = [ANSWER_YES, ANSWER_NO, ANSWER_NO_DATA];

export function isNoDataAnswer(answer) {
  return answer === ANSWER_NO_DATA;
}

export function isUserAnswer(answer) {
  return USER_ANSWERS.includes(answer);
}

export function normalizeAnswer(answer) {
  return ACTIVITY_ANSWERS.includes(answer) ? answer : ANSWER_NO;
}

export function withoutNoData(rows) {
  return (rows || []).filter((row) => !isNoDataAnswer(row?.answer));
}
