// Private Drive checks adapted from ai-photo-diary/services/photo/drive-store.js.
function isPrivateOwned_(item) {
  const owner = item.getOwner(),
    account = Session.getEffectiveUser().getEmail();
  return Boolean(
    account &&
      owner &&
      owner.getEmail() === account &&
      !item.isTrashed() &&
      item.getSharingAccess() === DriveApp.Access.PRIVATE &&
      item.getEditors().length === 0 &&
      item.getViewers().length === 0,
  );
}
function imageFolder_() {
  const folder = DriveApp.getFolderById(assetSettings_().folderId);
  if (!isPrivateOwned_(folder)) throw new AppError_("ASSET_UNAVAILABLE");
  return folder;
}
function privateImageFile_(fileId) {
  const folder = imageFolder_(),
    file = DriveApp.getFileById(fileId),
    parents = file.getParents();
  let inside = false;
  while (parents.hasNext())
    if (parents.next().getId() === folder.getId()) inside = true;
  if (!inside || !isPrivateOwned_(file))
    throw new AppError_("ASSET_UNAVAILABLE");
  return file;
}

// RIFF chunk parsing: static WebP only. Validate actual VP8/VP8L dimensions.
function validateWebp_(bytes, mimeType) {
  const fail = () => {
    throw new AppError_("ASSET_UNAVAILABLE");
  };
  if (mimeType !== "image/webp" || bytes.length < 20 || bytes.length > 102400)
    fail();
  const b = bytes.map((value) => value & 255);
  const text = (i, n) => String.fromCharCode(...b.slice(i, i + n));
  const le = (i, n) =>
    b.slice(i, i + n).reduce((sum, value, j) => sum + value * 2 ** (8 * j), 0);
  if (
    text(0, 4) !== "RIFF" ||
    text(8, 4) !== "WEBP" ||
    le(4, 4) + 8 !== b.length
  )
    fail();
  let dimension = null,
    canvas = null,
    position = 12;
  while (position + 8 <= b.length) {
    const kind = text(position, 4),
      size = le(position + 4, 4),
      data = position + 8,
      end = data + size;
    if (end > b.length || kind === "ANIM" || kind === "ANMF") fail();
    if (kind === "VP8X") {
      if (size !== 10 || canvas || b[data] & 2) fail();
      canvas = { width: le(data + 4, 3) + 1, height: le(data + 7, 3) + 1 };
    }
    if (kind === "VP8 " || kind === "VP8L") {
      if (dimension) fail();
      if (kind === "VP8 ") {
        if (
          size < 10 ||
          b[data] & 1 ||
          b.slice(data + 3, data + 6).join() !== "157,1,42"
        )
          fail();
        dimension = {
          width: le(data + 6, 2) & 16383,
          height: le(data + 8, 2) & 16383,
        };
      } else {
        if (size < 5 || b[data] !== 47 || b[data + 4] >> 5 !== 0) fail();
        const packed = le(data + 1, 4);
        dimension = {
          width: (packed & 16383) + 1,
          height: ((packed >>> 14) & 16383) + 1,
        };
      }
    }
    position = end + (size % 2);
  }
  if (
    position !== b.length ||
    !dimension ||
    dimension.width < 1 ||
    dimension.height < 1 ||
    dimension.width > 512 ||
    dimension.height > 512 ||
    (canvas &&
      (canvas.width !== dimension.width || canvas.height !== dimension.height))
  )
    fail();
  return dimension;
}

function readAsset_(assetId) {
  try {
    const { tables } = initialSnapshot_();
    const row = tables.Assets.find((item) => item.assetId === assetId);
    if (!row || row.status !== "READY" || row.version < 1)
      throw new AppError_("ASSET_UNAVAILABLE");
    const file = privateImageFile_(row.webpFileId);
    if (file.getSize() !== row.byteSize)
      throw new AppError_("ASSET_UNAVAILABLE");
    const bytes = file.getBlob().getBytes();
    validateWebp_(bytes, file.getMimeType());
    if (row.mimeType !== "image/webp" || bytes.length !== row.byteSize)
      throw new AppError_("ASSET_UNAVAILABLE");
    return {
      data: {
        assetId,
        version: row.version,
        mimeType: "image/webp",
        base64: Utilities.base64Encode(bytes),
      },
    };
  } catch (_) {
    throw new AppError_("ASSET_UNAVAILABLE");
  }
}
