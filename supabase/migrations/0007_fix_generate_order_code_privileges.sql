-- Bug found during testing: 0005 revoked EXECUTE on generate_order_code() from
-- authenticated as a defensive hardening step, but orders_set_order_code() (the
-- BEFORE INSERT trigger) calls it as the invoking role (no SECURITY DEFINER in this
-- chain), so every authenticated order INSERT started failing with "permission
-- denied for function generate_order_code" instead of ever reaching the intended
-- RLS check. Restore EXECUTE for authenticated (needed for real order creation);
-- anon still has no orders INSERT policy at all, so leaving anon revoked is fine.
grant execute on function public.generate_order_code(uuid) to authenticated;
