"""Read-only pilot load probe; capacity depends on hardware and workload."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import statistics
import time
from urllib.request import urlopen

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:8000")
parser.add_argument("--requests", type=int, default=100)
parser.add_argument("--concurrency", type=int, default=8)
args = parser.parse_args()
if args.requests < 1 or not 1 <= args.concurrency <= 32:
    raise SystemExit("Use requests >= 1 and concurrency between 1 and 32")
with urlopen(args.url + "/api/v1/homes?limit=100", timeout=10) as response:
    homes = json.load(response)
if not homes:
    raise SystemExit("No homes available for a read-only load probe")

def probe(index):
    home = homes[index % len(homes)]["id"]
    start = time.perf_counter()
    with urlopen(f"{args.url}/api/v1/homes/{home}/dashboard", timeout=10) as response:
        body = json.load(response)
        if body["home"]["id"] != home:
            raise RuntimeError("Wrong home in response")
    return (time.perf_counter() - start) * 1000

start = time.perf_counter()
with ThreadPoolExecutor(args.concurrency) as executor:
    latencies = sorted(executor.map(probe, range(args.requests)))
elapsed = time.perf_counter() - start
print(json.dumps({"requests": args.requests, "concurrency": args.concurrency,
                  "p50_ms": round(statistics.median(latencies), 2),
                  "p95_ms": round(latencies[min(len(latencies) - 1, int(len(latencies) * .95))], 2),
                  "requests_per_second": round(args.requests / elapsed, 2), "errors": 0}, indent=2))
