import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createGas } from "../tests/helpers/gas.mjs";
import { bootstrapResult } from "../tests/helpers/fixtures.mjs";

// Local development only: no real service, credentials, or public endpoint.
export async function startPreview(port = 4173) {
  const gas = createGas({ services: { bootstrap: bootstrapResult } });
  const html = gas.render().replace(
    "<body>",
    `<body>
    <aside style="padding:8px;text-align:center;background:#fff0cb">ローカルプレビュー・テストデータ</aside>
    <script>
      window.google = {script:{run:{
        withSuccessHandler(fn) {this.success=fn;return this;},
        withFailureHandler(fn) {this.failure=fn;return this;},
        api(request) {const success=this.success,failure=this.failure;
          fetch('/__test_api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})
            .then(r=>{if(!r.ok)throw Error('preview');return r.json();}).then(success,failure);}
      }}};
    </script>`,
  );
  const server = createServer(async (request, response) => {
    // Do not expose the preview as a proxy; it accepts only same-host test calls.
    const host = `127.0.0.1:${server.address().port}`;
    if (
      request.headers.host !== host ||
      (request.headers.origin && request.headers.origin !== `http://${host}`)
    ) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    if (request.method === "GET" && request.url === "/") {
      response
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(html);
      return;
    }
    if (request.method === "POST" && request.url === "/__test_api") {
      let body = "";
      try {
        for await (const chunk of request) {
          body += chunk;
          if (Buffer.byteLength(body) > 4096) {
            response.writeHead(413).end();
            return;
          }
        }
        const result = gas.call(JSON.parse(body));
        response
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify(result));
      } catch {
        response.writeHead(400).end();
      }
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { url } = await startPreview();
  console.log(`Mock-only preview: ${url} (Ctrl+C to stop)`);
}
