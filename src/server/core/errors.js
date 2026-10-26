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
    VERSION_CONFLICT: "きろくがかわったよ。よみなおそう",
    REQUEST_ID_CONFLICT: "つうしんをかくにんしてね",
    OP_LIMIT: "きょうのデモはここまで。大人をよんでね",
    CHARACTER_NOT_OWNED: "そのなかまはまだいないよ",
    SKILL_NOT_AVAILABLE: "このスキルはつかえないよ",
    ALL_OWNED: "みんなそろったよ",
    LEGACY_DATA_READ_ONLY: "このきろくは大人といっしょにかくにんしてね",
    DATASET_MISMATCH: "きろくのばしょがかわったよ。大人をよんでね",
    FORBIDDEN: "管理者として確認できません",
    AI_DISABLED: "事前生成は無効です。採用済みの文は使えます",
    AI_UNAVAILABLE: "生成できませんでした。採用済みの文は保持しています",
    AI_LIMIT: "生成の上限または当日停止に達しました",
    GENERATION_UNKNOWN: "生成結果は未確定です。同じ要求を確認してください",
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
