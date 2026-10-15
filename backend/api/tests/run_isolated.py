"""Run pytest only against the dedicated auth test database; never print its URL."""
import ast
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
module = ast.parse((root / 'app/config.py').read_text())
default = next(ast.literal_eval(n.value) for n in module.body
               if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'DEFAULT_DATABASE_URL' for t in n.targets))
env = dict(os.environ)
env.pop('PYTHONPATH', None)
env.update(TEST_DATABASE_URL=default.rsplit('/', 1)[0] + '/energy_rd_auth_test',
           DATABASE_URL=default.rsplit('/', 1)[0] + '/energy_rd_auth_application_no_connect',
           ENVIRONMENT='development', AUTH_ENABLED='false', CI='true')
raise SystemExit(subprocess.call([sys.executable, '-m', 'pytest', *sys.argv[1:]], cwd=root, env=env))
