#!/usr/bin/env python3
"""Generate SVG charts from k6 --summary-export JSON files (no dependencies).

Reads load-summary.json / stress-summary.json / scalability-r*.json from this
folder and writes perf-*.svg charts embedded by docs/02-performance-testing-report.md.
"""
import json
import os

PERF = os.path.dirname(os.path.abspath(__file__))


def load(name):
    p = os.path.join(PERF, name)
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)


def metric(d, name):
    return (d.get("metrics", d) or {}).get(name, {}) if d else {}


def svg_bars(title, data, fname, unit="", color="#ff7a3d", fmt="{:.0f}"):
    """data: list of (label, value)."""
    W, H, left, right, top, bottom = 560, 320, 60, 20, 50, 60
    pw, ph = W - left - right, H - top - bottom
    maxv = max([v for _, v in data] + [1])
    n = len(data)
    gap = 18
    bw = (pw - gap * (n + 1)) / n
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="Segoe UI,sans-serif">',
        f'<rect width="{W}" height="{H}" fill="#ffffff"/>',
        f'<text x="{W/2}" y="28" text-anchor="middle" font-size="16" font-weight="700" fill="#1c1815">{title}</text>',
        f'<line x1="{left}" y1="{top+ph}" x2="{W-right}" y2="{top+ph}" stroke="#ddd"/>',
    ]
    for i, (lbl, v) in enumerate(data):
        x = left + gap + i * (bw + gap)
        bh = ph * (v / maxv)
        y = top + ph - bh
        parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw:.1f}" height="{bh:.1f}" rx="4" fill="{color}"/>')
        parts.append(f'<text x="{x+bw/2:.1f}" y="{y-7:.1f}" text-anchor="middle" font-size="12" font-weight="600" fill="#333">{fmt.format(v)}{unit}</text>')
        parts.append(f'<text x="{x+bw/2:.1f}" y="{top+ph+20:.1f}" text-anchor="middle" font-size="12" fill="#666">{lbl}</text>')
    parts.append("</svg>")
    with open(os.path.join(PERF, fname), "w") as f:
        f.write("\n".join(parts))
    print("wrote", fname)


def main():
    load_d = load("load-summary.json")
    stress_d = load("stress-summary.json")
    c1 = load("cat-1x.json")
    c3 = load("cat-3x.json")

    # 1) Latency distribution (load test)
    if load_d:
        dur = metric(load_d, "http_req_duration")
        svg_bars(
            "Load Test — HTTP latency (ms)",
            [("avg", dur.get("avg", 0)), ("median", dur.get("med", 0)),
             ("p90", dur.get("p(90)", 0)), ("p95", dur.get("p(95)", 0))],
            "perf-latency.svg", unit="ms", fmt="{:.1f}",
        )

    # 2) Throughput + error rate across scenarios
    tp = []
    if load_d:
        tp.append(("load", metric(load_d, "http_reqs").get("rate", 0)))
    if stress_d:
        tp.append(("stress", metric(stress_d, "http_reqs").get("rate", 0)))
    if tp:
        svg_bars("Throughput (requests / sec)", tp, "perf-throughput.svg",
                 unit="/s", color="#45d6c4", fmt="{:.0f}")

    # 3) Horizontal scalability — throughput vs replicas (isolated catalog probe)
    scal = []
    if c1:
        scal.append(("1 replica", metric(c1, "http_reqs").get("rate", 0)))
    if c3:
        scal.append(("3 replicas", metric(c3, "http_reqs").get("rate", 0)))
    if scal:
        svg_bars("Horizontal Scaling — throughput (req/s)", scal,
                 "perf-scalability.svg", unit="/s", color="#45d6c4", fmt="{:.0f}")

    # 4) Scaling effect on latency (p95)
    lat = []
    if c1:
        lat.append(("1 replica", metric(c1, "http_req_duration").get("p(95)", 0)))
    if c3:
        lat.append(("3 replicas", metric(c3, "http_req_duration").get("p(95)", 0)))
    if lat:
        svg_bars("Horizontal Scaling — p95 latency (ms)", lat,
                 "perf-scalability-latency.svg", unit="ms", color="#ff7a3d", fmt="{:.0f}")


if __name__ == "__main__":
    main()
