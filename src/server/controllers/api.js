function api(request) {
  return handleApi_(request, createServices_);
}

// Services return {data, version?, replayed?}; do not discard envelope metadata.
function handleApi_(request, factory) {
  let requestId = null;
  try {
    if (request && isUuid_(request.requestId)) requestId = request.requestId;
    const mutation = validateRequest_(request);
    if (!mutation) requestId = null;
    const result = factory()[request.op](request.payload, request);
    if (!result || !result.data || typeof result.data !== "object")
      throw new AppError_("INTERNAL_ERROR");
    const response = {
      ok: true,
      requestId,
      replayed: mutation && result.replayed === true,
      data: result.data,
    };
    {
      if (
        !Number.isSafeInteger(result.version) ||
        result.version < 0 ||
        !result.data
      ) {
        throw new AppError_("INTERNAL_ERROR");
      }
      response.version = result.version;
    }
    return response;
  } catch (error) {
    // Raw exception text/stack can contain provider tokens and connection IDs.
    return { ok: false, requestId, error: publicError_(error) };
  }
}
