from pyteal import *


def approval_program():
    s_sender = Bytes("sender")
    s_receiver = Bytes("receiver")
    s_rate = Bytes("rate")
    s_start = Bytes("start")
    s_last = Bytes("last")
    s_owed = Bytes("owed")
    s_end = Bytes("end")
    s_status = Bytes("status")

    status_idle = Int(0)
    status_active = Int(1)
    status_paused = Int(2)
    status_stopped = Int(3)

    current_due = ScratchVar(TealType.uint64)
    spendable = ScratchVar(TealType.uint64)
    payout = ScratchVar(TealType.uint64)

    accrued_since_last = If(
        App.globalGet(s_status) == status_active,
        (Global.round() - App.globalGet(s_last)) * App.globalGet(s_rate),
        Int(0),
    )

    total_due = App.globalGet(s_owed) + accrued_since_last

    compute_spendable = spendable.store(
        If(
            Balance(Global.current_application_address()) > MinBalance(Global.current_application_address()),
            Balance(Global.current_application_address()) - MinBalance(Global.current_application_address()),
            Int(0),
        )
    )

    compute_payout = payout.store(
        If(total_due > spendable.load(), spendable.load(), total_due)
    )

    pay_receiver_if_needed = If(
        payout.load() > Int(0),
        Seq(
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
        ),
    )

    handle_creation = Seq(
        [
            App.globalPut(s_sender, Txn.sender()),
            App.globalPut(s_rate, Int(0)),
            App.globalPut(s_start, Int(0)),
            App.globalPut(s_last, Int(0)),
            App.globalPut(s_owed, Int(0)),
            App.globalPut(s_end, Int(0)),
            App.globalPut(s_status, status_idle),
            Approve(),
        ]
    )

    create_stream = Seq(
        [
            Assert(Txn.sender() == App.globalGet(s_sender)),
            Assert(
                Or(
                    App.globalGet(s_status) == status_idle,
                    And(
                        App.globalGet(s_status) == status_stopped,
                        App.globalGet(s_owed) == Int(0),
                    ),
                )
            ),
            Assert(Txn.application_args.length() == Int(3)),
            Assert(Global.group_size() == Int(2)),
            Assert(Gtxn[0].type_enum() == TxnType.Payment),
            Assert(Gtxn[0].sender() == App.globalGet(s_sender)),
            Assert(Gtxn[0].receiver() == Global.current_application_address()),
            Assert(Gtxn[0].amount() > Int(0)),
            Assert(Txn.group_index() == Int(1)),
            App.globalPut(s_receiver, Txn.application_args[1]),
            App.globalPut(s_rate, Btoi(Txn.application_args[2])),
            App.globalPut(s_start, Global.round()),
            App.globalPut(s_last, Global.round()),
            App.globalPut(s_owed, Int(0)),
            App.globalPut(s_end, Int(0)),
            App.globalPut(s_status, status_active),
            Approve(),
        ]
    )

    claim = Seq(
        [
            Assert(App.globalGet(s_status) != status_idle),
            Assert(Txn.sender() == App.globalGet(s_receiver)),
            current_due.store(total_due),
            compute_spendable,
            compute_payout,
            Assert(payout.load() > Int(0)),
            pay_receiver_if_needed,
            App.globalPut(s_owed, current_due.load() - payout.load()),
            App.globalPut(
                s_last,
                If(
                    App.globalGet(s_status) == status_stopped,
                    App.globalGet(s_end),
                    Global.round(),
                ),
            ),
            Approve(),
        ]
    )

    pause = Seq(
        [
            Assert(Txn.sender() == App.globalGet(s_sender)),
            Assert(App.globalGet(s_status) == status_active),
            App.globalPut(s_owed, total_due),
            App.globalPut(s_last, Global.round()),
            App.globalPut(s_status, status_paused),
            Approve(),
        ]
    )

    resume = Seq(
        [
            Assert(Txn.sender() == App.globalGet(s_sender)),
            Assert(App.globalGet(s_status) == status_paused),
            App.globalPut(s_last, Global.round()),
            App.globalPut(s_end, Int(0)),
            App.globalPut(s_status, status_active),
            Approve(),
        ]
    )

    stop = Seq(
        [
            Assert(Txn.sender() == App.globalGet(s_sender)),
            Assert(App.globalGet(s_status) != status_idle),
            App.globalPut(s_owed, total_due),
            App.globalPut(s_last, Global.round()),
            App.globalPut(s_end, Global.round()),
            App.globalPut(s_status, status_stopped),
            Approve(),
        ]
    )

    program = Cond(
        [Txn.application_id() == Int(0), handle_creation],
        [
            Txn.on_completion() == OnComplete.DeleteApplication,
            Return(Txn.sender() == App.globalGet(s_sender)),
        ],
        [Txn.application_args[0] == Bytes("create"), create_stream],
        [Txn.application_args[0] == Bytes("claim"), claim],
        [Txn.application_args[0] == Bytes("pause"), pause],
        [Txn.application_args[0] == Bytes("resume"), resume],
        [Txn.application_args[0] == Bytes("stop"), stop],
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
