"""Run on the VPS; configure disabled mail alerts/dashboard, activate after worker health.

Reads the existing service account in place. Never exports credentials.
"""
import base64
import copy
import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

HOME = Path('/home/eduardo')
ROOT = HOME / 'comportarte-messaging'
ROOT.mkdir(exist_ok=True, mode=0o700)
ACTIVATE = '--activate' in sys.argv


def request(path, data=None, method=None):
    token = (HOME / '.o2_token').read_text().strip()
    headers = {'Authorization': 'Basic ' + base64.b64encode(token.encode()).decode(),
               'Content-Type': 'application/json'}
    req = urllib.request.Request('http://localhost:5080' + path, headers=headers,
                                 data=json.dumps(data).encode() if data is not None else None,
                                 method=method)
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response)


if ACTIVATE:
    subprocess.run(['node', 'dist/mail-admin.js', 'health'], cwd=HOME/'hallazgos-api',
                   env=__import__('os').environ | {'NODE_ENV': 'production'}, check=True)

alerts = request('/api/v2/default/alerts')['list']
original_id = next(a['alert_id'] for a in alerts if a['name'] == 'fallo_envio_correos')
original = request('/api/v2/default/alerts/' + original_id)
backup = ROOT / 'alert-original.json'
if not backup.exists():
    backup.write_text(json.dumps(original, indent=2))

# Reuse the authorized Telegram destination without copying its credentials.
template = request('/api/default/alerts/templates/telegram_correos')
body = json.loads(template['body'])
body['text'] = 'ComportArte: estado de la cola de correos\n\n{rows}\n\nRevisa ComportArte - Correos y los logs de MailWorker en OpenObserve.'
template.update(name='telegram_cola_correos', body=json.dumps(body, ensure_ascii=False), isDefault=False)
try:
    request('/api/default/alerts/templates/telegram_cola_correos')
except urllib.error.HTTPError as error:
    if error.code != 404:
        raise
    request('/api/default/alerts/templates', template, 'POST')
else:
    request('/api/default/alerts/templates/telegram_cola_correos', template, 'PUT')

names = {a['name']: a['alert_id'] for a in alerts}
ids = {}
for name, kind in [('correo_outbox_atencion', 'error'),
                   ('correo_outbox_recuperado', 'recovery'),
                   ('correo_outbox_worker_detenido', 'heartbeat')]:
    if ACTIVATE and name in names:
        current = request('/api/v2/default/alerts/' + names[name])
        current['enabled'] = True
        request('/api/v2/default/alerts/' + names[name], current, 'PUT')
        ids[name] = names[name]
        continue
    a = copy.deepcopy(original)
    for key in ['id', 'last_triggered_at', 'last_satisfied_at', 'last_edited_by', 'owner', 'org_id']:
        a.pop(key, None)
    # Provisioning again must not disable an already activated rule.
    enabled = ACTIVATE or (name in names and next(x['enabled'] for x in alerts if x['name'] == name))
    a.update(name=name, enabled=enabled, template='telegram_cola_correos',
             description='Cola persistente: errores que requieren intervencion, recuperacion o falta de heartbeat. Silencio 30 min.')
    if kind == 'heartbeat':
        a['is_real_time'] = False
        a['query_condition'] = {'type': 'sql', 'sql': '''SELECT 'El worker de correos no emitio heartbeat en los ultimos 2 minutos. Revisar PM2, Redis y PostgreSQL.' AS message FROM "api_comportarte" WHERE context='MailWorker' AND message LIKE '%mail_heartbeat%' HAVING COUNT(*)=0'''}
        a['trigger_condition'].update(period=2, frequency=1, silence=30)
    else:
        a['is_real_time'] = True
        conditions = [{'filterType': 'condition', 'column': 'context', 'operator': '=',
                       'value': 'MailWorker', 'ignore_case': False, 'logicalOperator': 'AND'},
                      {'filterType': 'condition', 'column': 'level' if kind == 'error' else 'message',
                       'operator': '=' if kind == 'error' else 'contains',
                       'value': 'error' if kind == 'error' else 'mail_account_resumed',
                       'ignore_case': False, 'logicalOperator': 'AND'}]
        if kind == 'recovery':
            conditions[1] = {'filterType':'group','logicalOperator':'AND','conditions':[conditions[1], {'filterType':'condition','column':'message','operator':'contains','value':'mail_worker_ready','ignore_case':False,'logicalOperator':'OR'}]}
        a['query_condition'] = {'type': 'custom', 'conditions': {'version': 2, 'conditions': {
            'filterType': 'group', 'logicalOperator': 'AND', 'conditions': conditions}}}
    if name in names:
        request('/api/v2/default/alerts/' + names[name], a, 'PUT')
        ids[name] = names[name]
    else:
        result = request('/api/v2/default/alerts', a, 'POST')
        ids[name] = result['id']
