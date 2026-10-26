import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { createHash, randomUUID } from "node:crypto";
import { ROOT, walkFiles } from "../../scripts/files.mjs";

// Extracted pattern from photo-diary + english-trainer: one GAS-like VM global,
// PropertiesService backed by a Map, JSON transport, sorted source enumeration.
// No spreadsheet/Drive mocks are carried over before those adapters exist.
export function createGas({
  properties = {},
  services,
  source = join(ROOT, "src"),
} = {}) {
  const props = new Map(Object.entries(properties));
  const logs = [];
  const context = vm.createContext({
    console: {
      error: (...args) => logs.push(args),
      log: (...args) => logs.push(args),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => props.get(key) ?? null,
      }),
    },
    Utilities: {
      getUuid: randomUUID,
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (algorithm, text, encoding) => [
        ...createHash(algorithm).update(text, encoding).digest(),
      ],
      newBlob: (text) => ({ getBytes: () => [...Buffer.from(text, "utf8")] }),
    },
  });
  const read = (name) => readFileSync(join(source, `${name}.html`), "utf8");
  function output(html) {
    return {
      getContent: () => html,
      setTitle(title) {
        html = html.replace("</head>", `<title>${title}</title></head>`);
        return this;
      },
      addMetaTag(name, content) {
        html = html.replace(
          "</head>",
          `<meta name="${name}" content="${content}"></head>`,
        );
        return this;
      },
    };
  }
  context.HtmlService = {
    createHtmlOutputFromFile: (name) => output(read(name)),
    createTemplateFromFile: (name) => ({
      evaluate() {
        const configJson = JSON.stringify(this.config);
        const html = read(name)
          .replace(/<\?!=\s*include_\("([^"]+)"\)\s*\?>/g, (_, include) =>
            context.include_(include),
          )
          .replace(/<\?!=\s*serializeForScript_\(config\)\s*\?>/g, () =>
            vm.runInContext(`serializeForScript_(${configJson})`, context),
          );
        return output(html);
      },
    }),
  };
  for (const file of walkFiles(join(source, "server")).filter((name) =>
    name.endsWith(".js"),
  )) {
    vm.runInContext(
      readFileSync(join(source, "server", file), "utf8"),
      context,
      { filename: file },
    );
  }
  if (services) context.createServices_ = () => services;
  return {
    props,
    logs,
    context,
    run: (code) => vm.runInContext(code, context),
    call: (request) =>
      JSON.parse(
        JSON.stringify(context.api(JSON.parse(JSON.stringify(request)))),
      ),
    render: () => context.doGet().getContent(),
  };
}
