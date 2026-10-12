"""Export OpenAPI and runtime TS schemas from Pydantic; --check detects drift.

No database connection is needed. Unsupported schema constructs fail generation.
Cross-field business validators remain authoritative in Python/API tests.
"""
import argparse
import json
import os
import typing
from decimal import Decimal
from pathlib import Path

from pydantic import BaseModel

# Herramienta de compilación: no abre conexiones ni atiende peticiones; los modos de autenticación no cambian el esquema.
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("AUTH_ENABLED", "false")

from app.main import app
from app.schemas.home import HomeOut
from app.schemas.bill import BillOut, BillCreate, BillUpdate, BillPaymentIn
from app.schemas.dashboard import DashboardOut
from app.schemas.equipment import EquipmentOut, EquipmentEstimateOut, EquipmentIn
from app.schemas.alert import AlertRecord, AlertSettingsOut, AlertSettingsIn, AlertStatusUpdate
from app.schemas.auth import (UserOut, TokensOut, RegisterIn, AccountDeletionIn, LegalOut, PasswordForgotIn,
                              PasswordForgotAccepted, PasswordResetIn, PasswordChangeIn, DeviceIn, DeviceRemoveIn, InvitationCreateIn,
                              InvitationOut, InvitationAcceptIn, MemberOut, OwnershipTransferIn,
                              NotificationPreferencesIn, NotificationPreferencesOut, SessionOut, EmailVerifyIn, EmailVerificationRequestOut)
from app.schemas.reading import ReadingCreate, ReadingOut
from app.schemas.consumption import ConsumptionOut
from app.schemas.goal import GoalIn, GoalOut, GoalProgressOut
from app.schemas.contract import ContractIn, ContractOut
from app.schemas.tariff import TariffOut
from app.schemas.bill_detail import BillItemsReplace, BillItemsOut, BillAssessment
from app.schemas.ocr import OcrDraft, OcrJobOut
from app.schemas.anomaly import AnomalyRecord, AnomalyStatusIn
from app.schemas.outage import OutageIn, OutageOut, OutageSummaryOut
from app.schemas.energy_score import EnergyScoreOut
from app.schemas.recommendation import RecommendationListOut, RecommendationRecord, RecommendationStatusIn
from app.schemas.admin import (AdminOcrJobOut, AdminOcrJobsPage, OcrOperationReason,
                               AuditEventOut, AuditEventsPage, MyAccessOut, RoleAssignmentCreate,
                               RoleAssignmentOut, RoleAssignmentRevoke, RoleAssignmentsPage, RoleOut, ScopeOut)

ROOT = Path(__file__).resolve().parents[3]
MODELS = [HomeOut, BillOut, DashboardOut, EquipmentOut, EquipmentEstimateOut, AlertRecord,
          AlertSettingsOut, BillCreate, BillUpdate, EquipmentIn, AlertSettingsIn, AlertStatusUpdate,
          UserOut, TokensOut, ReadingOut, ReadingCreate, ConsumptionOut, GoalOut, GoalIn, GoalProgressOut,
          TariffOut, ContractIn, ContractOut, BillItemsReplace, BillItemsOut, BillAssessment,
          RegisterIn, AccountDeletionIn, LegalOut, PasswordForgotIn, PasswordForgotAccepted, PasswordResetIn,
          PasswordChangeIn, InvitationCreateIn, InvitationOut, InvitationAcceptIn, MemberOut, OwnershipTransferIn,
          NotificationPreferencesIn, NotificationPreferencesOut, SessionOut, EmailVerifyIn, EmailVerificationRequestOut, OcrDraft, OcrJobOut, AnomalyRecord, AnomalyStatusIn, RecommendationRecord, RecommendationStatusIn, RecommendationListOut, EnergyScoreOut, OutageIn, OutageOut, OutageSummaryOut, BillPaymentIn, DeviceIn, DeviceRemoveIn,
          AdminOcrJobOut, AdminOcrJobsPage, OcrOperationReason,
          AuditEventOut, AuditEventsPage, MyAccessOut, RoleAssignmentCreate, RoleAssignmentOut,
          RoleAssignmentRevoke, RoleAssignmentsPage, RoleOut, ScopeOut]


def _is_decimal_annotation(annotation) -> bool:
    """True si la anotación es Decimal o Decimal | None (desenvuelve Optional/Union)."""
    if annotation is Decimal:
        return True
    return any(_is_decimal_annotation(arg) for arg in typing.get_args(annotation))


def _nested_models(model, seen=None):
    """BaseModel y todo submodelo anidado alcanzable desde sus campos (recursivo, incl. listas/Optional)."""
    seen = set() if seen is None else seen
    if model in seen:
        return seen
    seen.add(model)
    for info in model.model_fields.values():
        stack = [info.annotation]
        while stack:
            annotation = stack.pop()
            if isinstance(annotation, type) and issubclass(annotation, BaseModel):
                _nested_models(annotation, seen)
            else:
                stack.extend(typing.get_args(annotation))
    return seen


