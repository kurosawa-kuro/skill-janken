// Adapted from the source apps. Public text comes only from this catalog.
class AppError_ extends Error {
  constructor(code, retryable = false) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

function publicError_(error) {
  const messages = {
    INVALID_ARGUMENT: "えらびなおしてね",
    BUSY: "ちょっとまって、もういちど",
    ASSET_UNAVAILABLE: "えのよみこみにしっぱいしたよ",
    DATA_INTEGRITY_ERROR: "きろくをかくにんしています。大人をよんでね",
    INTERNAL_ERROR: "つうしんをかくにんして、もういちど",
  };
  const known =
    error instanceof AppError_ &&
    Object.prototype.hasOwnProperty.call(messages, error.code);
  return {
    code: known ? error.code : "INTERNAL_ERROR",
    message: messages[known ? error.code : "INTERNAL_ERROR"],
    retryable: known ? error.retryable : true,
    details: {},
  };
}
