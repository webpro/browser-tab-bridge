#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import http from "node:http";

const LOG = "/tmp/browser-tab-bridge.log";
const log = (msg) => appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);

function sendToExtension(msg) {
  const json = JSON.stringify(msg);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(header);
  process.stdout.write(json);
}

const pending = new Map();

let buf = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= 4) {
    const len = buf.readUInt32LE(0);
    if (buf.length < 4 + len) break;
    const msg = JSON.parse(buf.slice(4, 4 + len).toString());
    buf = buf.slice(4 + len);

    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let nextId = 1;

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      const { action, url } = JSON.parse(body);
      if (!action) {
        res.writeHead(400);
        res.end(JSON.stringify({ status: "error", message: "action is required" }));
        return;
      }
      const id = nextId++;

      const timeout = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          res.writeHead(504);
          res.end(JSON.stringify({ status: "timeout" }));
        }
      }, 3000);

      pending.set(id, (result) => {
        clearTimeout(timeout);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      });

      sendToExtension({ id, action, url });
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ status: "error", message: "invalid request" }));
    }
  });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    const old = http.request(
      { hostname: "127.0.0.1", port: 9854, method: "DELETE" },
      () => {
        setTimeout(() => server.listen(9854, "127.0.0.1"), 500);
      },
    );
    old.on("error", () => {
      setTimeout(() => server.listen(9854, "127.0.0.1"), 500);
    });
    old.end();
  }
});

log("starting");

process.on("uncaughtException", (err) => log(`uncaught: ${err.stack}`));

server.listen(9854, "127.0.0.1", () => log("listening on 9854"));