# Pydantic 2.14 dejó de emitir un `pattern` distintivo para Decimal en modo serialización
# (antes: {"type": "string", "pattern": "^-?\\d+(\\.\\d+)?$"}; ahora: {"type": "string"} liso,
# indistinguible de un string normal). Se detecta por el tipo real del campo en el modelo vivo,
# no por la forma del JSON schema generado. Recorre también submodelos anidados (p. ej. `Metric`
# dentro de `DashboardOut`), que no están en MODELS por separado.
_ALL_MODELS: set[type] = set()
for _m in MODELS:
    _ALL_MODELS |= _nested_models(_m)
DECIMAL_FIELDS_BY_MODEL: dict[str, set[str]] = {
    model.__name__: {name for name, info in model.model_fields.items() if _is_decimal_annotation(info.annotation)}
    for model in _ALL_MODELS
}


def generate():
    definitions = {}
    for model in MODELS:
        schema = model.model_json_schema(mode="serialization")
        definitions.update(schema.pop("$defs", {}))
        definitions[model.__name__] = schema
    rendered = {}

    def render(schema, is_decimal=False):
        if "$ref" in schema:
            name = schema["$ref"].rsplit("/", 1)[1]
            visit(name)
            return name + "Schema"
        if "const" in schema:
            return f'z.literal({json.dumps(schema["const"])})'
        if "enum" in schema:
            return f'z.enum({json.dumps(schema["enum"])})'
        if "anyOf" in schema:
            return "z.union([" + ", ".join(render(s) for s in schema["anyOf"]) + "])"
        kind = schema.get("type")
        if kind == "null":
            return "z.null()"
        if kind == "string":
            result = "z.string()"
            fmt = schema.get("format")
            if fmt == "uuid":
                result += ".uuid()"
            elif fmt == "date":
                result += ".date()"
            elif fmt == "date-time":
                result += ".datetime({ offset: true })"
            if "pattern" in schema:
                result += f'.regex(new RegExp({json.dumps(schema["pattern"])}))'
            for key, method in [("minLength", "min"), ("maxLength", "max")]:
                if key in schema:
                    result += f'.{method}({schema[key]})'
            if is_decimal:
                # Pydantic 2.14+ ya no deja un `pattern` distintivo en el schema de Decimal (ver
                # DECIMAL_FIELDS_BY_MODEL arriba); el campo se identificó por el tipo real del modelo.
                # Se repone aquí el mismo patrón numérico que antes venía del schema, para que un
                # string no numérico (p. ej. "abc") siga rechazándose, y se acepta también un número
                # finito por compatibilidad con fixtures/clientes antiguos.
                if "pattern" not in schema:
                    result += f'.regex(new RegExp({json.dumps(r"^-?\d+(\.\d+)?$")}))'
                result = f"z.union([{result}, z.number().finite()]).transform(String)"
            return result
        if kind in {"integer", "number"}:
            result = "z.number().finite()" + (".int()" if kind == "integer" else "")
            for key, method in [("minimum", "min"), ("maximum", "max"), ("exclusiveMinimum", "gt"), ("exclusiveMaximum", "lt")]:
                if key in schema:
                    result += f'.{method}({schema[key]})'
            return result
        if kind == "boolean":
            return "z.boolean()"
        if kind == "array":
            result = f'z.array({render(schema["items"])})'
            for key, method in [("minItems", "min"), ("maxItems", "max")]:
                if key in schema:
                    result += f'.{method}({schema[key]})'
            return result
        if kind == "object":
            if "properties" not in schema:
                extra = schema.get("additionalProperties", True)
                # Bare `dict` fields (e.g. observed check values, audit snapshots) are opaque JSON objects.
                return f'z.record(z.string(), {"z.unknown()" if extra is True else render(extra)})'
            decimal_fields = DECIMAL_FIELDS_BY_MODEL.get(schema.get("title", "").replace(" ", ""), set())
            props = []
            for name, prop in schema["properties"].items():
                value = render(prop, is_decimal=name in decimal_fields)
                if name not in schema.get("required", []):
                    value += f'.default({json.dumps(prop["default"])})' if "default" in prop else ".optional()"
                props.append(f"  {json.dumps(name)}: {value}")
            return "z.object({\n" + ",\n".join(props) + "\n})"
        raise ValueError(f"Unsupported contract schema: {schema}")

    def visit(name):
        if name not in rendered:
            schema = dict(definitions[name])
            schema.setdefault("title", name)
            value = render(schema)
            rendered[name] = f"export const {name}Schema = {value};\nexport type {name} = z.infer<typeof {name}Schema>;\n"

    for name in definitions:
        visit(name)
    return '// Generated from Pydantic. Run npm run contracts:generate; do not edit.\nimport { z } from "zod";\n\n' + "\n".join(rendered.values())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    artifacts = {
        ROOT / "packages/api-contracts/src/generated.ts": generate(),
        ROOT / "packages/api-contracts/openapi.json": json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n",
    }
    for path, content in artifacts.items():
        if args.check:
            if not path.exists() or path.read_text() != content:
                raise SystemExit(f"Contract drift: regenerate {path.relative_to(ROOT)}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)


if __name__ == "__main__":
    main()