(ROOT / 'mail-alerts.json').write_text(json.dumps(ids, indent=2))
if ACTIVATE:
    print('Mail alerts activated; existing dashboard preserved')
    sys.exit(0)

# Keep the legacy API rule: it catches a failure to persist a recovery request,
# for which no outbox row could be written. Worker errors use a different context.
dashboards = request('/api/default/dashboards')['dashboards']
def dashboard_body(document):
    return next(document['v'+str(version)] for version in range(8, 0, -1) if document.get('v'+str(version)))

health = dashboard_body(dashboards[0])
template = next(p for t in health['tabs'] for p in t['panels'] if p.get('queries'))


def field(label, alias):
    return {'label': label, 'alias': alias, 'column': alias, 'color': None, 'isDerived': False}


definitions = [
    ('accepted', 'metric', 'Aceptados por SMTP', '''SELECT COUNT(*) AS y_axis_1 FROM "api_comportarte" WHERE context='MailWorker' AND message LIKE '%"result":"accepted"%' ''', [], [field('Aceptados', 'y_axis_1')]),
    ('review', 'metric', 'Eventos que requieren revision', '''SELECT COUNT(*) AS y_axis_1 FROM "api_comportarte" WHERE context='MailWorker' AND message LIKE '%mail_review_required%' ''', [], [field('Eventos', 'y_axis_1')]),
    ('heartbeat', 'table', 'Ultimo estado persistente de la cola', '''SELECT _timestamp AS momento,message AS estado FROM "api_comportarte" WHERE context='MailWorker' AND message LIKE '%mail_heartbeat%' ORDER BY _timestamp DESC LIMIT 1''', [field('Momento', 'momento'), field('Estado', 'estado')], []),
    ('errors', 'table', 'Incidentes y recuperaciones', '''SELECT _timestamp AS momento,message AS evento FROM "api_comportarte" WHERE context='MailWorker' AND (level='error' OR message LIKE '%mail_account_resumed%') ORDER BY _timestamp DESC LIMIT 50''', [field('Momento', 'momento'), field('Evento', 'evento')], []),
]
panels = []
for index, (key, kind, title, sql, x, y) in enumerate(definitions):
    # Validate every query without emitting synthetic production events.
    request('/api/default/_search', {'query': {'sql': sql, 'start_time': int((time.time()-3600)*1e6),
                                              'end_time': int(time.time()*1e6), 'from': 0, 'size': 50}})
    p = copy.deepcopy(template)
    p.update(id='Mail_'+key, type=kind, title=title,
             description='Sin eventos hasta publicar el worker. Aceptacion SMTP no confirma entrega en bandeja.',
             layout={'x': 0, 'y': index*10, 'w': 96, 'h': 8, 'i': index})
    q = p['queries'][0]
    q.update(query=sql, customQuery=True)
    q['fields'].update(stream='api_comportarte', stream_type='logs', x=x, y=y, z=[], breakdown=[])
    p['queries'] = [q]
    panels.append(p)
payload = {'version': 5, 'title': 'ComportArte - Correos',
           'description': 'Estado del worker, reintentos e incidentes. Las cantidades pendientes vienen del ultimo heartbeat, no se suman en el tiempo.',
           'tabs': [{'tabId': 'default', 'name': 'Correos', 'panels': panels}],
           'variables': {'list': [], 'showDynamicFilters': False},
           'defaultDatetimeDuration': {'type': 'relative', 'relativeTimePeriod': '24h'}}
existing = next((d for d in dashboards if d['title'] == payload['title']), None)
if existing:
    path = '/api/default/dashboards/' + existing['dashboard_id'] + '?folder=default'
    current = request(path)
    payload['dashboardId'] = existing['dashboard_id']
    saved = request(path + '&hash=' + urllib.parse.quote(current['hash']), payload, 'PUT')
else:
    saved = request('/api/default/dashboards?folder=default', payload, 'POST')
dashboard_id = dashboard_body(saved)['dashboardId']
verified = request('/api/default/dashboards/' + dashboard_id + '?folder=default')
assert len(dashboard_body(verified)['tabs'][0]['panels']) == 4
(ROOT / 'mail-dashboard.json').write_text(json.dumps(verified, ensure_ascii=False, indent=2))
print('Mail dashboard:', dashboard_id, '| alerts:', 'activated' if ACTIVATE else 'prepared')
