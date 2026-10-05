from app.models.contract import Contract
from app.services.audit import record_change, snapshot
from app.services.errors import NotFound
from app.services.transactions import require_home, write_transaction


def get_contract(db, home_id):
    contract = db.get(Contract, home_id)
    if contract is None:
        raise NotFound('Contrato no encontrado')
    return contract


def put_contract(db, home_id, payload):
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        contract = db.get(Contract, home_id)
        if contract is None:
            contract = Contract(home_id=home_id, account_number=payload.account_number)
            db.add(contract)
            before = None
        else:
            before = snapshot(contract)
            contract.account_number = payload.account_number
        record_change(db, home_id, contract, 'create' if before is None else 'update', before)
    return contract
