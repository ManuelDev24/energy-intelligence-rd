from decimal import Decimal
from sqlalchemy import delete, select
from app.services.audit import record_change
from app.services.transactions import write_transaction
from app.models.bill_detail import BillItem, BillSnapshot
from app.models.audit import AuditEvent
from app.schemas.bill_detail import BillItemsOut, BillAssessment
from app.schemas.bill import MAX_PERIOD_DAYS
from app.services.bills import get_bill
from app.services.transactions import require_home


def replace_items(db, home_id, bill_id, payload):
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        bill = get_bill(db, home_id, bill_id)
        before = {"items": [i.model_dump(mode="json") for i in get_items(db, home_id, bill_id).items]}
        db.execute(delete(BillItem).where(BillItem.bill_id == bill_id))
        for position, item in enumerate(payload.items):
            db.add(BillItem(bill_id=bill_id, position=position, label=item.label, kind=item.kind,
                            amount_dop=item.amount_dop.quantize(Decimal("0.01"))))
        db.flush()
        result = get_items(db, home_id, bill_id)
        record_change(db, home_id, bill, "replace", before, entity="bill_items",
                      after={"items": [i.model_dump(mode="json") for i in result.items]})
    return result


def assess_bill(db, home_id, bill_id):
    # Same serialization lock as bill edits/replacements: a coherent multi-query view.
    # No commit, mutation, audit event or persisted approval on this path.
    require_home(db, home_id, lock=True)
    bill = get_bill(db, home_id, bill_id)
    detail = get_items(db, home_id, bill_id)
    elapsed = (bill.period_end - bill.period_start).days
    checks = []

    def check(code, status, **observed):
        checks.append({"code": code, "status": status, "observed": observed})

    check("period_order", "pass" if elapsed >= 0 else "warning",
          period_start=bill.period_start.isoformat(), period_end=bill.period_end.isoformat())
    check("period_duration", "pass" if 0 <= elapsed <= MAX_PERIOD_DAYS else "warning",
          elapsed_days=elapsed, maximum_elapsed_days=MAX_PERIOD_DAYS)
    check("days_consistency", "pass" if bill.days in (elapsed, elapsed + 1) and 0 <= bill.days <= MAX_PERIOD_DAYS else "warning",
          declared_days=bill.days, elapsed_days=elapsed, inclusive_days=elapsed + 1, convention="unspecified")
    previous, current = bill.reading_previous, bill.reading_current
    delta = None if previous is None or current is None else current - previous
    check("readings_kwh", "unavailable" if delta is None else
          ("pass" if previous >= 0 and current >= previous and delta == bill.kwh else "warning"),
          reading_previous=None if previous is None else str(previous),
          reading_current=None if current is None else str(current),
          readings_delta_kwh=None if delta is None else str(delta), kwh=str(bill.kwh))
    check("items_sum", "unavailable" if detail.items_total_dop is None else
          ("pass" if detail.difference_dop == 0 else "warning"),
          items_total_dop=None if detail.items_total_dop is None else str(detail.items_total_dop),
          bill_amount_dop=str(detail.bill_amount_dop),
          difference_dop=None if detail.difference_dop is None else str(detail.difference_dop))
    original = db.get(BillSnapshot, bill_id)
    provenance = {"origin": "unknown" if original is None else original.origin,
                  "original_available": original is not None and original.origin == "creation",
                  "data": None if original is None else original.data,
                  "captured_at": None if original is None else original.captured_at}
    warnings = [c["code"] for c in checks if c["status"] == "warning"]
    if not provenance["original_available"]:
        warnings.append("original_unknown" if original is None else "original_unverified")
    events = list(db.scalars(select(AuditEvent).where(
        AuditEvent.home_id == home_id, AuditEvent.entity_id == bill_id,
        AuditEvent.entity.in_(["bills", "bill_items"]), AuditEvent.operation.in_(["update", "replace"])
    ).order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).limit(101)))
    corrections = [{"entity": event.entity, "operation": event.operation, "before": event.before,
                    "after": event.after, "created_at": event.created_at} for event in reversed(events[:100])]
    return BillAssessment(home_id=home_id, bill_id=bill_id,
        status="warnings" if warnings else ("incomplete" if any(c["status"] == "unavailable" for c in checks) else "consistent"),
        checks=checks, warnings=warnings, provenance=provenance, corrections=corrections,
        corrections_has_more=len(events) > 100, detail=detail)


def get_items(db, home_id, bill_id):
    require_home(db, home_id, lock=True)
    bill = get_bill(db, home_id, bill_id)
    items = list(db.scalars(select(BillItem).where(BillItem.bill_id == bill_id).order_by(BillItem.position)))
    total = sum((item.amount_dop for item in items), Decimal("0.00")) if items else None
    return BillItemsOut(home_id=home_id, bill_id=bill_id, items=items, items_total_dop=total,
                        bill_amount_dop=bill.amount_dop,
                        difference_dop=None if total is None else total - bill.amount_dop)
