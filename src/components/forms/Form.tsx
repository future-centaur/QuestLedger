import type { State } from '../../../shared/types';
import { isStandalone } from '../../../shared/types';
import { parsePositive } from '../../../shared/money';
import { money } from '../../format/display';

export function Form({
  modal,
  form,
  setForm,
  state,
  submit,
  busy,
}: {
  modal: string;
  form: Record<string, string>;
  setForm: (v: Record<string, string>) => void;
  state: State;
  submit: (v?: Record<string, string>) => void;
  busy: boolean;
}) {
  const f = (k: string, l: string, t = "text") => (
    <label>
      {l}
      <input
        type={t}
        min={t === "number" ? "0.01" : undefined}
        step={t === "number" ? "0.01" : undefined}
        value={form[k] || ""}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </label>
  );
  const buckets = state.buckets.map((b) => (
      <option key={b.id} value={b.name}>
        {b.name}
      </option>
    )),
    accounts = state.accounts.map((a) => (
      <option key={a.id} value={a.name}>
        {a.name}
      </option>
    ));
  if (modal === "money")
    return (
      <>
        {f("amount", "Amount to add", "number")}
        {f("location", "Where is it?")}
        <p className="formHint">
          This increases unallocated money. The location is context, not a
          separate bank balance.
        </p>
        <button
          className="primary full"
          disabled={parsePositive(form.amount) === null || busy}
          onClick={() => submit()}
        >
          Add {form.amount ? money(Number(form.amount)) : "money"}
        </button>
      </>
    );
  if (modal === "goal")
    return (
      <>
        {f("name", "Quest name")}
        {f("target", "Target amount", "number")}
        <div className="formgrid">
          <label>
            Type
            <select
              value={form.kind || "goal"}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="goal">Goal — money remains mine</option>
              <option value="expense">Expense — expected to be spent</option>
            </select>
          </label>
          <label>
            Bucket
            <select
              value={form.bucket || ""}
              onChange={(e) => setForm({ ...form, bucket: e.target.value })}
            >
              <option value="">Choose bucket</option>
              {buckets}
            </select>
          </label>
          <label>
            Location
            <select
              value={form.account || ""}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
            >
              <option value="">Optional location</option>
              {accounts}
            </select>
          </label>
        </div>
        {f("deadline", "Deadline", "date")}
        <button
          className="primary full"
          disabled={!form.name || parsePositive(form.target) === null || !form.bucket || busy}
          onClick={() => submit()}
        >
          Create quest
        </button>
      </>
    );
  if (modal === "contribute")
    return (
      <>
        {!form.goalId && (
          <label>
            Quest
            <select
              value={form.goalId || ""}
              onChange={(e) => setForm({ ...form, goalId: e.target.value })}
            >
              <option value="">Choose quest</option>
              {state.goals
                .filter((g) => isStandalone(g) && g.status === "active")
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="available">
          <span>Unallocated</span>
          <b>{money(state.unallocated)}</b>
        </div>
        {f("amount", "Amount to allocate", "number")}
        <button
          className="primary full"
          disabled={
            !form.goalId ||
            parsePositive(form.amount) === null ||
            Number(form.amount) > state.unallocated ||
            busy
          }
          onClick={() => submit()}
        >
          Allocate money
        </button>
      </>
    );
  if (modal === "spend")
    return (
      <>
        <div className="available">
          <span>Available allocation</span>
          <b>
            {money(
              form.goalId
                ? state.goals.find((g) => g.id === form.goalId)?.saved || 0
                : 0,
            )}
          </b>
        </div>
        {f("amount", "Amount spent", "number")}
        {f("reason", "What was it for?")}
        <p className="formHint">
          Spending reduces the allocation and records money leaving your
          possession.
        </p>
        <button
          className="primary full"
          disabled={
            !form.goalId || parsePositive(form.amount) === null || busy
          }
          onClick={() => submit()}
        >
          Mark spent
        </button>
      </>
    );
  if (modal === "commitment")
    return (
      <>
        {f("name", "Commitment name")}
        {f("amount", "Recurring amount", "number")}
        <div className="formgrid">
          <label>
            Frequency
            <select
              value={form.frequency || "monthly"}
              onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>
          <label>
            Type
            <select
              value={form.kind || "expense"}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="expense">Expense</option>
              <option value="goal">Goal</option>
            </select>
          </label>
          <label>
            Bucket
            <select
              value={form.bucket || ""}
              onChange={(e) => setForm({ ...form, bucket: e.target.value })}
            >
              <option value="">Choose bucket</option>
              {buckets}
            </select>
          </label>
          <label>
            Location
            <select
              value={form.account || ""}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
            >
              <option value="">Optional location</option>
              {accounts}
            </select>
          </label>
        </div>
        {["monthly", "yearly"].includes(form.frequency || "monthly") &&
          f("dueDay", "Due day of month", "number")}
        <button
          className="primary full"
          disabled={
            !form.name ||
            parsePositive(form.amount) === null ||
            !form.frequency ||
            !form.bucket ||
            busy
          }
          onClick={() => submit()}
        >
          Create funded commitment
        </button>
      </>
    );
  if (modal === "goalEdit")
    return (
      <>
        {f("name", "Quest name")}
        <div className="formgrid">
          <label>
            Type
            <select
              value={form.kind || "goal"}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="goal">Goal</option>
              <option value="expense">Expense</option>
            </select>
          </label>
          <label>
            Bucket
            <select
              value={form.bucket || ""}
              onChange={(e) => setForm({ ...form, bucket: e.target.value })}
            >
              <option value="">Choose bucket</option>
              {buckets}
            </select>
          </label>
          <label>
            Location
            <select
              value={form.account || ""}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
            >
              <option value="">Optional location</option>
              {accounts}
            </select>
          </label>
        </div>
        {f("deadline", "Deadline", "date")}
        <p className="formHint">
          This changes the quest details only. Money already allocated stays
          allocated.
        </p>
        <button
          className="primary full"
          disabled={!form.name || !form.bucket || busy}
          onClick={() => submit()}
        >
          Save quest
        </button>
      </>
    );
  if (modal === "goalTarget")
    return (
      <>
        {f("target", "New target", "number")}
        <p className="formHint">
          Increasing the target leaves allocated money untouched. If the new
          target is below the current allocation, choose where the released
          money should go.
        </p>
        {Number(form.target || 0) <
          Number(state.goals.find((g) => g.id === form.id)?.saved || 0) && (
          <label>
            Release excess to
            <select
              value={form.releaseTo || "unallocated"}
              onChange={(e) => setForm({ ...form, releaseTo: e.target.value })}
            >
              <option value="unallocated">Unallocated money</option>
              {state.goals
                .filter(
                  (g) =>
                    isStandalone(g) &&
                    g.id !== form.id &&
                    g.status !== "archived",
                )
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <button
          className="primary full"
          disabled={parsePositive(form.target) === null || busy}
          onClick={() => submit()}
        >
          Save target
        </button>
      </>
    );
  if (modal === "goalArchive") {
    const g = state.goals.find((x) => x.id === form.id);
    return (
      <>
        {g && g.saved > 0 ? (
          <>
            <p className="formHint">
              This quest still holds {money(g.saved)}. Nothing is deleted:
              choose where the allocation goes before archiving.
            </p>
            <label>
              Move remaining allocation to
              <select
                value={form.releaseTo || "unallocated"}
                onChange={(e) =>
                  setForm({ ...form, releaseTo: e.target.value })
                }
              >
                <option value="unallocated">Unallocated money</option>
                {state.goals
                  .filter(
                    (x) =>
                      isStandalone(x) &&
                      x.id !== g.id &&
                      x.status !== "archived",
                  )
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        ) : (
          <p className="formHint">
            This quest has no remaining allocation. Its history will stay in
            Archives.
          </p>
        )}
        <button
          className="primary full"
          disabled={busy}
          onClick={() => submit()}
        >
          Archive quest
        </button>
      </>
    );
  }
  if (modal === "commitmentEdit")
    return (
      <>
        {f("name", "Commitment name")}
        <div className="formgrid">
          <label>
            Type
            <select
              value={form.kind || "expense"}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="expense">Expense</option>
              <option value="goal">Goal</option>
            </select>
          </label>
          <label>
            Bucket
            <select
              value={form.bucket || ""}
              onChange={(e) => setForm({ ...form, bucket: e.target.value })}
            >
              <option value="">Choose bucket</option>
              {buckets}
            </select>
          </label>
          <label>
            Location
            <select
              value={form.account || ""}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
            >
              <option value="">Optional location</option>
              {accounts}
            </select>
          </label>
        </div>
        <p className="formHint">
          This edits commitment details only. Use Adjust for amount or frequency
          changes that begin next cycle.
        </p>
        <button
          className="primary full"
          disabled={!form.name || !form.bucket || busy}
          onClick={() => submit()}
        >
          Save commitment
        </button>
      </>
    );
  if (modal === "commitmentArchive")
    return (
      <>
        <p className="formHint">
          Archiving stops future deductions and preserves the commitment's
          history. Any reserved balance must be rebalanced first.
        </p>
        <button
          className="primary full"
          disabled={
            busy ||
            Number(
              state.commitments.find((c) => c.id === form.commitmentId)
                ?.balance || 0,
            ) > 0
          }
          onClick={() => submit()}
        >
          Archive commitment
        </button>
      </>
    );
  if (modal === "commitmentTopup")
    return (
      <>
        <div className="available">
          <span>Unallocated</span>
          <b>{money(state.unallocated)}</b>
        </div>
        {f("amount", "Top-up amount", "number")}
        <button
          className="primary full"
          disabled={
            parsePositive(form.amount) === null ||
            Number(form.amount) > state.unallocated ||
            busy
          }
          onClick={() => submit()}
        >
          Reserve money
        </button>
      </>
    );
  if (modal === "commitmentSpend")
    return (
      <>
        {f("amount", "Amount spent", "number")}
        {f("reason", "What was it for?")}
        <button
          className="primary full"
          disabled={parsePositive(form.amount) === null || busy}
          onClick={() => submit()}
        >
          Mark spent
        </button>
      </>
    );
  if (modal === "commitmentRebalance")
    return (
      <>
        {f("amount", "Amount to move", "number")}
        <label>
          Destination
          <select
            value={form.to || "unallocated"}
            onChange={(e) => setForm({ ...form, to: e.target.value })}
          >
            <option value="unallocated">Back to unallocated</option>
            {state.commitments
              .filter((c) => c.id !== form.commitmentId && !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        {f("reason", "Reason")}
        <button
          className="primary full"
          disabled={parsePositive(form.amount) === null || busy}
          onClick={() => submit()}
        >
          Rebalance
        </button>
      </>
    );
  if (modal === "commitmentAdjust")
    return (
      <>
        {f("amount", "New recurring amount", "number")}
        <label>
          New frequency
          <select
            value={form.frequency || ""}
            onChange={(e) => setForm({ ...form, frequency: e.target.value })}
          >
            <option value="">Keep current frequency</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <p className="formHint">Changes take effect on the next cycle.</p>
        <button
          className="primary full"
          disabled={
            (!form.amount && !form.frequency) ||
            (!!form.amount && parsePositive(form.amount) === null) ||
            busy
          }
          onClick={() => submit()}
        >
          Save next-cycle changes
        </button>
      </>
    );
  if (modal === "rebalance")
    return (
      <>
        <p className="muted">
          Move an allocation between standalone quests, record an expense, or
          remove an allocation from tracking.
        </p>
        <label>
          What happened?
          <select
            value={form.kind || "transfer"}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            <option value="transfer">Move to another quest</option>
            <option value="expense">Record an expense</option>
            <option value="withdrawal">Remove from tracking</option>
          </select>
        </label>
        <label>
          Source quest
          <select
            value={form.from || ""}
            onChange={(e) => setForm({ ...form, from: e.target.value })}
          >
            <option value="">Choose quest</option>
            {state.goals
              .filter((g) => isStandalone(g) && g.status !== "archived")
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </label>
        {(form.kind || "transfer") === "transfer" && (
          <label>
            Destination quest
            <select
              value={form.to || ""}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            >
              <option value="">Choose quest</option>
              {state.goals
                .filter((g) => isStandalone(g) && g.status !== "archived")
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {f("amount", "Amount", "number")}
        {f("reason", "Description")}
        <button
          className="primary full"
          disabled={
            !form.from ||
            parsePositive(form.amount) === null ||
            ((form.kind || "transfer") === "transfer" && !form.to) ||
            busy
          }
          onClick={() => submit()}
        >
          Record adjustment
        </button>
      </>
    );
  return (
    <>
      {f("name", modal === "account" ? "Account/location name" : "Bucket name")}
      <button
        className="primary full"
        disabled={!form.name || busy}
        onClick={() => submit(form)}
      >
        Add
      </button>
    </>
  );
}
