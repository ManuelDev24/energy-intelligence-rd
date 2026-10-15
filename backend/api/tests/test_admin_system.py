"""ERD-ADM-SYSTEM-WEB: configuración y salud — comprobaciones puras con configuraciones simuladas, y la ruta real con su scope."""
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from sqlalchemy import text

from app.services.admin_system import BACKUP_MAX_AGE_DAYS, RESTORE_DRILL_MAX_AGE_DAYS, attestations, config_checks
from tests.test_admin_rbac import _grant
from tests.test_auth import auth_client, bearer, register  # noqa: F401

ADMIN = '/api/v1/admin'
STRONG = 'Ab1' * 5 + 'XyZ9' * 8 + 'qwertyuiop'  # ≥ 43 caracteres y ≥ 16 distintos
SECRETS = ('sk-ant-SECRETO-1', 're_SECRETO_2', 'postgres-SECRETO-3', 'sentry-SECRETO-4', 's3-SECRETO-5')


def cfg(**over):
    base = dict(ENVIRONMENT='production', AUTH_ENABLED=True, AUTH_SIGNING_KEY=STRONG, DB_REQUIRE_RESTRICTED_ROLE=True, MIGRATION_DATABASE_URL='postgresql://m',
                cors_origins_list=['https://app.example.org'], EMAIL_BACKEND='resend', RESEND_API_KEY=SECRETS[1], EMAIL_FROM='no-reply@example.org',
                PASSWORD_RESET_URL='https://app.example.org/r', INVITATION_URL='https://app.example.org/i', EMAIL_VERIFICATION_URL='https://app.example.org/v',
                STORAGE_BACKEND='s3', STORAGE_S3_BUCKET='bucket', STORAGE_S3_ACCESS_KEY_ID='k', STORAGE_S3_SECRET_ACCESS_KEY=SECRETS[4],
                STORAGE_ENCRYPTION_KEYS='v1:abc', STORAGE_URL_SIGNING_KEY=STRONG, SENTRY_DSN=SECRETS[3], CLIENT_IP_SOURCE='socket', BFF_API_SHARED_SECRET='',
                COPILOT_PROVIDER='anthropic', ANTHROPIC_API_KEY=SECRETS[0], SUPPORT_EMAIL='ayuda@example.org', SEED_PILOT=False, ALLOW_DRAFT_LEGAL=False,
                OPS_LAST_BACKUP_VERIFIED_AT=None, OPS_LAST_RESTORE_DRILL_AT=None)
    base.update(over)
    return SimpleNamespace(**base)


def by_key(checks):
    return {c['key']: c for c in checks}


def test_a_healthy_production_config_has_no_missing_or_warning_checks():
    checks = config_checks(cfg(), legal_status='final')
    assert [c['key'] for c in checks if c['status'] in ('missing', 'warning')] == []
    assert by_key(checks)['BFF_API_SHARED_SECRET']['status'] == 'na'  # solo se exige con Cloudflare


def test_legal_texts_in_draft_are_never_reported_as_ok():
    assert by_key(config_checks(cfg(), legal_status='final'))['ALLOW_DRAFT_LEGAL']['status'] == 'ok'
    assert by_key(config_checks(cfg(ENVIRONMENT='staging'), legal_status='draft'))['ALLOW_DRAFT_LEGAL']['status'] == 'warning'
    accepted = by_key(config_checks(cfg(ALLOW_DRAFT_LEGAL=True), legal_status='draft'))['ALLOW_DRAFT_LEGAL']
    assert accepted['status'] == 'warning' and 'riesgo aceptado' in accepted['hint']
    assert by_key(config_checks(cfg(), legal_status='draft'))['ALLOW_DRAFT_LEGAL']['status'] == 'missing'  # producción sin aceptar el riesgo


def test_missing_pieces_are_reported_by_name_without_values():
    bad = cfg(AUTH_SIGNING_KEY='corta', SENTRY_DSN='', RESEND_API_KEY='', DB_REQUIRE_RESTRICTED_ROLE=False, cors_origins_list=['http://inseguro.example.org'],
              SUPPORT_EMAIL='', STORAGE_BACKEND='disabled', COPILOT_PROVIDER='anthropic', ANTHROPIC_API_KEY='')
    c = by_key(config_checks(bad))
    assert c['AUTH_SIGNING_KEY']['status'] == 'missing' and c['SENTRY_DSN']['status'] == 'warning' and c['EMAIL_BACKEND']['status'] == 'missing'
    assert c['DB_REQUIRE_RESTRICTED_ROLE']['status'] == 'missing' and c['CORS_ORIGINS']['status'] == 'missing'
    assert c['SUPPORT_EMAIL']['status'] == 'warning' and c['ANTHROPIC_API_KEY']['status'] == 'missing'
    assert c['STORAGE_BACKEND']['status'] == 'missing' and 'STORAGE_ENCRYPTION_KEYS' not in c  # con almacenamiento apagado no se exigen sus claves


