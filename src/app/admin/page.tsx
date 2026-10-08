import { redirect } from "next/navigation";

/** /admin → the admin dashboard (signed-out visitors are sent on to /admin/login). */
export default function AdminIndex() {
  redirect("/admin/dashboard");
}
