// Shared Prometheus instrumentation (one copy per service for build isolation).
const client = require("prom-client");

const register = client.register;
const service = process.env.SERVICE_NAME || "service";
register.setDefaultLabels({ service });
client.collectDefaultMetrics();

const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status", "service"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

const httpTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status", "service"],
});

function metricsMiddleware(req, res, next) {
  const stop = httpDuration.startTimer();
  res.on("finish", () => {
    const route = (req.route && req.route.path) || req.path || "unknown";
    const labels = {
      method: req.method,
      route,
      status: res.statusCode,
      service,
    };
    stop(labels);
    httpTotal.inc(labels);
  });
  next();
}

async function metricsHandler(_req, res) {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
}

module.exports = { client, metricsMiddleware, metricsHandler };
