export function toSafeTelegramError(error) {
  return {
    message: error?.message,
    code: error?.code,
    statusCode: error?.response?.statusCode,
    description: error?.response?.body?.description,
  };
}
