"""Export OpenAPI and runtime TS schemas from Pydantic; --check detects drift.

No database connection is needed. Unsupported schema constructs fail generation.
Cross-field business validators remain authoritative in Python/API tests.
"""
import argparse
import json
from pathlib import Path

from app.main import app
from app.schemas.home import HomeOut
from app.schemas.bill import BillOut, BillCreate, BillUpdate
from app.schemas.dashboard import DashboardOut
from app.schemas.equipment import EquipmentOut, EquipmentEstimateOut, EquipmentIn
from app.schemas.alert import AlertRecord, AlertSettingsOut, AlertSettingsIn, AlertStatusUpdate
from app.schemas.auth import (UserOut, TokensOut, RegisterIn, AccountDeletionIn, LegalOut, PasswordForgotIn,
                              PasswordForgotAccepted, PasswordResetIn, PasswordChangeIn, InvitationCreateIn,
                              InvitationOut, InvitationAcceptIn, MemberOut, OwnershipTransferIn)
from app.schemas.reading import ReadingCreate, ReadingOut
from app.schemas.consumption import ConsumptionOut
from app.schemas.goal import GoalIn, GoalOut, GoalProgressOut
from app.schemas.contract import ContractIn, ContractOut
from app.schemas.tariff import TariffOut
from app.schemas.bill_detail import BillItemsReplace, BillItemsOut, BillAssessment
from app.schemas.ocr import OcrDraft
from app.schemas.anomaly import AnomalyRecord

ROOT = Path(__file__).resolve().parents[3]
MODELS = [HomeOut, BillOut, DashboardOut, EquipmentOut, EquipmentEstimateOut, AlertRecord,
          AlertSettingsOut, BillCreate, BillUpdate, EquipmentIn, AlertSettingsIn, AlertStatusUpdate,
          UserOut, TokensOut, ReadingOut, ReadingCreate, ConsumptionOut, GoalOut, GoalIn, GoalProgressOut,
          TariffOut, ContractIn, ContractOut, BillItemsReplace, BillItemsOut, BillAssessment,
          RegisterIn, AccountDeletionIn, LegalOut, PasswordForgotIn, PasswordForgotAccepted, PasswordResetIn,
          PasswordChangeIn, InvitationCreateIn, InvitationOut, InvitationAcceptIn, MemberOut, OwnershipTransferIn,
          OcrDraft, AnomalyRecord]


def generate():
    definitions = {}
    for model in MODELS:
        schema = model.model_json_schema(mode="serialization")
        definitions.update(schema.pop("$defs", {}))
        definitions[model.__name__] = schema
    rendered = {}

    def render(schema):
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
                # Decimal serialization schemas have a pattern and no maxLength.
                # Accept finite numeric responses for compatibility with older fixtures.
                if "\\d" in schema["pattern"]:
                    result = f"z.union([{result}, z.number().finite()]).transform(String)"
            for key, method in [("minLength", "min"), ("maxLength", "max")]:
                if key in schema:
                    result += f'.{method}({schema[key]})'
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
            props = []
            for name, prop in schema["properties"].items():
                value = render(prop)
                if name not in schema.get("required", []):
                    value += f'.default({json.dumps(prop["default"])})' if "default" in prop else ".optional()"
                props.append(f"  {json.dumps(name)}: {value}")
            return "z.object({\n" + ",\n".join(props) + "\n})"
        raise ValueError(f"Unsupported contract schema: {schema}")

    def visit(name):
        if name not in rendered:
            value = render(definitions[name])
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
