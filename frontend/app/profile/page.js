// Redirect /profile → /settings (merged into one page)
import { redirect } from "next/navigation";
export default function ProfilePage() {
  redirect("/settings");
}
