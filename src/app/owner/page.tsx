import { redirect } from "next/navigation";

/** /owner → the owner dashboard (signed-out visitors are sent on to /owner/login). */
export default function OwnerIndex() {
  redirect("/owner/dashboard");
}
