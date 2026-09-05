#!/usr/bin/env python3
"""Look up a relayer job's status by source tx hash in relayer/state/jobs.json.

Used by .github/workflows/testnet-deploy.yml to poll the relayer's flat-file job store while
waiting for a real Attestcoin evidence submission to reach CREDIT_UPDATED (or a terminal failure
state) against the real Sepolia -> Creditcoin CC3 testnet flow. Kept as a standalone script
(rather than inlined in the workflow YAML) so it can be tested and read on its own.

Usage: python3 script/check_job_status.py <source_tx_hash> [path/to/jobs.json]
Prints the job's status string, or an empty line if no matching job exists yet.
"""
import json
import sys


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: check_job_status.py <source_tx_hash> [jobs_json_path]", file=sys.stderr)
        sys.exit(2)

    target = sys.argv[1].lower()
    jobs_path = sys.argv[2] if len(sys.argv) > 2 else "state/jobs.json"

    try:
        with open(jobs_path) as f:
            jobs = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        print("")
        return

    for job in jobs.values():
        if job.get("sourceTxHash", "").lower() == target:
            print(job.get("status", ""))
            return

    print("")


if __name__ == "__main__":
    main()
