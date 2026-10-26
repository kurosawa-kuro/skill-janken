import { createGas } from "./gas.mjs";

// Minimal Sheets test double, adapted from photo-diary's cell/range mock.
// Keeps native numeric/boolean types and exposes partial-row corruption.
export function createSheetGas() {
  const gas = createGas({
    properties: { JANKEN_SPREADSHEET_ID: "test-sheet" },
  });
  const initial = JSON.parse(JSON.stringify(gas.run("initialTables_()")));
  const definitions = JSON.parse(
    JSON.stringify(gas.run("tableDefinitions_()")),
  );
  const sheets = new Map();
  function sheet(name, rows) {
    return {
      name,
      rows,
      getDataRange() {
        return { getValues: () => structuredClone(this.rows) };
      },
      getRange(r, c, height, width) {
        const self = this;
        return {
          getValues: () =>
            Array.from({ length: height }, (_, y) =>
              Array.from(
                { length: width },
                (_, x) => self.rows[r - 1 + y]?.[c - 1 + x] ?? "",
              ),
            ),
          setValues(values) {
            values.forEach((row, y) =>
              row.forEach((value, x) => {
                self.rows[r - 1 + y] ??= [];
                self.rows[r - 1 + y][c - 1 + x] = value;
              }),
            );
            return this;
          },
          setFontWeight() {
            return this;
          },
        };
      },
      setFrozenRows() {},
      setName(next) {
        sheets.delete(this.name);
        this.name = next;
        sheets.set(next, this);
        return this;
      },
    };
  }
  for (const name of Object.keys(definitions))
    sheets.set(name, sheet(name, [definitions[name], ...initial[name]]));
  const book = {
    getId: () => "test-sheet",
    getSheetByName: (name) => sheets.get(name),
    getSheets: () => [...sheets.values()],
    insertSheet(name) {
      const next = sheet(name, []);
      sheets.set(name, next);
      return next;
    },
    setSpreadsheetTimeZone() {},
  };
  const lock = { held: false, fail: false, releases: 0, flushes: 0 };
  gas.context.SpreadsheetApp = {
    openById(id) {
      if (id !== "test-sheet") throw Error("private bad id");
      return book;
    },
    create() {
      sheets.clear();
      sheets.set("Sheet1", sheet("Sheet1", []));
      return book;
    },
    flush() {
      lock.flushes++;
    },
  };
  gas.context.PropertiesService.getScriptProperties = () => ({
    getProperty: (name) => gas.props.get(name) ?? null,
    setProperty: (name, value) => gas.props.set(name, value),
  });
  gas.context.LockService = {
    getScriptLock: () => ({
      tryLock: () => {
        if (lock.fail) return false;
        lock.held = true;
        return true;
      },
      releaseLock: () => {
        lock.held = false;
        lock.releases++;
      },
    }),
  };
  gas.context.imageFolder_ = () => ({});
  gas.context.isPrivateOwned_ = () => true;
  gas.context.DriveApp = { getFileById: () => ({}) };
  return { ...gas, sheets, book, lock };
}
