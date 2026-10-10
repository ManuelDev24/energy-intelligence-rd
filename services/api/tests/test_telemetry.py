"""ERD-OBS-01: Sentry opcional con redacción de datos personales antes de salir del proceso."""
import json
import logging

import pytest
import sentry_sdk
from sentry_sdk.transport import Transport

from app import telemetry
from app.config import Settings

SECRET_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXZhbHVl'
OPAQUE = 'A' * 43
DSN = 'https://publickey@o0.ingest.sentry.io/1'


class Capture(Transport):
    def __init__(self):
        super().__init__()
        self.events = []

    def capture_envelope(self, envelope):
        for item in envelope.items:
            if item.headers.get('type') in {'event', 'transaction'}:
                self.events.append(item.payload.json)


@pytest.fixture
def sentry():
    transport = Capture()
    yield transport
    sentry_sdk.get_client().close()
    sentry_sdk.init()  # desactiva


def settings(**values):
    values.setdefault('SENTRY_TRACES_SAMPLE_RATE', 0.0)  # sin muestreo aleatorio: pruebas deterministas
    return Settings(ENVIRONMENT='development', SENTRY_DSN=values.pop('dsn', DSN), **values)


def test_no_dsn_means_no_client_and_no_network():
    assert telemetry.init_telemetry(Settings(ENVIRONMENT='development', SENTRY_DSN='')) is False
    assert not sentry_sdk.get_client().is_active()


def test_dsn_must_be_https_and_is_never_in_the_repr():
    with pytest.raises(ValueError, match='SENTRY_DSN'):
        Settings(ENVIRONMENT='development', SENTRY_DSN='http://k@host/1')
    assert 'publickey' not in repr(settings())


@pytest.mark.parametrize('rate', [-0.1, 1.1])
def test_trace_rate_is_a_probability(rate):
    with pytest.raises(ValueError):
        settings(SENTRY_TRACES_SAMPLE_RATE=rate)


def test_init_disables_pii_locals_bodies_and_log_duplicates(sentry):
    assert telemetry.init_telemetry(settings(), transport=sentry) is True
    options = sentry_sdk.get_client().options
    assert options['send_default_pii'] is False and options['include_local_variables'] is False
    assert options['max_request_body_size'] == 'never' and options['environment'] == 'development'
    assert options['release'].startswith('energy-api@')
    assert options['before_send'] is telemetry.scrub_event


def test_scrub_event_removes_request_user_and_host_data():
    event = {
        'request': {'url': 'https://api.example/api/v1/auth/password/reset?token=' + OPAQUE, 'query_string': 'token=' + OPAQUE,
                    'method': 'POST', 'data': {'new_password': 'hunter2hunter2'}, 'cookies': {'erd-access': 'x'},
                    'headers': {'Authorization': 'Bearer ' + SECRET_JWT, 'Cookie': 'a=b', 'User-Agent': 'curl/8',
                                'X-Request-ID': 'abc12345', 'X-Forwarded-Client-Ip': '1.2.3.4'},
                    'env': {'REMOTE_ADDR': '1.2.3.4'}},
        'user': {'id': 'u1', 'email': 'alice@example.com', 'ip_address': '1.2.3.4'},
        'server_name': 'render-instance-77',
    }
    clean = telemetry.scrub_event(event, {})
    assert clean['request']['url'] == 'https://api.example/api/v1/auth/password/reset'
    assert clean['request']['method'] == 'POST'
    assert set(clean['request']) <= {'url', 'method', 'headers'}
    assert clean['request']['headers'] == {'User-Agent': 'curl/8', 'X-Request-ID': 'abc12345'}
    assert 'user' not in clean and 'server_name' not in clean
    assert OPAQUE not in json.dumps(clean) and SECRET_JWT not in json.dumps(clean) and '1.2.3.4' not in json.dumps(clean)


def test_scrub_event_filters_values_by_pattern_and_by_key():
    event = {
        'message': f'fallo para alice@example.com con {SECRET_JWT} y Bearer abcdefghijkl y {OPAQUE}',
        'exception': {'values': [{'type': 'ValueError', 'value': 'correo bob.smith+x@mail.co.do inválido',
                                  'stacktrace': {'frames': [{'function': 'f', 'vars': {'password': 'p'}, 'context_line': "token = 'zzz'", 'abs_path': '/app/x.py', 'lineno': 7}]}}]},
        'breadcrumbs': {'values': [{'message': 'GET /x', 'data': {'refresh_token': OPAQUE, 'status': 200}}]},
        'extra': {'raw_text_excerpt': 'NIC 123 Juan Pérez', 'account_number': 'NIC-9', 'kwh': 320, 'address': 'Calle 1'},
        'tags': {'request_id': 'a1b2c3d4e5f60718293a4b5c6d7e8f90'},
    }
    dump = json.dumps(telemetry.scrub_event(event, {}))
    for leaked in ('alice@example.com', 'bob.smith', SECRET_JWT, 'abcdefghijkl', OPAQUE, 'Juan Pérez', 'NIC-9', 'Calle 1'):
        assert leaked not in dump, leaked
    clean = telemetry.scrub_event(event, {})
    assert clean['extra']['kwh'] == 320 and clean['breadcrumbs']['values'][0]['data']['status'] == 200
    assert clean['tags']['request_id'] == 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
    frame = clean['exception']['values'][0]['stacktrace']['frames'][0]
    assert not {'vars', 'context_line'} & set(frame)
    assert (frame['abs_path'], frame['lineno'], frame['function']) == ('/app/x.py', 7, 'f')


def test_scrub_never_raises_on_odd_events():
    for odd in ({}, {'request': None}, {'exception': {'values': None}}, {'extra': {'a': object()}}):
        assert isinstance(telemetry.scrub_event(odd, {}), dict)


def test_unhandled_api_error_reaches_sentry_without_personal_data(client, sentry, monkeypatch):
    telemetry.init_telemetry(settings(), transport=sentry)

    def boom(*args, **kwargs):
        raise RuntimeError(f'falló para alice@example.com {SECRET_JWT}')

    monkeypatch.setattr('app.services.tariffs.list_tariffs', boom)
    response = client.get('/api/v1/tariffs?distributor=EDESUR', headers={'Authorization': 'Bearer ' + SECRET_JWT,
                                                                       'Cookie': 'erd-access=zzz', 'X-Request-ID': 'req-12345678'})
    assert response.status_code == 500 and response.json()['request_id'] == 'req-12345678'
    sentry_sdk.flush()
    assert sentry.events, 'el error no llegó a Sentry'
    dump = json.dumps(sentry.events)
    assert 'alice@example.com' not in dump and SECRET_JWT not in dump and 'erd-access' not in dump
    assert sentry.events[0]['tags']['request_id'] == 'req-12345678'


def test_handled_application_errors_are_not_reported(client, sentry):
    telemetry.init_telemetry(settings(), transport=sentry)
    assert client.get('/api/v1/homes/not-a-uuid').status_code in {404, 422}
    sentry_sdk.flush()
    assert sentry.events == []
