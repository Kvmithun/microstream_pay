from pyteal import *


def approval_program():
    s_admin = Bytes("admin")
    s_receiver = Bytes("receiver")
    s_claimable = Bytes("claimable")

    spendable = ScratchVar(TealType.uint64)
    payout = ScratchVar(TealType.uint64)
    requested = ScratchVar(TealType.uint64)

    compute_spendable = spendable.store(
        If(
            Balance(Global.current_application_address()) > MinBalance(Global.current_application_address()),
            Balance(Global.current_application_address()) - MinBalance(Global.current_application_address()),
            Int(0),
        )
    )

    on_create = Seq(
        Assert(Txn.application_args.length() == Int(1)),
        App.globalPut(s_admin, Txn.sender()),
        App.globalPut(s_receiver, Txn.application_args[0]),
        App.globalPut(s_claimable, Int(0)),
        Approve(),
    )

    record = Seq(
        Assert(Txn.sender() == App.globalGet(s_admin)),
        Assert(Txn.application_args.length() == Int(2)),
        requested.store(Btoi(Txn.application_args[1])),
        Assert(requested.load() > Int(0)),
        App.globalPut(s_claimable, App.globalGet(s_claimable) + requested.load()),
        Approve(),
    )

    claim = Seq(
        Assert(Txn.sender() == App.globalGet(s_receiver)),
        compute_spendable,
        payout.store(
            If(
                App.globalGet(s_claimable) > spendable.load(),
                spendable.load(),
                App.globalGet(s_claimable),
            )
        ),
        Assert(payout.load() > Int(0)),
        InnerTxnBuilder.Begin(),
        InnerTxnBuilder.SetFields(
            {
                TxnField.type_enum: TxnType.Payment,
                TxnField.receiver: App.globalGet(s_receiver),
                TxnField.amount: payout.load(),
                TxnField.fee: Int(0),
            }
        ),
        InnerTxnBuilder.Submit(),
        App.globalPut(s_claimable, App.globalGet(s_claimable) - payout.load()),
        Approve(),
    )

    program = Cond(
        [Txn.application_id() == Int(0), on_create],
        [Txn.on_completion() == OnComplete.DeleteApplication, Return(Txn.sender() == App.globalGet(s_admin))],
        [Txn.application_args[0] == Bytes("record"), record],
        [Txn.application_args[0] == Bytes("claim"), claim],
    )

    return compileTeal(program, mode=Mode.Application, version=8)


def clear_state_program():
    return compileTeal(Approve(), mode=Mode.Application, version=8)


if __name__ == "__main__":
    with open("contract/approval.teal", "w") as f:
        f.write(approval_program())
    with open("contract/clear.teal", "w") as f:
        f.write(clear_state_program())
    print("Generated TEAL files in contract/.")
