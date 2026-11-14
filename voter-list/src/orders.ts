// The price slot. The price of the first frozen list is still to be confirmed by the owner (PRICE_INR unset = free; nothing is ever charged here).
// Payments will go only through IT SERVICES BY RAJAT AGARWAL on Razorpay; that gateway is deliberately not wired in this repository.
import { HttpError } from "./auth";
import { commit, guardChanged, staffActor } from "./audit";
import { uid } from "./db";
import { need, type StaffCtx } from "./store";

export async function createOrder(ctx: StaffCtx) {
  need(ctx, "orders");
  if (!ctx.env.PRICE_INR) throw new HttpError(409, "No price is set, so freezing is free. Nothing to pay.", "no_price");
  const paise = Math.round(Number(ctx.env.PRICE_INR) * 100);
  if (!Number.isFinite(paise) || paise <= 0) throw new HttpError(500, "The price is not set correctly.");
  const open = () => ctx.env.DB.prepare("SELECT id, amount_paise, status FROM orders WHERE society_id = ? AND purpose = 'save_version_1' AND used_for_version IS NULL").bind(ctx.society.id).first<{ id: string; amount_paise: number; status: string }>();
  const had = await open();
  if (had) return { id: had.id, amountPaise: had.amount_paise, status: had.status, test: true, reused: true, gateway: "not connected (test mode only)" };
  const id = uid("ord");
  try {
    await commit(ctx.env, ctx.society.id, [ctx.env.DB.prepare("INSERT INTO orders (id, society_id, purpose, amount_paise, status, test, created_by, created_at) VALUES (?, ?, 'save_version_1', ?, 'created', 1, ?, ?)").bind(id, ctx.society.id, paise, ctx.email, ctx.now)], "order.created", await staffActor(ctx.env, ctx.email, ctx.role), { order: id, amountPaise: paise, test: 1 }, ctx.now);
  } catch (e) {
    const again = /uq_order_open|UNIQUE/i.test(String((e as Error)?.message)) ? await open() : null;
    if (!again) throw e;
    return { id: again.id, amountPaise: again.amount_paise, status: again.status, test: true, reused: true, gateway: "not connected (test mode only)" };
  }
  return { id, amountPaise: paise, status: "created", test: true, reused: false, gateway: "not connected (test mode only)" };
}
export async function testPay(ctx: StaffCtx, orderId: string) {
  need(ctx, "orders");
  if (ctx.env.TEST_MODE !== "1") throw new HttpError(503, "The payment gateway is not connected yet. Nothing was charged.", "gateway_off");
  const o = await ctx.env.DB.prepare("SELECT id FROM orders WHERE id = ? AND society_id = ?").bind(orderId, ctx.society.id).first<{ id: string }>();
  if (!o) throw new HttpError(404, "Not found.", "not_found");
  await commit(ctx.env, ctx.society.id, [ctx.env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'created'").bind(ctx.now, orderId), guardChanged(ctx.env, "That order is not waiting for payment.")], "order.test_paid", await staffActor(ctx.env, ctx.email, ctx.role), { order: orderId, test: 1 }, ctx.now);
  return { id: orderId, status: "paid", test: true };
}
