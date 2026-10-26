import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { createSheetGas } from "../tests/helpers/sheets.mjs";

// Local development only: no real service, credentials, or public endpoint.
export async function startPreview(port = 4173) {
  const gas = createSheetGas();
  gas.props.set("JANKEN_ADMIN_EMAIL", "owner@example.com");
  const html = (admin) =>
    gas.render({ parameter: { view: admin ? "admin" : "" } }).replace(
      /<body([^>]*)>/,
      `<body$1>
    <aside style="padding:8px;text-align:center;background:#fff0cb">ローカルプレビュー・テストデータ</aside>
    <script>
      window.google = {script:{run:{
        withSuccessHandler(fn) {this.success=fn;return this;},
        withFailureHandler(fn) {this.failure=fn;return this;},
        api(request) {return this.send('/__test_api',request);},
        adminApi(request) {return this.send('/__test_admin',request);},
        send(path,request) {const success=this.success,failure=this.failure;
          fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})
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
    if (
      request.method === "GET" &&
      ["/", "/?view=admin"].includes(request.url)
    ) {
      response
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(html(request.url.includes("admin")));
      return;
    }
    if (
      request.method === "POST" &&
      ["/__test_api", "/__test_admin"].includes(request.url)
    ) {
      let body = "";
      try {
        for await (const chunk of request) {
          body += chunk;
          if (Buffer.byteLength(body) > 4096) {
            response.writeHead(413).end();
            return;
          }
        }
        const result =
          request.url === "/__test_admin"
            ? gas.context.adminApi(JSON.parse(body))
            : gas.call(JSON.parse(body));
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
  return { server, gas, url: `http://127.0.0.1:${server.address().port}/` };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { url } = await startPreview();
  console.log(`Mock-only preview: ${url} (Ctrl+C to stop)`);
}
