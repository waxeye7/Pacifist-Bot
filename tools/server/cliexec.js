const http = require("http");
const body = process.env.CMD || "1+1";
const req = http.request(
  {
    host: "127.0.0.1",
    port: 21026,
    method: "POST",
    path: "/cli",
    timeout: 60000,
    headers: { "Content-Type": "text/plain", "Content-Length": Buffer.byteLength(body) },
  },
  (r) => {
    let d = "";
    r.setEncoding("utf8");
    r.on("data", (c) => (d += c));
    r.on("end", () => {
      process.stdout.write(d);
      process.exit(0);
    });
  },
);
req.on("error", (e) => {
  console.error("ERR " + e.message);
  process.exit(1);
});
req.write(body);
req.end();