def test_development_marks_production_only_settings_as_not_applicable():
    c = by_key(config_checks(cfg(ENVIRONMENT='development', EMAIL_BACKEND='console', RESEND_API_KEY='', MIGRATION_DATABASE_URL='', SENTRY_DSN='',
                                 cors_origins_list=['http://localhost:3000'], STORAGE_BACKEND='local', PASSWORD_RESET_URL='http://localhost:3000/r',
                                 INVITATION_URL='http://localhost:3000/i', EMAIL_VERIFICATION_URL='http://localhost:3000/v', COPILOT_PROVIDER='fake')))
    for key in ('EMAIL_BACKEND', 'MIGRATION_DATABASE_URL', 'SENTRY_DSN', 'CORS_ORIGINS', 'PASSWORD_RESET_URL', 'ANTHROPIC_API_KEY'):
        assert c[key]['status'] == 'na', key
    assert c['STORAGE_BACKEND']['status'] == 'warning'


def test_no_check_ever_contains_a_secret_or_a_url():
    text_out = json.dumps(config_checks(cfg()), ensure_ascii=False)
    for secret in SECRETS + (STRONG, 'https://app.example.org', 'ayuda@example.org', 'no-reply@example.org', 'bucket'):
        assert secret not in text_out, secret


def test_attestations_are_declared_not_measured_and_go_stale():
    now = datetime(2026, 10, 15, tzinfo=timezone.utc)
    unknown = attestations(now, cfg())
    assert [a['status'] for a in unknown] == ['unknown', 'unknown'] and all('no medido' in a['source'] for a in unknown)
    fresh = attestations(now, cfg(OPS_LAST_BACKUP_VERIFIED_AT=now - timedelta(days=10), OPS_LAST_RESTORE_DRILL_AT=now - timedelta(days=RESTORE_DRILL_MAX_AGE_DAYS)))
    assert [a['status'] for a in fresh] == ['ok', 'ok'] and fresh[0]['age_days'] == 10
    stale = attestations(now, cfg(OPS_LAST_BACKUP_VERIFIED_AT=now - timedelta(days=BACKUP_MAX_AGE_DAYS + 1),
                                  OPS_LAST_RESTORE_DRILL_AT=datetime(2026, 1, 1)))  # sin zona horaria: se toma como UTC
    assert [a['status'] for a in stale] == ['stale', 'stale']


def test_system_route_scope_migrations_and_no_secret_values(auth_client, migrated):
    ops = register(auth_client, 'ops-system@example.com')
    support = register(auth_client, 'soporte-system@example.com')
    owner = register(auth_client, 'persona-system@example.com')
    _grant(migrated, 'ops-system@example.com', 'operations_admin')
    _grant(migrated, 'soporte-system@example.com', 'support_readonly')
    assert auth_client.get(f'{ADMIN}/system').status_code == 401
    assert auth_client.get(f'{ADMIN}/system', headers=bearer(owner)).status_code == 403
    assert auth_client.get(f'{ADMIN}/system', headers=bearer(support)).status_code == 403
    r = auth_client.get(f'{ADMIN}/system', headers=bearer(ops))
    assert r.status_code == 200, r.text
    assert r.headers['cache-control'] == 'no-store'
    d = r.json()
    assert d['version'] and d['environment'] and d['uptime_seconds'] >= 0
    with migrated.connect() as c:
        current = c.execute(text('SELECT version_num FROM alembic_version')).scalar_one()
    assert d['migrations']['current'] == current and d['migrations']['head'] == current and d['migrations']['up_to_date'] is True
    assert {c['status'] for c in d['checks']} <= {'ok', 'warning', 'missing', 'na'} and len(d['checks']) >= 12
    assert [a['key'] for a in d['attestations']] == ['OPS_LAST_BACKUP_VERIFIED_AT', 'OPS_LAST_RESTORE_DRILL_AT']
    assert any(rb['path'] == 'docs/ops/DISASTER_RECOVERY.md' for rb in d['runbooks'])
    # Los NOMBRES de variable se muestran a propósito; los VALORES (URLs, credenciales, correos) nunca.
    for forbidden in ('postgresql://', 'postgresql+', 'https://', 'http://', '@', 'sk-ant', 'localhost', '127.0.0.1'):
        assert forbidden not in json.dumps(d['checks']).lower(), forbidden
    for method in ('post', 'put', 'patch', 'delete'):
        assert getattr(auth_client, method)(f'{ADMIN}/system', headers=bearer(ops)).status_code in (404, 405)
