#!/usr/bin/env python3
"""Run isolated native Phase 2 QA; credentials never reach terminal output.
Artifacts are redacted after execution; avoid opening live Maestro logs during a run.
"""
import os
import re
from pathlib import Path
import secrets
import subprocess
import sys
import uuid

platform, run_name = sys.argv[1:3]
mobile = Path(__file__).resolve().parents[1]
out = mobile / 'maestro' / 'evidence' / 'phase2-2026-10-04' / run_name
out.mkdir(parents=True, exist_ok=True)
env = os.environ.copy()
env.update(EMAIL=f'native-p2-{uuid.uuid4().hex}@example.com', PASSWORD=secrets.token_urlsafe(24),
           MAESTRO_CLI_NO_ANALYTICS='1', DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer',
           ANDROID_HOME='/Users/macbookpro/Library/Android/sdk')
device = '6A93B4DE-A287-4048-9A75-D16849180A25' if platform == 'ios' else 'emulator-5554'
app = 'host.exp.Exponent' if platform == 'ios' else 'host.exp.exponent'
url = 'exp://127.0.0.1:8083' if platform == 'ios' else 'exp://127.0.0.1:8084'
cmd = ['/opt/homebrew/bin/maestro', '--device', device, 'test', '--no-ansi',
       '--test-output-dir', str(out), '--debug-output', str(out / 'debug'),
       '--format', 'JUNIT', '--output', str(out / 'junit.xml'),
       '-e', f'APP_ID={app}', '-e', f'EXPO_URL={url}',
       '-e', f'EMAIL={env["EMAIL"]}', '-e', f'PASSWORD={env["PASSWORD"]}',
       str(mobile / 'maestro' / 'phase2-flow.yaml')]
result = subprocess.run(cmd, env=env, cwd=out, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
def redact(text):
    for key in ('EMAIL', 'PASSWORD'):
        text = text.replace(env[key], f'<REDACTED_{key}>')
    return re.sub(r'native-p2-[0-9a-f]+@example\.com', '<REDACTED_EMAIL>', text)
log = redact(result.stdout.decode(errors='replace'))
log += f'\nNATIVE_QA_EXIT_CODE={result.returncode}; ARTIFACTS={out}\n'
(out / 'console.log').write_text(log)
# Maestro creates additional commands/debug files containing resolved inputText.
# Redact those (including its default per-user debug folder if this version uses it).
for root in (out, Path.home() / '.maestro' / 'tests'):
    for path in root.rglob('*'):
        if path.is_file() and path.suffix in {'.json', '.xml', '.log', '.html', '.txt'}:
            text = path.read_text(errors='replace')
            clean = redact(text)
            if clean != text:
                path.write_text(clean)
print(log)
sys.exit(result.returncode)
